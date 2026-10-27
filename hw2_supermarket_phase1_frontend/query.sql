-- Query 1: Revenue, tax collected and sales count by state (3 tables, GROUP BY)
-- Business question: which states bring in the most money, and how much tax do we owe each one?
SELECT st.state,
       tr.tax_rate,
       COUNT(sa.sale_id)              AS sales_count,
       SUM(sa.subtotal)               AS merchandise_revenue,
       SUM(sa.tax_total)              AS tax_collected,
       SUM(sa.total)                  AS total_revenue
FROM sales sa
JOIN stores    st ON st.store_id = sa.store_id
JOIN tax_rules tr ON tr.state    = st.state
GROUP BY st.state, tr.tax_rate
ORDER BY total_revenue DESC;

-- Query 2: Top-selling products by revenue (3 tables, GROUP BY)
-- Business question: what sells best? Quantity is pounds for by-weight items, units otherwise.
SELECT p.sku,
       p.product_name,
       p.category,
       p.unit,
       SUM(si.quantity)    AS quantity_sold,
       SUM(si.line_total)  AS revenue
FROM sale_items si
JOIN products p ON p.product_id = si.product_id
JOIN sales    s ON s.sale_id    = si.sale_id
GROUP BY p.product_id, p.sku, p.product_name, p.category, p.unit
ORDER BY revenue DESC
LIMIT 10;

-- Query 3: Lowest stock per store with shelf location (4 tables)
-- Business question: what must be restocked first, and in which aisle?
SELECT s.store_name,
       s.state,
       a.aisle_number,
       a.aisle_name,
       p.product_name,
       i.stock_quantity
FROM inventory i
JOIN stores   s ON s.store_id   = i.store_id
JOIN products p ON p.product_id = i.product_id
JOIN aisles   a ON a.aisle_id   = i.aisle_id
ORDER BY i.stock_quantity ASC, s.store_id
LIMIT 10;

-- Query 4: Card vs cash totals by state (3 tables, GROUP BY)
-- Business question: how do customers pay in each state?
SELECT st.state,
       pay.method,
       COUNT(*)        AS payments,
       SUM(pay.amount) AS amount_collected
FROM payments pay
JOIN sales  sa ON sa.sale_id  = pay.sale_id
JOIN stores st ON st.store_id = sa.store_id
WHERE pay.status = 'SUCCESS'
GROUP BY st.state, pay.method
ORDER BY st.state, pay.method;

-- Query 5: Card spending per bank account, store side vs bank side (cross-schema join)
-- Business question: do the store's card payments reconcile with the bank's ledger?
SELECT ba.account_id,
       ba.holder_name,
       ba.balance                        AS current_balance,
       COUNT(pay.payment_id)             AS card_purchases,
       COALESCE(SUM(pay.amount), 0)      AS spent_at_supermart
FROM bank.bank_accounts ba
LEFT JOIN payments pay
       ON pay.bank_account_id = ba.account_id
      AND pay.method = 'CARD'
GROUP BY ba.account_id, ba.holder_name, ba.balance
ORDER BY spent_at_supermart DESC, ba.account_id
LIMIT 10;

-- Query 6: Receipt lookup - full detail of the most recent sale (4 tables)
SELECT sa.sale_id,
       st.store_name,
       si.line_number,
       p.sku,
       p.product_name,
       si.quantity,
       p.unit,
       si.unit_price,
       si.tax,
       si.line_total,
       sa.total AS receipt_total,
       sa.payment_method
FROM sales sa
JOIN stores     st ON st.store_id = sa.store_id
JOIN sale_items si ON si.sale_id  = sa.sale_id
JOIN products   p  ON p.product_id = si.product_id
WHERE sa.sale_id = (SELECT MAX(sale_id) FROM sales)
ORDER BY si.line_number;
