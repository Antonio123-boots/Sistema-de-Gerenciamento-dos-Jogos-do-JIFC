require('dotenv').config({ path: '.env' });
const db = require('../config/db');
const adminModel = require('../models/adminModel');
const { garantirSubCategoriaChavesJogos } = require('../config/ensureSchema');
const { sincronizarClassificacaoGruposModalidade } = require('../services/classificacaoService');

(async () => {
  try {
    await garantirSubCategoriaChavesJogos();
    const [colunas] = await db.query("SHOW COLUMNS FROM jogos LIKE 'sub_categoria'");
    console.log('Coluna sub_categoria em jogos:', colunas.length ? 'OK' : 'FALHOU');

    for (const id of [11, 12]) {
      await adminModel.efetuarChaveamentoMatematico(id, 'individual');
      await adminModel.efetuarChaveamentoMatematico(id, 'dupla');
      await sincronizarClassificacaoGruposModalidade(id);
    }

    for (const id of [11, 12]) {
      console.log(`\n=== Modalidade ${id} ===`);
      const [resumo] = await db.query(
        `SELECT sub_categoria, SUM(tipo = 'chave') AS chaves, SUM(tipo = 'jogo') AS jogos
         FROM (
           SELECT 'chave' AS tipo, sub_categoria FROM chaves WHERE modalidade_id = ?
           UNION ALL
           SELECT 'jogo' AS tipo, sub_categoria FROM jogos WHERE modalidade_id = ?
         ) t GROUP BY sub_categoria`,
        [id, id]
      );
      console.log('Coexistencia:', JSON.stringify(resumo));

      for (const sub of ['individual', 'dupla']) {
        const chaves = await adminModel.getChavesModalidade(id, sub);
        const jogos = await adminModel.getJogosModalidade(id, sub);
        const integrantes = chaves.reduce((soma, c) => soma + c.integrantes.length, 0);
        const invalidos = jogos.filter((j) => sub === 'individual' ? (!j.atleta_1_id || !j.atleta_2_id) : (!j.campus_1_id || !j.campus_2_id)).length;
        console.log(`Aba ${sub}: ${chaves.length} chaves / ${integrantes} integrantes / ${jogos.length} jogos (invalidos: ${invalidos})`);
      }

      const [classif] = await db.query(
        `SELECT ch.sub_categoria, COUNT(*) AS total FROM classificacao_grupos cg JOIN chaves ch ON ch.id = cg.chave_id WHERE cg.modalidade_id = ? GROUP BY ch.sub_categoria`,
        [id]
      );
      console.log('Classificacao por sub:', JSON.stringify(classif));
    }

    const [futsal] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM chaves WHERE modalidade_id = 1) AS chaves,
         (SELECT COUNT(*) FROM jogos WHERE modalidade_id = 1) AS jogos,
         (SELECT DISTINCT sub_categoria FROM jogos WHERE modalidade_id = 1 LIMIT 1) AS sub`
    );
    console.log('\nFutsal (id 1) intocado:', JSON.stringify(futsal[0]));

    process.exit(0);
  } catch (error) {
    console.error('ERRO NO E2E:', error.message);
    process.exit(1);
  }
})();
