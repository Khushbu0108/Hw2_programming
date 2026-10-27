require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'supermart_hw2',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || undefined
});

module.exports = pool;