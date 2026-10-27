
const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const router = express.Router();

const allowedTables = new Set([
  "stores", "aisles", "products", "inventory",
  "customers", "bank_accounts", "tax_rules",
  "sales", "sale_items", "payments"
]);

const tableRef = {
  stores:'public.stores', aisles:'public.aisles', products:'public.products',
  inventory:'public.inventory', customers:'public.customers', tax_rules:'public.tax_rules',
  sales:'public.sales', sale_items:'public.sale_items', payments:'public.payments',
  bank_accounts:'bank.bank_accounts'
};

function errorResponse(res, error) {
  console.error(error);
  return res.status(500).json({
    success: false,
    message: error.message
  });
}

// Create PostgreSQL tables
router.post("/api/admin/create-tables", async (req, res) => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "schema.sql"), "utf8"
    );
    await pool.query(sql);
    res.json({ success: true, message: "Database tables created." });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Initialize sample data
router.post("/api/admin/initialize-lookups", async (req, res) => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "seed.sql"), "utf8"
    );
    await pool.query(sql);
    res.json({ success: true, message: "Lookup data initialized." });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Browse a database table
router.get("/api/admin/browse", async (req, res) => {
  try {
    const table = req.query.table;
    if (!allowedTables.has(table)) {
      return res.status(400).json({
        success: false, message: "Invalid table."
      });
    }

    const limit = Math.min(
      100, Math.max(1, Number(req.query.limit) || 10)
    );

    const result = await pool.query(
      `SELECT * FROM ${tableRef[table]} LIMIT $1`, [limit]
    );

    res.json({ success: true, rows: result.rows });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Delete rows from a selected table
router.post("/api/admin/clear-table", async (req, res) => {
  try {
    const table = req.body.table;

    if (!allowedTables.has(table)) {
      return res.status(400).json({
        success: false, message: "Invalid table."
      });
    }

    await pool.query(`TRUNCATE ${tableRef[table]} RESTART IDENTITY CASCADE`);

    res.json({
      success: true,
      message: `Rows deleted from ${table}.`
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Real supermarket checkout
router.post("/api/checkout", async (req, res) => {
  const { storeId, paymentMethod, bankAccountId, itemCount, customerId } = req.body;
  const store = Number(storeId);
  const count = Number(itemCount);
  const method = String(paymentMethod).toUpperCase();
  const account = Number(bankAccountId);

  if (!Number.isInteger(store) || !Number.isInteger(count) ||
      count < 10 || count > 20 || !["CARD", "CASH"].includes(method)) {
    return res.status(400).json({ success: false, message: "Invalid checkout information." });
  }
  if (method === "CARD" && (!Number.isInteger(account) || account < 1)) {
    return res.status(400).json({ success: false, message: "Card payments require a bank account." });
  }

  const client = await pool.connect();
  const log = [];
  // run a statement and record it (with values filled in) for the SQL trace panel
  const run = (sql, params = []) => {
    log.push(sql.trim().replace(/\$(\d+)/g, (_, n) => {
      const v = params[n - 1];
      return typeof v === "string" ? `'${v}'` : String(v);
    }) + ";");
    return client.query(sql, params);
  };

  try {
    await run("BEGIN");

    const st = await run("SELECT store_name FROM stores WHERE store_id = $1", [store]);
    if (!st.rowCount) {
      throw new Error("Store not found. Run Create Tables and Initialize Lookup Tables first.");
    }

    // 1. Random cart, priced and taxed in SQL
    await run(`
      CREATE TEMP TABLE cart (
        line_number INT, product_id INT, quantity NUMERIC(10,2),
        unit_price NUMERIC(10,2), subtotal NUMERIC(12,2), tax NUMERIC(12,2)
      ) ON COMMIT DROP`);

    await run(`
      INSERT INTO cart
      SELECT row_number() OVER (ORDER BY product_id), product_id, quantity, unit_price,
             ROUND(quantity * unit_price, 2),
             CASE WHEN tax_exempt THEN 0
                  ELSE ROUND(ROUND(quantity * unit_price, 2) * tax_rate, 2) END
      FROM (
        SELECT p.product_id, p.unit_price, p.tax_exempt, tr.tax_rate,
               CASE WHEN p.unit = 'lb' THEN ROUND((0.6 + random() * 2.2)::numeric, 2)
                    ELSE (1 + floor(random() * 3))::numeric END AS quantity
        FROM inventory i
        JOIN products  p  ON p.product_id = i.product_id
        JOIN stores    s  ON s.store_id   = i.store_id
        JOIN tax_rules tr ON tr.state     = s.state
        WHERE i.store_id = $1 AND i.stock_quantity >= 3
        ORDER BY random()
        LIMIT $2
      ) picked`, [store, count]);

    const t = (await run(`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(subtotal),0) AS subtotal,
             COALESCE(SUM(tax),0) AS tax, COALESCE(SUM(subtotal + tax),0) AS total
      FROM cart`)).rows[0];
    if (t.n !== count) throw new Error("Not enough products in stock at this store.");

    // 2. Lock stock rows in a fixed order (prevents deadlocks between checkouts)
    await run(`
      SELECT 1 FROM inventory
      WHERE store_id = $1 AND product_id IN (SELECT product_id FROM cart)
      ORDER BY product_id FOR UPDATE`, [store]);

    // 3. Bank debit + ledger (card only)
    let balanceAfter = null;
    if (method === "CARD") {
      const debit = await run(`
        UPDATE bank.bank_accounts SET balance = balance - $1
        WHERE account_id = $2 AND balance >= $1
        RETURNING balance`, [t.total, account]);
      if (!debit.rowCount) throw new Error("Bank account not found or insufficient funds.");
      balanceAfter = Number(debit.rows[0].balance);

      await run(`
        INSERT INTO bank.bank_transactions (account_id, amount, tx_type, reference)
        VALUES ($1, $2, 'WITHDRAWAL', $3)`, [account, t.total, `SUPERMART STORE ${store}`]);
    }

    // 4. Sale header, receipt lines, stock, payment
    const sale = (await run(`
      INSERT INTO sales (store_id, customer_id, subtotal, tax_total, total, payment_method)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING sale_id, created_at`,
      [store, customerId || null, t.subtotal, t.tax, t.total, method])).rows[0];

    await run(`
      INSERT INTO sale_items
        (sale_id, line_number, product_id, quantity, unit_price, subtotal, tax, line_total)
      SELECT $1::int, line_number, product_id, quantity, unit_price, subtotal, tax, subtotal + tax
      FROM cart`, [sale.sale_id]);

    const upd = await run(`
      UPDATE inventory i SET stock_quantity = i.stock_quantity - c.quantity
      FROM cart c
      WHERE i.store_id = $1 AND i.product_id = c.product_id
        AND i.stock_quantity >= c.quantity`, [store]);
    if (upd.rowCount !== count) throw new Error("Insufficient stock for one or more items.");

    await run(`
      INSERT INTO payments (sale_id, method, amount, bank_account_id, status)
      VALUES ($1,$2,$3,$4,'SUCCESS')`,
      [sale.sale_id, method, t.total, method === "CARD" ? account : null]);

    // 5. Receipt lines (read before COMMIT because the temp table drops at commit)
    const items = (await run(`
      SELECT p.sku, p.product_name, p.unit, p.tax_exempt,
             c.quantity::float8 AS quantity, c.unit_price::float8 AS unit_price,
             c.subtotal::float8 AS subtotal, c.tax::float8 AS tax,
             (c.subtotal + c.tax)::float8 AS line_total
      FROM cart c JOIN products p ON p.product_id = c.product_id
      ORDER BY c.line_number`)).rows;

    await run("COMMIT");

    res.json({
      success: true,
      receipt: {
        sale_id: sale.sale_id,
        store_name: st.rows[0].store_name,
        store_id: store,
        payment_method: method,
        subtotal: Number(t.subtotal),
        tax_total: Number(t.tax),
        total: Number(t.total),
        bank_balance_after: balanceAfter,
        created_at: sale.created_at,
        items
      },
      sqlTrace: log.join("\n")
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "42P01") error.message = "Tables are missing. Run Create Tables, then Initialize Lookup Tables.";
    if (error.code === "23503") error.message = "Customer ID does not exist.";
    errorResponse(res, error);
  } finally {
    client.release();
  }
});

// Three JOIN queries for the back office
router.get("/api/reports/summary", async (req, res) => {
  try {
    const file = fs.readFileSync(path.join(__dirname, "query.sql"), "utf8");
    const reports = [];

    // split on ";" at end of line, then separate the title comment from the SQL
    for (const block of file.split(/;\s*(?:\r?\n|$)/)) {
      const lines = block.split(/\r?\n/);
      const title = (lines.find(l => l.startsWith("-- Query")) || "").replace(/^--\s*/, "");
      const sql = lines.filter(l => !l.trim().startsWith("--")).join("\n").trim();
      if (!sql) 
        continue;
      const result = await pool.query(sql);
      reports.push({ 
        title, rows: result.rows 
      });
    }

    res.json({
      success: true,
      message: `${reports.length} PostgreSQL JOIN reports completed.`,
      reports,
      sqlTrace: file
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
