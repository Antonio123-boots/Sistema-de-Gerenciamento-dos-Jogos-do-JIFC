const adminModel = require('./models/adminModel');
const db = require('./config/db');
(async () => {
  try {
    const [cols] = await db.query("SHOW COLUMNS FROM modalidades LIKE 'icone'");
    console.log('SHOW COLUMNS list length:', Array.isArray(cols) ? cols.length : typeof cols);
    console.log('SHOW COLUMNS rows:', cols);
    try {
      const [rows] = await db.query("SELECT id, nome, genero, tipo_confronto, formato_disputa FROM modalidades LIMIT 1");
      console.log('SELECT sample rows length:', rows.length);
      console.log('SELECT sample row:', rows[0]);
    } catch (e) {
      console.error('SELECT ERROR (without icone):', e.message);
    }

    try {
      const modalidades = await adminModel.listarModalidadesConfiguracao();
      console.log('listarModalidadesConfiguracao returned:', modalidades.length);
      console.log('first modalidade:', modalidades[0]);
    } catch (err) {
      console.error('adminModel.listarModalidadesConfiguracao ERROR:', err.message);
      if (err.sql) console.error('SQL:', err.sql);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await db.end();
  }
})();
