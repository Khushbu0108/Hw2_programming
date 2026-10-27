-- =====================================================================
-- SuperMart Chain | COSC 3380 HW2 Phase 1 | seed.sql
-- Lookup data. Safe to re-run. NO BEGIN/COMMIT on purpose: the backend
-- sends this file in one pool.query() call, and PostgreSQL runs a
-- multi-statement string as one implicit transaction (all-or-nothing).
-- An explicit BEGIN here would leave the pooled connection stuck in an
-- aborted transaction if any statement failed.
-- =====================================================================

-- 1. State tax rates
INSERT INTO tax_rules (state, tax_rate) VALUES
    ('TX',0.0825), ('AZ',0.0560), ('FL',0.0600), ('GA',0.0400)
ON CONFLICT (state) DO NOTHING;

-- 2. 100 stores: 1-25 TX, 26-50 AZ, 51-75 FL, 76-100 GA
--    (store 1/2/26/51/76 match the frontend dropdown)
WITH s AS (
    SELECT n,
           CASE WHEN n <= 25 THEN 'TX' WHEN n <= 50 THEN 'AZ'
                WHEN n <= 75 THEN 'FL' ELSE 'GA' END AS st,
           (n - 1) % 25 AS k
    FROM generate_series(1, 100) AS n
), c AS (
    SELECT s.*,
           (CASE s.st
              WHEN 'TX' THEN ARRAY['Houston','Dallas','Austin','San Antonio','Fort Worth','El Paso','Plano','Arlington','Corpus Christi','Lubbock']
              WHEN 'AZ' THEN ARRAY['Phoenix','Tucson','Mesa','Chandler','Scottsdale','Glendale','Tempe','Gilbert','Peoria','Flagstaff']
              WHEN 'FL' THEN ARRAY['Miami','Orlando','Tampa','Jacksonville','Tallahassee','Fort Lauderdale','Naples','Gainesville','Pensacola','Sarasota']
              ELSE          ARRAY['Atlanta','Savannah','Augusta','Macon','Athens','Columbus','Marietta','Albany','Roswell','Valdosta']
            END)[(s.k % 10) + 1] AS city
    FROM s
)
INSERT INTO stores (store_id, store_name, city, state, address)
SELECT n,
       CASE n WHEN 1  THEN 'SuperMart Houston Central'
              WHEN 2  THEN 'SuperMart Dallas North'
              WHEN 26 THEN 'SuperMart Phoenix'
              WHEN 51 THEN 'SuperMart Miami'
              WHEN 76 THEN 'SuperMart Atlanta'
              ELSE 'SuperMart ' || city || ' #' || n END,
       city, st,
       ((n * 37) % 900 + 100) || ' ' ||
         (ARRAY['Main St','Oak Ave','Maple Dr','Cedar Blvd','Elm St','Park Ave'])[(n % 6) + 1]
FROM c
ON CONFLICT (store_id) DO NOTHING;

-- 3. 20-40 aisles per store (count varies by store); aisle 1-10 follow
--    the department list, later aisles repeat it.
INSERT INTO aisles (store_id, aisle_number, aisle_name)
SELECT s.store_id, n,
       'Aisle ' || n || ' - ' ||
       (ARRAY['Produce','Dairy','Bakery','Pantry','Meat','Breakfast','Household','Beverages','Frozen','Snacks'])[((n - 1) % 10) + 1]
FROM stores s
CROSS JOIN LATERAL generate_series(1, 20 + (s.store_id * 11) % 21) AS n   -- 20..40
ON CONFLICT (store_id, aisle_number) DO NOTHING;

-- 4. Products (SKUs match the frontend). Produce sold per lb = by weight;
--    meat is pre-packaged; produce is tax exempt.
INSERT INTO products (sku, product_name, category, unit_price, unit, tax_exempt) VALUES
    ('SKU1001','Apples','Produce',1.99,'lb',TRUE),
    ('SKU1002','Bananas','Produce',0.69,'lb',TRUE),
    ('SKU1003','Carrots','Produce',1.29,'lb',TRUE),
    ('SKU1004','Milk','Dairy',3.49,'each',FALSE),
    ('SKU1005','Bread','Bakery',2.79,'each',FALSE),
    ('SKU1006','Eggs','Dairy',4.29,'dozen',FALSE),
    ('SKU1007','Rice','Pantry',6.99,'bag',FALSE),
    ('SKU1008','Pasta','Pantry',1.79,'each',FALSE),
    ('SKU1009','Chicken breast','Meat',5.99,'pack',FALSE),
    ('SKU1010','Tomatoes','Produce',2.49,'lb',TRUE),
    ('SKU1011','Cereal','Breakfast',4.59,'box',FALSE),
    ('SKU1012','Soap','Household',2.19,'each',FALSE),
    ('SKU1013','Orange juice','Beverages',3.99,'bottle',FALSE),
    ('SKU1014','Potatoes','Produce',0.99,'lb',TRUE),
    ('SKU1015','Ground beef','Meat',6.49,'pack',FALSE),
    ('SKU1016','Coffee','Beverages',8.99,'bag',FALSE),
    ('SKU1017','Yogurt','Dairy',0.89,'each',FALSE),
    ('SKU1018','Lettuce','Produce',1.69,'each',TRUE),
    ('SKU1019','Oranges','Produce',1.49,'lb',TRUE),
    ('SKU1020','Dish detergent','Household',3.79,'bottle',FALSE)
ON CONFLICT (sku) DO NOTHING;

-- 5. Inventory: every store stocks every product, shelved in the aisle
--    whose department matches the product category; stock varies 50-149.
INSERT INTO inventory (store_id, product_id, aisle_id, stock_quantity)
SELECT s.store_id, p.product_id, a.aisle_id,
       50 + (s.store_id * 13 + p.product_id * 7) % 100
FROM stores s
CROSS JOIN products p
JOIN aisles a
  ON a.store_id = s.store_id
 AND a.aisle_number = COALESCE(
       array_position(ARRAY['Produce','Dairy','Bakery','Pantry','Meat','Breakfast','Household','Beverages','Frozen','Snacks'], p.category::text), 1)
ON CONFLICT (store_id, product_id) DO NOTHING;

-- 6. Customers (12)
INSERT INTO customers (customer_id, customer_name, email) VALUES
    (1,'Ava Johnson','ava.johnson@example.com'),
    (2,'Liam Garcia','liam.garcia@example.com'),
    (3,'Noah Martinez','noah.martinez@example.com'),
    (4,'Emma Davis','emma.davis@example.com'),
    (5,'Olivia Nguyen','olivia.nguyen@example.com'),
    (6,'Elijah Patel','elijah.patel@example.com'),
    (7,'Sophia Kim','sophia.kim@example.com'),
    (8,'James Lopez','james.lopez@example.com'),
    (9,'Mia Brown','mia.brown@example.com'),
    (10,'Lucas Wilson','lucas.wilson@example.com'),
    (11,'Isabella Moore','isabella.moore@example.com'),
    (12,'Mason Clark','mason.clark@example.com')
ON CONFLICT (customer_id) DO NOTHING;

-- 7. Bank accounts (12) - separate bank schema. Re-running RESETS balances
--    so the demo can be repeated. Account 3 is deliberately poor ($5.00)
--    to demonstrate "insufficient funds -> full rollback".
INSERT INTO bank.bank_accounts (account_id, holder_name, balance) VALUES
    (1,'Ava Johnson',5000.00),
    (2,'Liam Garcia',2500.00),
    (3,'Noah Martinez',5.00),
    (4,'Emma Davis',800.00),
    (5,'Olivia Nguyen',1200.00),
    (6,'Elijah Patel',300.00),
    (7,'Sophia Kim',950.00),
    (8,'James Lopez',2000.00),
    (9,'Mia Brown',75.00),
    (10,'Lucas Wilson',3100.00),
    (11,'Isabella Moore',640.00),
    (12,'Mason Clark',1500.00)
ON CONFLICT (account_id) DO UPDATE SET balance = EXCLUDED.balance;

-- 8. Keep identity sequences ahead of the explicit IDs inserted above
SELECT setval(pg_get_serial_sequence('customers','customer_id'),
              (SELECT MAX(customer_id) FROM customers));
SELECT setval(pg_get_serial_sequence('bank.bank_accounts','account_id'),
              (SELECT MAX(account_id) FROM bank.bank_accounts));
