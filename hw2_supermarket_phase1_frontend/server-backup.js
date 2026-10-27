const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Test backend and PostgreSQL connection
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT current_database()'
        );

        res.json({
            success: true,
            message: 'SuperMart backend and database connected!',
            database: result.rows[0].current_database
        });
    } catch (error) {
        console.error('Database connection failed:', error);

        res.status(500).json({
            success: false,
            message: 'Database connection failed'
        });
    }
});

// Get bank account balances and transaction history
app.get('/company-records', async (req, res) => {
    try {
        const accounts = await pool.query(
            'SELECT k1, a, b FROM t1 ORDER BY k1'
        );

        const transactions = await pool.query(
            'SELECT * FROM t2 ORDER BY tx_id DESC LIMIT 50'
        );

        res.json({
            success: true,
            accounts: accounts.rows,
            transactions: transactions.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Transfer money between accounts
app.post('/simulate-transaction', async (req, res) => {
    const { fromAccountId, toAccountId, amountString } = req.body;
    const amount = Number(amountString);
    const fromId = Number(fromAccountId);
    const toId = Number(toAccountId);

    if (!Number.isSafeInteger(fromId) ||
        !Number.isSafeInteger(toId) ||
        fromId === toId ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(String(amountString)) ||
        amount > 99999999.99) {
        return res.status(400).json({
            success: false,
            message: 'Invalid transfer details.'
        });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Lock both accounts before changing balances
        const accounts = await client.query(
            'SELECT k1 FROM t1 WHERE k1 = ANY($1::int[]) ORDER BY k1 FOR UPDATE',
            [[fromId, toId]]
        );

        if (accounts.rowCount !== 2) {
            throw new Error('One or both accounts do not exist.');
        }

        await client.query(
            'UPDATE t1 SET a = a - $1 WHERE k1 = $2',
            [amountString, fromId]
        );

        await client.query(
            'UPDATE t1 SET a = a + $1 WHERE k1 = $2',
            [amountString, toId]
        );

        await client.query(
            `INSERT INTO t2 (account_id, amount, tx_type)
             VALUES ($1, $2, 'WITHDRAWAL')`,
            [fromId, amountString]
        );

        await client.query(
            `INSERT INTO t2 (account_id, amount, tx_type)
             VALUES ($1, $2, 'DEPOSIT')`,
            [toId, amountString]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            message: `Transferred $${amountString} from Account ${fromId} to Account ${toId}.`
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(console.error);
        }

        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });

    } finally {
        if (client) client.release();
    }
});
// Start backend server
app.listen(PORT, () => {
    console.log(
        `SuperMart backend running on http://localhost:${PORT}`
    );
});