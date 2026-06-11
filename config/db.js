const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Força o dotenv a buscar o arquivo .env explicitamente na raiz do projeto
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Tratamento rigoroso de strings vazias ou nulas vindas do ambiente
let dbPassword = process.env.DB_PASSWORD;
if (dbPassword === '""' || dbPassword === "''" || !dbPassword) {
    dbPassword = '';
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Autoteste de conexão ao iniciar o servidor
pool.getConnection()
    .then(conn => {
        console.log('✅ Connected successfully to the MySQL database.');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database connection failure:', err.message);
    });

module.exports = pool;