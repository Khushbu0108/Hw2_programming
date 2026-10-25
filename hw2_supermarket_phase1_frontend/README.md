# SuperMart Chain — HW2 Phase 1 Frontend

Person 1 can develop and test this UI before the database/backend is ready. Open `home.html` directly or with VS Code Live Server.

**Important:** `MOCK_MODE = true` means operations affect browser memory only. This is not a completed Phase 1 database app. Change to `false` only after the backend endpoints below are implemented.

## Backend API contract

Base URL: `http://localhost:3000`

- `POST /api/admin/create-tables` — create tables.
- `POST /api/admin/initialize-lookups` — seed reference data.
- `POST /api/checkout` — run checkout; request fields: `storeId`, `paymentMethod` (`CARD` or `CASH`), `bankAccountId` (card only), `itemCount` (10–20), `customerId` (optional).
- `GET /api/admin/browse?table=products&limit=10` — return `{success:true,rows:[...]}`. Backend must allowlist table names and cap limit.
- `POST /api/admin/clear-table` — request `{table:"sales"}`; validate table against a strict allowlist.
- `GET /api/reports/summary` — run back-office join reports.
- Recommended: `GET /api/health`.

Successful checkout should return `{success:true, receipt:{sale_id,store_name,store_id,payment_method,subtotal,tax_total,total,created_at,items}}`. Each item should include `sku`, `product_name`, `unit_price`, `quantity`, `unit`, and `line_total`.

## Database teammate requirements

Design a normalized schema including at least: `stores`, `aisles`, `products`, `inventory`, `customers`, `bank_accounts` (separate from supermarket operational tables), `sales`, `sale_items`, `payments`, and `tax_rules`. Use PKs, FKs, checks, and indexes. `inventory` can have composite key `(store_id, product_id)`; `sale_items` can have `(sale_id, line_number)`.

Seed the required lookup data in PostgreSQL, not CSV: at least 100 stores in at least four states, 20–40 aisles per store, and at least 10 meaningful lookup rows. Include state-dependent tax and tax-exempt products. Produce/meat items should demonstrate quantity or weight.

## Backend transaction requirements

Card checkout must atomically write the sale, receipt lines, inventory changes, payment, and debit the separate bank account. Cash checkout records cash payment without a bank debit. Any error must roll back all changes. Use parameterized SQL. The receipt must preserve item price and quantity/weight plus the total due.

## Phase 1 requirements from the attached assignment

- Preliminary ER model
- At least five SQL tables
- Local JavaScript/HTML app connected to PostgreSQL
- At least one transaction that updates multiple tables, including bank account for card payments
- At least three useful queries involving joins
- Front desk and back-office test buttons
- Create tables, initialize lookups, browse about 10 rows, and clear-table action with confirmation
- Easy simulation and informative error messages
- `transaction.sql` and `query.sql` SQL trace files

Mock mode alone does not satisfy these requirements; integrate and test the real backend before submission.
