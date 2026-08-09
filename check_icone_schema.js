const db = require('./config/db');
(async () => {
  try {
    const [cols] = await db.query("SHOW COLUMNS FROM modalidades LIKE 'icone'");
    console.log('SHOW COLUMNS result length:', Array.isArray(cols) ? cols.length : typeof cols, cols);
    try {
      const [rows] = await db.query("SELECT id, nome, genero, tipo_confronto, formato_disputa, icone FROM modalidades LIMIT 1");
      console.log('SELECT icone sample rows length:', rows.length, rows);
    } catch (selectErr) {
      console.error('SELECT ERROR:', selectErr.message);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await db.end();
  }
})();
