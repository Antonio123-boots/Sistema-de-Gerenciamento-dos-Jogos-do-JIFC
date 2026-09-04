const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const pw = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;
(async () => {
  const conn = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: pw, database: process.env.DB_NAME || 'jifc' });
  const tables = ['campus', 'campus_modalidade', 'atletas', 'modalidades'];
  for (const t of tables) {
    try { const [r] = await conn.query(`SELECT COUNT(*) total FROM ${t}`); console.log(t + ':', r[0].total); } catch (e) { console.log(t + ': ERRO ' + e.message); }
  }
  const [c] = await conn.query('SELECT id, nome FROM campus ORDER BY id');
  console.table(c);
  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });