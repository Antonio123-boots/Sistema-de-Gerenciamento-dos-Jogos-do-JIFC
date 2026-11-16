const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc'
  });

  try {
    const [rows] = await conn.query("SELECT id, senha FROM campus WHERE senha IS NOT NULL AND senha <> '' AND senha NOT LIKE '$argon2%'");
    let migradas = 0;
    for (const campus of rows) {
      const hash = await argon2.hash(String(campus.senha));
      await conn.query('UPDATE campus SET senha = ? WHERE id = ?', [hash, campus.id]);
      migradas += 1;
    }
    console.log(`Senhas migradas para hash argon2: ${migradas}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
