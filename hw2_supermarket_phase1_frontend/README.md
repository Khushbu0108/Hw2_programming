# SuperMart Chain - COSC 3380 HW2 Phase 1

## Team

| Member | Responsibility |
|---|---|
| Khusbhu Talaviya | Front End Design |
| Salman Zariwala | Back End Design |
| Benjamin Tri Minh Nguyen | DB and ER Design |


## Requirements

- Node.js 18+
- Local PostgreSQL 14+
- Browser

## Setup

1. Create an empty database:
   ```
   createdb supermart_hw2
   ```
2. Copy `_env_TEMPLATE` to a file named `.env` and fill in your PostgreSQL password:
   ```
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=supermart_hw2
   PGUSER=postgres
   PGPASSWORD=[PASSWORD]
   ```
3. Install and start:
   ```
   npm install
   npm start
   ```
4. Open <http://localhost:3000> (it redirects to `home.html`).
   Health check: <http://localhost:3000/api/health>.

## How to use the app

Go to the **Company Back Office** tab and follow the Phase 1 steps:

1. **Create Tables** - runs `schema.sql` (safe to click more than once).
2. **Initialize Lookup Tables** - runs `seed.sql`: 100 stores in 4 states, 20-40 aisles per store, 20 products, state tax rules, inventory for every store, 12 customers, 12 bank accounts. Re-running it resets the bank balances.
3. **Test Front Desk** - runs a card checkout of 10 random items at store 1 and shows the receipt and the new bank balance.
4. **Test Back Office Queries** - runs the six join reports in `query.sql`.
5. **Browse 10 Rows** - previews any table. **Delete All Rows** empties the selected table (`TRUNCATE ... CASCADE`) after a confirmation dialog.

The Front Desk tab lets you choose store, payment method (card or cash), bank account, and
number of items (10-20) and run a checkout. The panel at the bottom of the back office shows the SQL
that was sent to the database.

Demo account for the failure case: bank account 3 has only $5.00, so a card checkout with it
fails with an insufficient-funds error and everything is rolled back.

## Database design

- **Supermarket schema (`public`)**: `tax_rules`, `stores`, `aisles`, `products`, `inventory`,
  `customers`, `sales`, `sale_items`, `payments`.
- **Bank schema (`bank`)**: `bank_accounts`, `bank_transactions`. This is kept separate from the
  store tables, and nothing in `public` has a foreign key into `bank`. `payments.bank_account_id`
  only stores the account number.
- Composite keys: `inventory (store_id, product_id)` and `sale_items (sale_id, line_number)`.
- Lookup tables: `tax_rules`, `stores`, `aisles`, `products`, `customers`.
  Transaction tables: `inventory`, `sales`, `sale_items`, `payments`, bank tables.
- Tax varies by state (TX 8.25%, AZ 5.6%, FL 6%, GA 4%); produce is tax exempt; produce sold per
  pound is stored by weight (`quantity` in pounds), meat is pre-packaged.
- Intentional 3NF denormalization (documented in the report): stored totals (`sales.subtotal`,
  `tax_total`, `total`, and the line amounts in `sale_items`) and the `unit_price` snapshot on each
  receipt line.

Files: `schema.sql` (DDL and indexes), `seed.sql` (lookup data).

## The checkout transaction

`POST /api/checkout` runs one atomic transaction (see `transaction.sql`):

1. Build the receipt cart in a temp table (random items, quantity or weight, tax per state).
2. Lock the stock rows in `product_id` order.
3. Card only: debit `bank.bank_accounts` and write `bank.bank_transactions`.
4. Insert `sales`, `sale_items`, reduce `inventory`, insert `payments`.
5. `COMMIT`. Any error triggers `ROLLBACK`, so no partial data remains.

## SQL trace files

- `transaction.sql` - the checkout transaction (success, failure with rollback, cash checkout).
  Run it directly with `psql -d supermart_hw2 -f transaction.sql`.
- `query.sql` - the six back-office report queries

## API

All endpoints are served from `http://localhost:3000`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Check backend and database connection |
| POST | `/api/admin/create-tables` | Run `schema.sql` |
| POST | `/api/admin/initialize-lookups` | Run `seed.sql` |
| GET | `/api/admin/browse?table=products&limit=10` | Preview rows (table allowlist, limit capped) |
| POST | `/api/admin/clear-table` | Body `{table}`; allowlisted, UI asks for confirmation |
| POST | `/api/checkout` | Body `{storeId, paymentMethod, bankAccountId, itemCount, customerId}` |
| GET | `/api/reports/summary` | Run the reports in `query.sql` |

## Project files

`server.js`, `supermarket.js`, `db.js` (backend) - `home.html`, `app.js`, `styles.css` (frontend) -
`schema.sql`, `seed.sql`, `transaction.sql`, `query.sql` (SQL) - `API_CONTRACT.json`.