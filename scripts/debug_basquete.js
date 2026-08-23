const db = require('../config/db');
const juizService = require('../services/juizService');
const classificacaoService = require('../services/classificacaoService');

async function mostrarClassif(chaveId, titulo) {
  const [rows] = await db.query(
    `SELECT cg.campus_id, c.nome_exibicao, cg.pontos, cg.jogos_jogados, cg.vitorias,
            cg.empates, cg.derrotas, cg.pontos_pro, cg.pontos_contra
     FROM classificacao_grupos cg JOIN campus c ON c.id = cg.campus_id
     WHERE cg.modalidade_id = 5 AND cg.chave_id = ?
     ORDER BY cg.pontos DESC`, [chaveId]);
  console.log(`\n=== ${titulo} ===`);
  rows.forEach((r, i) => console.log(
    `${i + 1}º ${String(r.nome_exibicao || r.campus_id).padEnd(20)} Pts:${r.pontos} J:${r.jogos_jogados} V:${r.vitorias} E:${r.empates} D:${r.derrotas} PF:${r.pontos_pro} PC:${r.pontos_contra}`));
}

(async () => {
  try {
    // Estado inicial
    await mostrarClassif(606, 'ANTES - Grupo 1 (chave 606)');

    // Juiz lança: jogo 2911 (campus 10 vs 6) => 78 x 65
    await juizService.salvarPlacar(2911, { placar1: 78, placar2: 65, status: 'Encerrado' });
    await mostrarClassif(606, 'DEPOIS do jogo 2911 (10 vence 6 por 78x65)');

    // Juiz lança: jogo 2912 (campus 4 vs 9) => 90 x 88
    await juizService.salvarPlacar(2912, { placar1: 90, placar2: 88, status: 'Encerrado' });
    await mostrarClassif(606, 'DEPOIS do jogo 2912 (4 vence 9 por 90x88)');

    // Correção de placar pelo juiz: muda 2911 para 70 x 72 (6 vira)
    await juizService.salvarPlacar(2911, { placar1: 70, placar2: 72, status: 'Encerrado' });
    await mostrarClassif(606, 'DEPOIS da correcao do 2911 (6 vence 10 por 72x70)');

    const [ordem] = await db.query(
      `SELECT cg.campus_id, c.nome_exibicao,
              ROW_NUMBER() OVER (ORDER BY cg.pontos DESC, cg.vitorias DESC,
                (cg.pontos_pro - cg.pontos_contra) DESC, cg.pontos_pro DESC) AS pos
       FROM classificacao_grupos cg JOIN campus c ON c.id = cg.campus_id
       WHERE cg.modalidade_id = 5 AND cg.chave_id = 606`);
    console.log('\nOrdenacao final (via getClassificacaoModalidade com desempate):');
    const lista = await classificacaoService.getClassificacaoModalidade(5, 606);
    lista.forEach((r, i) => console.log(`${i + 1}º ${String(r.participante_exibicao).padEnd(20)} Pts:${r.pontos} V:${r.vitorias} PF:${r.pontos_pro} PC:${r.pontos_contra}`));

    // Restaurar estado original
    await db.query('DELETE FROM resultados_coletivos WHERE jogo_id IN (2911, 2912)');
    await db.query("UPDATE jogos SET status = 'Agendado' WHERE id IN (2911, 2912)");
    await classificacaoService.recalcularClassificacaoModalidade(5);
    await mostrarClassif(606, 'RESTAURADO - estado original');

    console.log('\nOK: fluxo juiz -> classificacao funcionando para basquete.');
  } catch (e) {
    console.error('ERRO:', e);
    process.exitCode = 1;
  }
  process.exit(0);
})();
