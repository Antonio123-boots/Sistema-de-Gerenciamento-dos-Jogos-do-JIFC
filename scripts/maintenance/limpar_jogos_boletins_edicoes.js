const path = require('path');
const fs = require('fs');
const db = require('../../config/db');
const stateStore = require('../../models/stateStore');

async function tableExists(name) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1",
    [table, column]
  );
  return rows.length > 0;
}

(async () => {
  try {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');

    const tablesToClear = [
      'cartoes',
      'resultados_por_sets',
      'resultados_coletivos',
      'resultados_atletismo',
      'resultados_xadrez',
      'classificacao_grupos',
      'jogos',
      'chaves',
      'boletins_finais',
      'edicoes_anteriores',
      'rascunho_edicoes'
    ];

    for (const table of tablesToClear) {
      if (await tableExists(table)) {
        await db.query(`DELETE FROM \`${table}\``);
        console.log(`cleared: ${table}`);
      }
    }

    if (await tableExists('campus_modalidade')) {
      if (await columnExists('campus_modalidade', 'ordem_sorteio')) {
        await db.query('UPDATE campus_modalidade SET chave_id = NULL, ordem_sorteio = NULL');
      } else {
        await db.query('UPDATE campus_modalidade SET chave_id = NULL');
      }
      console.log('reset: campus_modalidade');
    }

    if (await tableExists('provas') && await columnExists('provas', 'publicada')) {
      await db.query('UPDATE provas SET publicada = 0');
      console.log('reset: provas.publicada');
    }

    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    try {
      const state = stateStore.readState();
      for (const key of ['jogos', 'boletins', 'boletinsFinais', 'edicoes', 'edicoesAnteriores', 'rascunhosEdicao', 'rascunhoEdicoes', 'chaveamento', 'chaves']) {
        if (Object.prototype.hasOwnProperty.call(state, key)) delete state[key];
      }
      stateStore.writeState(state);
      console.log('cleaned: data/jifc-state.json');
    } catch (e) {
      console.log('state skip:', e.message);
    }

    console.log('done');
    await db.end();
    process.exit(0);
  } catch (err) {
    console.error(err);
    try { await db.end(); } catch (_) {}
    process.exit(1);
  }
})();
