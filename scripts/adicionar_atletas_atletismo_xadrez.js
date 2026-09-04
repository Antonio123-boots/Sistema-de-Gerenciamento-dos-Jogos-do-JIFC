require('dotenv').config({ path: '.env' });
const db = require('../config/db');

async function obterOuCriarAtleta(conn, campusId, genero, indice) {
  const prefixo = genero === 'Masculino' ? 'M' : 'F';
  const matricula = `IND-${prefixo}-${String(indice).padStart(3, '0')}`;
  const cpf = `9${prefixo === 'M' ? '1' : '2'}${String(indice).padStart(9, '0')}`;
  const [existente] = await conn.query('SELECT id FROM atletas WHERE matricula = ? OR cpf = ?', [matricula, cpf]);
  if (existente.length) return existente[0].id;
  const [resultado] = await conn.query(
    'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento) VALUES (?, ?, ?, ?, ?, ?)',
    [campusId, `Atleta ${prefixo} Individual ${indice}`, cpf, matricula, genero, '2006-01-01']
  );
  return resultado.insertId;
}

(async () => {
  const [campi] = await db.query('SELECT id FROM campus ORDER BY id');
  const [modalidades] = await db.query("SELECT id, nome, genero FROM modalidades WHERE nome LIKE '%Atletismo%' OR nome LIKE '%Xadrez%'");
  let inseridos = 0;
  for (const modalidade of modalidades) {
    for (let indice = 1; indice <= 8; indice += 1) {
      const indiceAtleta = indice + (modalidade.genero === 'Feminino' ? 100 : 0);
      const atletaId = await obterOuCriarAtleta(db, campi[(indice - 1) % campi.length].id, modalidade.genero, indiceAtleta);
      const [vinculo] = await db.query('SELECT 1 FROM atleta_modalidade WHERE atleta_id = ? AND modalidade_id = ?', [atletaId, modalidade.id]);
      if (!vinculo.length) {
        await db.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atletaId, modalidade.id]);
        inseridos += 1;
      }
    }
  }
  console.log(`atletas-individuais-ok: ${inseridos} inscrições adicionadas`);
  process.exit(0);
})().catch((error) => {
  console.error('ERRO:', error.message);
  process.exit(1);
});