const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

let dbPassword = process.env.DB_PASSWORD;
if (dbPassword === '""' || dbPassword === "''" || !dbPassword) dbPassword = '';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc'
  });

  try {
    const [rows] = await conn.query('SELECT id, nome, genero FROM modalidades ORDER BY id');
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await conn.end();
  }
})();
