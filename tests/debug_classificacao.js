const db = require('../config/db');

async function main() {
  try {
    console.log('=== JOGOS COM MODALIDADE_ID ===');
    const [jogos] = await db.query(`
      SELECT j.id, j.modalidade_id, j.campus_1_id, j.campus_2_id, j.wo, j.vencedor_campus_id, j.status,
             c1.nome AS campus_1, c2.nome AS campus_2,
             rc.placar_1, rc.placar_2, m.nome AS modalidade, m.genero,
             ch.numero_chave, ch.id AS chave_id
      FROM jogos j
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN campus c1 ON j.campus_1_id = c1.id
      LEFT JOIN campus c2 ON j.campus_2_id = c2.id
      LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
      LEFT JOIN chaves ch ON j.chave_id = ch.id
      WHERE m.nome LIKE '%utsal%' AND (rc.placar_1 IS NOT NULL OR j.wo = 1)
      ORDER BY j.modalidade_id, ch.numero_chave
    `);

    for (const j of jogos) {
      const ganhador = j.wo ? `WO->${j.vencedor_campus_id}` : (j.placar_1 > j.placar_2 ? j.campus_1 : j.placar_2 > j.placar_1 ? j.campus_2 : 'EMPATE');
      console.log(`ModID=${j.modalidade_id} "${j.genero}" #${j.id} Ch${j.numero_chave}(id=${j.chave_id}): ${j.campus_1} ${j.placar_1}x${j.placar_2} ${j.campus_2} => ${ganhador}`);
    }

    console.log('\n=== CLASSIFICACAO COMPLETA POR MODALIDADE ===');
    const [classif] = await db.query(`
      SELECT cg.modalidade_id, cg.chave_id, cg.campus_id, m.nome AS mod_nome, m.genero,
             ch.numero_chave, c.nome AS campus_nome,
             cg.pontos, cg.jogos_jogados, cg.vitorias, cg.empates, cg.derrotas,
             cg.pontos_pro, cg.pontos_contra
      FROM classificacao_grupos cg
      LEFT JOIN campus c ON c.id = cg.campus_id
      LEFT JOIN modalidades m ON m.id = cg.modalidade_id
      LEFT JOIN chaves ch ON ch.id = cg.chave_id
      WHERE m.nome LIKE '%utsal%'
      ORDER BY cg.modalidade_id, cg.chave_id, cg.pontos DESC
    `);

    let lastMod = null;
    for (const c of classif) {
      const modKey = `${c.modalidade_id}-${c.genero}`;
      if (modKey !== lastMod) {
        console.log(`\n--- ${c.mod_nome} ${c.genero} (ID=${c.modalidade_id}) ---`);
        lastMod = modKey;
      }
      const sg = c.pontos_pro - c.pontos_contra;
      console.log(`  Ch${c.numero_chave}: ${c.campus_nome} => ${c.pontos}pts ${c.jogos_jogados}PJ ${c.vitorias}V ${c.empates}E ${c.derrotas}D GP=${c.pontos_pro} GC=${c.pontos_contra} SG=${sg}`);
    }

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
