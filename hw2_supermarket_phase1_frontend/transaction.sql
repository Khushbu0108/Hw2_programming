-- =====================================================================
-- SuperMart Chain | COSC 3380 HW2 Phase 1 | transaction.sql
-- The checkout transaction. The Node backend (POST /api/checkout) runs
-- the SAME statements, in the SAME order, with $1,$2... parameters and
-- values computed in JavaScript. Here the values are written out for
-- one concrete receipt so the file can be run directly with psql:
--
--   Store 1 (Houston, TX, tax 8.25%), CARD, bank account 1
--   line 1: 2 x Milk    (product 4)  3.49 each, taxable  -> 6.98 + 0.58 tax = 7.56
--   line 2: 2.00 lb Apples (product 1) 1.99/lb, tax exempt -> 3.98 + 0.00 tax = 3.98
--   subtotal 10.96 + tax 0.58 = total 11.54
--
-- Tables written in ONE atomic transaction (7 writes across 6 tables):
--   bank.bank_accounts (debit)   bank.bank_transactions (ledger)
--   sales   sale_items   inventory   payments
-- Any error (insufficient funds, insufficient stock, constraint failure)
-- aborts the whole block and everything is rolled back.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART 1: successful CARD checkout  (COMMITs)
-- ---------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    v_sale_id  INTEGER;
    v_total    NUMERIC(12,2) := 11.54;
BEGIN
    -- 1. Lock the stock rows being sold (fixed order avoids deadlocks)
    PERFORM 1 FROM inventory
     WHERE store_id = 1 AND product_id IN (1, 4)
     ORDER BY product_id
     FOR UPDATE;

    -- 2. Debit the bank account; the WHERE guard rejects overdrafts
    UPDATE bank.bank_accounts
       SET balance = balance - v_total
     WHERE account_id = 1 AND balance >= v_total;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account not found or insufficient funds';
    END IF;

    -- 3. Bank ledger entry
    INSERT INTO bank.bank_transactions (account_id, amount, tx_type, reference)
    VALUES (1, v_total, 'WITHDRAWAL', 'SUPERMART STORE 1');

    -- 4. Sale header
    INSERT INTO sales (store_id, customer_id, subtotal, tax_total, total, payment_method)
    VALUES (1, NULL, 10.96, 0.58, v_total, 'CARD')
    RETURNING sale_id INTO v_sale_id;

    -- 5. Receipt lines (price + quantity/weight preserved)
    INSERT INTO sale_items
        (sale_id, line_number, product_id, quantity, unit_price, subtotal, tax, line_total)
    VALUES
        (v_sale_id, 1, 4, 2.00, 3.49, 6.98, 0.58, 7.56),
        (v_sale_id, 2, 1, 2.00, 1.99, 3.98, 0.00, 3.98);

    -- 6. Reduce stock (CHECK stock_quantity >= 0 is the final safety net)
    UPDATE inventory SET stock_quantity = stock_quantity - 2.00
     WHERE store_id = 1 AND product_id = 4 AND stock_quantity >= 2.00;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for product 4'; END IF;

    UPDATE inventory SET stock_quantity = stock_quantity - 2.00
     WHERE store_id = 1 AND product_id = 1 AND stock_quantity >= 2.00;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for product 1'; END IF;

    -- 7. Payment record
    INSERT INTO payments (sale_id, method, amount, bank_account_id, status)
    VALUES (v_sale_id, 'CARD', v_total, 1, 'SUCCESS');
END $$;

COMMIT;


-- ---------------------------------------------------------------------
-- PART 2: FAILING card checkout - account 3 holds only $5.00
-- The debit guard finds no row, RAISE EXCEPTION aborts the block, and
-- ROLLBACK leaves sales, sale_items, inventory, payments and the bank
-- tables exactly as they were.
-- ---------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    v_sale_id  INTEGER;
    v_total    NUMERIC(12,2) := 11.54;
BEGIN
    UPDATE bank.bank_accounts
       SET balance = balance - v_total
     WHERE account_id = 3 AND balance >= v_total;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account not found or insufficient funds';
    END IF;
    -- (never reached: remaining statements identical to PART 1)
END $$;

ROLLBACK;   -- psql: the transaction is already aborted; this closes it


-- ---------------------------------------------------------------------
-- PART 3: CASH checkout - same tables EXCEPT no bank debit / ledger row,
-- and payments.bank_account_id is NULL.  (Store 26 Phoenix, AZ, 5.60%)
--   1 x Bread (product 5) 2.79 taxable -> 2.79 + 0.16 = 2.95
-- ---------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    v_sale_id  INTEGER;
BEGIN
    PERFORM 1 FROM inventory WHERE store_id = 26 AND product_id = 5 FOR UPDATE;

    INSERT INTO sales (store_id, customer_id, subtotal, tax_total, total, payment_method)
    VALUES (26, NULL, 2.79, 0.16, 2.95, 'CASH')
    RETURNING sale_id INTO v_sale_id;

    INSERT INTO sale_items
        (sale_id, line_number, product_id, quantity, unit_price, subtotal, tax, line_total)
    VALUES (v_sale_id, 1, 5, 1.00, 2.79, 2.79, 0.16, 2.95);

    UPDATE inventory SET stock_quantity = stock_quantity - 1.00
     WHERE store_id = 26 AND product_id = 5 AND stock_quantity >= 1.00;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for product 5'; END IF;

    INSERT INTO payments (sale_id, method, amount, bank_account_id, status)
    VALUES (v_sale_id, 'CASH', 2.95, NULL, 'SUCCESS');
END $$;

COMMIT;
