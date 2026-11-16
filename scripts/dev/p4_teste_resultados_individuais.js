require('dotenv').config({ path: '.env' });
const db = require('../config/db');
const juizService = require('../services/juizService');
const { sincronizarClassificacaoGruposModalidade } = require('../services/classificacaoService');

const ID = 11;

async function pegarJogoIndividual(excluirId = null) {
  const params = [ID];
  let extra = '';
  if (excluirId) { extra = ' AND j.id <> ?'; params.push(excluirId); }
  const [rows] = await db.query(
    `SELECT j.id, j.chave_id, j.atleta_1_id, j.atleta_2_id, a1.nome AS n1, a2.nome AS n2
     FROM jogos j JOIN atletas a1 ON a1.id = j.atleta_1_id JOIN atletas a2 ON a2.id = j.atleta_2_id
     WHERE j.modalidade_id = ? AND j.status = 'Agendado' AND j.wo = 0${extra}
       AND NOT EXISTS (SELECT 1 FROM resultados_coletivos rc WHERE rc.jogo_id = j.id)
     LIMIT 1`, params);
  return rows[0] || null;
}

async function classifChave(chaveId) {
  const [rows] = await db.query(
    `SELECT atleta_id, pontos, jogos_jogados, vitorias, derrotas, pontos_pro, pontos_contra, sets_ganhos, sets_perdidos
     FROM classificacao_grupos WHERE chave_id = ? ORDER BY pontos DESC, vitorias DESC`, [chaveId]);
  return rows;
}

(async () => {
  let jogo1 = null;
  let jogo2 = null;
  try {
    jogo1 = await pegarJogoIndividual();
    if (!jogo1) throw new Error('Sem jogo individual livre para teste');
    jogo2 = await pegarJogoIndividual(jogo1.id);
    console.log('Jogos de teste:', JSON.stringify([jogo1, jogo2]));

    await sincronizarClassificacaoGruposModalidade(ID);

    console.log('\n=== TESTE 1: placar por sets em jogo INDIVIDUAL ===');
    await juizService.salvarPlacar(jogo1.id, {
      placar1: 33, placar2: 11, status: 'Encerrado',
      sets: [
        { numero: 1, pontos_1: 11, pontos_2: 5 },
        { numero: 2, pontos_1: 11, pontos_2: 3 },
        { numero: 3, pontos_1: 11, pontos_2: 3 }
      ]
    });
    let c = await classifChave(jogo1.chave_id);
    console.log('Classificacao da chave apos resultado:', JSON.stringify(c));
    const g1 = c.find((r) => r.atleta_id === jogo1.atleta_1_id);
    const g2 = c.find((r) => r.atleta_id === jogo1.atleta_2_id);
    const t1ok = g1 && g1.pontos === 3 && g1.vitorias === 1 && g1.jogos_jogados === 1 && g1.sets_ganhos === 3 && Number(g1.pontos_pro) === 33 && Number(g1.pontos_contra) === 11;
    const t2ok = g2 && g2.pontos === 0 && g2.derrotas === 1 && g2.jogos_jogados === 1 && g2.sets_perdidos === 3;
    console.log(t1ok ? `   OK: ${jogo1.n1} 3 pts / 1V / 33-11 / 3 sets` : '   FALHOU vencedor');
    console.log(t2ok ? `   OK: ${jogo1.n2} 0 pts / 1D` : '   FALHOU perdedor');

    console.log('\n=== TESTE 2: W.O. em jogo INDIVIDUAL ===');
    if (!jogo2) throw new Error('Sem segundo jogo para teste de WO');
    await juizService.aplicarWO(jogo2.id, jogo2.atleta_1_id);
    const [aposWo] = await db.query('SELECT wo, status, vencedor_atleta_id FROM jogos WHERE id = ?', [jogo2.id]);
    console.log('Jogo apos WO:', JSON.stringify(aposWo[0]));
    c = await classifChave(jogo2.chave_id);
    console.log('Classificacao da chave apos WO:', JSON.stringify(c));
    const w1 = c.find((r) => r.atleta_id === jogo2.atleta_1_id);
    const w2 = c.find((r) => r.atleta_id === jogo2.atleta_2_id);
    const woOk = aposWo[0].wo === 1 && Number(aposWo[0].vencedor_atleta_id) === jogo2.atleta_1_id
      && w1 && w1.pontos === 3 && w1.vitorias === 1
      && w2 && w2.derrotas === 1 && w2.pontos === 0;
    console.log(woOk ? '   OK: WO individual gravou vencedor_atleta_id e classificou' : '   FALHOU WO');

    console.log('\n=== RESTAURANDO ESTADO ===');
    for (const j of [jogo1, jogo2]) {
      await db.query('DELETE FROM resultados_coletivos WHERE jogo_id = ?', [j.id]);
      await db.query('DELETE FROM resultados_por_sets WHERE jogo_id = ?', [j.id]);
      await db.query("UPDATE jogos SET status = 'Agendado', wo = 0, vencedor_atleta_id = NULL WHERE id = ?", [j.id]);
    }
    await sincronizarClassificacaoGruposModalidade(ID);
    const [resto] = await db.query(
      `SELECT sub_categoria,
              SUM(tipo='chave') chaves, SUM(tipo='jogo') jogos
       FROM (SELECT 'chave' tipo, sub_categoria FROM chaves WHERE modalidade_id=?
             UNION ALL SELECT 'jogo', sub_categoria FROM jogos WHERE modalidade_id=?) t
       GROUP BY sub_categoria`, [ID, ID]);
    const [cg] = await db.query(
      `SELECT ch.sub_categoria, COUNT(*) total, SUM(cg.pontos) pts, SUM(cg.jogos_jogados) jj
       FROM classificacao_grupos cg JOIN chaves ch ON ch.id = cg.chave_id
       WHERE cg.modalidade_id = ? GROUP BY ch.sub_categoria`, [ID]);
    console.log('Estado final:', JSON.stringify(resto), JSON.stringify(cg));
    const okRestaurado =
      resto.some((r) => r.sub_categoria === 'individual' && Number(r.chaves) === 11 && Number(r.jogos) === 36) &&
      resto.some((r) => r.sub_categoria === 'dupla' && Number(r.chaves) === 4 && Number(r.jogos) === 24) &&
      cg.every((r) => Number(r.pts) === 0 && Number(r.jj) === 0);
    console.log(okRestaurado ? '\nTUDO OK - testes passaram e estado restaurado' : '\nFALHOU na restauracao');
    process.exit(okRestaurado && t1ok && t2ok ? 0 : 1);
  } catch (error) {
    console.error('ERRO:', error.message);
    if (jogo1 || jogo2) {
      for (const j of [jogo1, jogo2]) {
        if (!j) continue;
        try {
          await db.query('DELETE FROM resultados_coletivos WHERE jogo_id = ?', [j.id]);
          await db.query('DELETE FROM resultados_por_sets WHERE jogo_id = ?', [j.id]);
          await db.query("UPDATE jogos SET status = 'Agendado', wo = 0, vencedor_atleta_id = NULL WHERE id = ?", [j.id]);
        } catch (_) {}
      }
      await sincronizarClassificacaoGruposModalidade(ID).catch(() => {});
      console.error('(estado parcialmente restaurado)');
    }
    process.exit(1);
  }
})();
