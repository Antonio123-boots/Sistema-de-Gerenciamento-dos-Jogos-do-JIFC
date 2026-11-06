const assert = require('assert');

const dbPath = require.resolve('../config/db');
require(dbPath);
const dbCache = require.cache[dbPath];
const dbOriginal = dbCache.exports;
const schemaPath = require.resolve('../config/ensureSchema');
const queries = [];

dbCache.exports = {
  async query(sql) {
    queries.push(sql);
    if (sql.includes('information_schema.tables')) return [[{ total: 1 }]];
    if (sql.includes('information_schema.columns')) {
      if (sql.includes("table_name = 'substituicoes_atletas'")) {
        return [[{ column_name: 'id' }]];
      }
      return [[
        { column_name: 'inicio_inscricao_modalidades', is_nullable: 'YES' },
        { column_name: 'fim_inscricao_modalidades', is_nullable: 'YES' },
        { column_name: 'inicio_inscricao_atletas', is_nullable: 'YES' },
        { column_name: 'fim_inscricao_atletas', is_nullable: 'YES' },
        { column_name: 'inicio_sorteio_chaves', is_nullable: 'YES' },
        { column_name: 'fim_sorteio_chaves', is_nullable: 'YES' }
      ]];
    }
    if (sql.includes('information_schema.table_constraints')) {
      return [[{ constraint_name: 'chk_fluxo_cronologico' }]];
    }
    return [{ affectedRows: 0 }];
  }
};

delete require.cache[schemaPath];
const { ensureConfiguracoesEventoTable, ensureSubstituicoesAtletasTable } = require('../config/ensureSchema');

(async () => {
  try {
    await ensureConfiguracoesEventoTable();
    assert.ok(queries.some((sql) => sql.includes('ADD COLUMN inicio_substituicao_atletas DATE NULL')));
    assert.ok(queries.some((sql) => sql.includes('ADD COLUMN fim_substituicao_atletas DATE NULL')));
    assert.ok(queries.includes('ALTER TABLE configuracoes_evento DROP CHECK chk_fluxo_cronologico'));
    await ensureSubstituicoesAtletasTable();
    assert.ok(queries.some((sql) => sql.includes('ALTER TABLE substituicoes_atletas ADD COLUMN documento_path VARCHAR(255) DEFAULT NULL')));
    console.log('Migração permite prazos independentes e mantém as datas enviadas.');
  } finally {
    dbCache.exports = dbOriginal;
    delete require.cache[schemaPath];
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});