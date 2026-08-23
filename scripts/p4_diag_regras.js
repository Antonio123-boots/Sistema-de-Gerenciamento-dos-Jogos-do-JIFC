require('dotenv').config({ path: '.env' });
const db = require('../config/db');
let obterRegras;
try { ({ obterRegras } = require('../utils/sportTableRules')); }
catch (_) {
  try { ({ obterRegras } = require('../services/sportTableRules')); }
  catch (e2) { console.log('obterRegras nao encontrada:', e2.message); }
}
(async () => {
  if (obterRegras) console.log('Regras tenis:', JSON.stringify(obterRegras('Tenis de Mesa Masculino')));
  const [cols] = await db.query('SHOW COLUMNS FROM jogos');
  console.log('Colunas jogos:', cols.map((c) => c.Field).join(', '));
  process.exit(0);
})();
