const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

(async () => {
  const p = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: dbPassword, database: process.env.DB_NAME || 'jifc', connectionLimit: 5 });
  const alvo = [42, 45, 50, 54, 12, 8, 1, 11, 7, 9, 4, 15, 13, 49, 6, 53];
  for (const mid of alvo) {
    const [m] = await p.query('SELECT nome FROM modalidades WHERE id = ?', [mid]);
    const [rows] = await p.query(
      `SELECT c.id AS campus_id, c.nome, COUNT(*) AS qtd
       FROM atleta_modalidade am
       JOIN atletas a ON a.id = am.atleta_id
       JOIN campus c ON c.id = a.campus_id
       WHERE am.modalidade_id = ?
       GROUP BY c.id, c.nome ORDER BY qtd DESC`, [mid]);
    const porCampus = rows.map((r) => `${r.nome}(${r.qtd})`).join(', ');
    console.log(`MOD ${mid} ${m[0].nome}: [${porCampus}]`);
  }
  await p.end();
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });