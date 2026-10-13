const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

(async () => {
  const p = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc',
    connectionLimit: 5
  });
  const [m] = await p.query('SELECT id, nome, genero, tipo_confronto FROM modalidades ORDER BY id');
  const [c] = await p.query('SELECT COUNT(*) t FROM campus');
  const [a] = await p.query('SELECT COUNT(*) t FROM atletas');
  const [cm] = await p.query('SELECT COUNT(*) t FROM campus_modalidade');
  const [j] = await p.query('SELECT COUNT(*) t FROM jogos');
  const [ch] = await p.query('SELECT COUNT(*) t FROM chaves');
  const [cf] = await p.query('SELECT * FROM configuracoes_evento ORDER BY id DESC LIMIT 1');
  const [juiz] = await p.query('SELECT COUNT(*) t FROM juizes');
  console.log('CAMPUS', c[0].t, 'ATLETAS', a[0].t, 'CAMPUS_MODALIDADE', cm[0].t, 'JOGOS', j[0].t, 'CHAVES', ch[0].t, 'JUIZES', juiz[0].t);
  console.log('MODALIDADES:');
  m.forEach((x) => console.log('  ', x.id, x.nome, '|', x.genero, '|', x.tipo_confronto));
  console.log('CONFIG:', JSON.stringify(cf[0] || null));
  const [campi] = await p.query('SELECT id, nome FROM campus ORDER BY id');
  console.log('CAMPUS:', campi.map((x) => `${x.id}:${x.nome}`).join(' | '));
  await p.end();
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });