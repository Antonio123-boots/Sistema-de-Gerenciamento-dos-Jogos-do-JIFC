const db = require('./config/db');
(async () => {
  try {
    const [rows] = await db.query('SELECT id, nome, genero FROM modalidades ORDER BY nome ASC');
    console.log(rows);
  } catch (err) {
    console.error('ERR', err.message);
  } finally {
    process.exit(0);
  }
})();