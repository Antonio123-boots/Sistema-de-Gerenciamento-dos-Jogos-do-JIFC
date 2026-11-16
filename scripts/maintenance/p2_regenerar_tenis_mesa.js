require('dotenv').config({ path: '.env' });
const db = require('../config/db');
const adminModel = require('../models/adminModel');

const MODALIDADES = [11, 12];

async function estadoAtual(rotulo, modalidadeId) {
  const [chaves] = await db.query('SELECT COUNT(*) AS total FROM chaves WHERE modalidade_id = ?', [modalidadeId]);
  const [jogos] = await db.query(
    'SELECT SUM(atleta_1_id IS NOT NULL AND atleta_2_id IS NOT NULL) AS com_atletas, SUM(campus_1_id IS NOT NULL) AS entre_campus, COUNT(*) AS total FROM jogos WHERE modalidade_id = ?',
    [modalidadeId]
  );
  const [classif] = await db.query('SELECT COUNT(*) AS total FROM classificacao_grupos WHERE modalidade_id = ?', [modalidadeId]);
  console.log(`[${rotulo}] Mod ${modalidadeId}: chaves=${chaves[0].total} | jogos=${jogos[0].total} (com atletas: ${Number(jogos[0].com_atletas || 0)}, entre campus: ${Number(jogos[0].entre_campus || 0)}) | classificacao=${classif[0].total}`);
}

(async () => {
  try {
    for (const id of MODALIDADES) {
      await estadoAtual('ANTES', id);

      const resultado = await adminModel.efetuarChaveamentoMatematico(id, 'individual');
      console.log(`Mod ${id}: chaveamento individual regenerado -> chaves=${resultado.chaves.length}, jogos=${resultado.jogos.length}`);

      await adminModel.sincronizarClassificacaoGruposModalidade(id);
      const [classif] = await db.query('SELECT COUNT(*) AS total FROM classificacao_grupos WHERE modalidade_id = ?', [id]);
      console.log(`Mod ${id}: classificacao sincronizada -> ${classif[0].total} linhas`);

      await estadoAtual('DEPOIS', id);

      const grupos = await adminModel.getChavesModalidade(id, 'individual');
      let semIntegrantes = 0;
      for (const grupo of grupos) {
        if (!grupo.integrantes.length) semIntegrantes += 1;
        console.log(`   Chave ${grupo.numero_chave}: ${grupo.integrantes.length} integrantes`);
      }
      if (semIntegrantes) {
        throw new Error(`Mod ${id}: ${semIntegrantes} chaves ficaram sem integrantes!`);
      }

      const jogos = await adminModel.getJogosModalidade(id, 'individual');
      const invalidos = jogos.filter((jogo) => !jogo.atleta_1_id || !jogo.atleta_2_id);
      console.log(`Mod ${id}: aba Individual agora ve ${grupos.length} chaves e ${jogos.length} jogos (invalidos: ${invalidos.length})`);

      const [publicados] = await db.query('SELECT SUM(publicado = 1) AS publicados FROM jogos WHERE modalidade_id = ?', [id]);
      console.log(`Mod ${id}: jogos publicados=${Number(publicados[0].publicados || 0)} (ficarao invisiveis na home ate voce confirmar o sorteio no painel)\n`);
    }

    console.log('P2 concluido com sucesso.');
    process.exit(0);
  } catch (error) {
    console.error('ERRO NO P2:', error.message);
    process.exit(1);
  }
})();
