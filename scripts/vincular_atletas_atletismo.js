const db = require('../config/db');

(async () => {
  const [modalidades] = await db.query("SELECT id, genero FROM modalidades WHERE nome LIKE '%Atletismo%'");
  let adicionados = 0;

  for (const modalidade of modalidades) {
    const [atletas] = await db.query(
      `SELECT DISTINCT a.id
       FROM campus_modalidade cm
       JOIN atletas a ON a.campus_id = cm.campus_id
       WHERE cm.modalidade_id = ? AND a.genero = ?
       ORDER BY a.id ASC`,
      [modalidade.id, modalidade.genero]
    );

    for (const atleta of atletas) {
      const [vinculo] = await db.query(
        'SELECT 1 FROM atleta_modalidade WHERE atleta_id = ? AND modalidade_id = ?',
        [atleta.id, modalidade.id]
      );
      if (!vinculo.length) {
        await db.query(
          'INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)',
          [atleta.id, modalidade.id]
        );
        adicionados += 1;
      }
    }

    console.log(`Atletismo ${modalidade.genero}: ${atletas.length} atletas vinculados (modalidade ${modalidade.id})`);
  }

  console.log(`atletismo-vinculos-ok: ${adicionados} novos vínculos; jogos e sorteios não foram alterados`);
  process.exit(0);
})().catch((error) => {
  console.error('ERRO:', error.message);
  process.exit(1);
});