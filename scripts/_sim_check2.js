const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

(async () => {
  const p = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: dbPassword, database: process.env.DB_NAME || 'jifc', connectionLimit: 5 });
  const [mods] = await p.query('SELECT m.id, m.nome, m.genero, m.tipo_confronto, m.formato_disputa, (SELECT COUNT(*) FROM campus_modalidade cm WHERE cm.modalidade_id = m.id) AS campi_inscritos, (SELECT COUNT(*) FROM atleta_modalidade am WHERE am.modalidade_id = m.id) AS atletas_inscritos FROM modalidades m ORDER BY m.id');
  for (const m of mods) {
    console.log(`MOD ${m.id} | ${m.nome} | ${m.genero} | ${m.tipo_confronto} | fmt=${m.formato_disputa} | campi=${m.campi_inscritos} | atletas=${m.atletas_inscritos}`);
  }
  const [tables] = await p.query("SHOW TABLES");
  const names = tables.map((r) => Object.values(r)[0]);
  for (const t of ['provas', 'resultados_xadrez', 'juiz_modalidade']) {
    if (names.includes(t)) {
      const [r] = await p.query(`SELECT COUNT(*) t FROM ${t}`);
      console.log(`TABELA ${t}: ${r[0].t} linhas`);
    } else {
      console.log(`TABELA ${t}: NÃO EXISTE`);
    }
  }
  if (names.includes('provas')) {
    const [pr] = await p.query('SELECT p.id, p.modalidade_id, p.nome, p.tipo_resultado, p.ordem, p.formato FROM provas p ORDER BY p.modalidade_id, p.ordem');
    console.log('PROVAS:');
    pr.forEach((x) => console.log('  ', x.id, `mod=${x.modalidade_id}`, x.nome, x.tipo_resultado, x.ordem, x.formato));
  }
  const [jogosRows] = await p.query('SELECT id, modalidade_id, fase, sub_categoria, status, publicado FROM jogos ORDER BY id LIMIT 40');
  const [chaves] = await p.query('SELECT id, modalidade_id, numero_chave, sub_categoria FROM chaves ORDER BY modalidade_id, numero_chave');
  console.log('JOGOS ATUAIS:');
  jogosRows.forEach((j) => console.log('  ', j.id, `mod=${j.modalidade_id}`, j.fase, j.sub_categoria, j.status, `pub=${j.publicado}`));
  console.log('CHAVES ATUAIS:');
  chaves.forEach((c) => console.log('  ', c.id, `mod=${c.modalidade_id}`, c.numero_chave, c.sub_categoria));
  const [jm] = await p.query('SELECT j.id, j.nome, j.email FROM juizes j ORDER BY j.id');
  console.log('JUIZES:');
  jm.forEach((j) => console.log('  ', j.id, j.nome, j.email));
  await p.end();
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });