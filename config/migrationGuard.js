// Registro durável de migrações já aplicadas.
//
// O state store (JSON) não é fonte confiável para flags de migração: ele pode
// ser reiniciado/sobrescrito e perde o controle quando o arquivo é regravado.
// Por isso as migrações one-shot usam esta tabela no MySQL.
const db = require('./db');

const TABELA = 'migracoes_aplicadas';

let tabelaPronta = false;

async function garantirTabelaMigracoes() {
  if (tabelaPronta) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABELA} (
      chave VARCHAR(190) NOT NULL PRIMARY KEY,
      executada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  tabelaPronta = true;
}

async function migracaoJaExecutada(chave) {
  await garantirTabelaMigracoes();

  const [linhas] = await db.query(
    `SELECT COUNT(*) AS total FROM ${TABELA} WHERE chave = ?`,
    [String(chave)]
  );

  return Number(linhas?.[0]?.total || 0) > 0;
}

async function registrarMigracao(chave) {
  await garantirTabelaMigracoes();

  await db.query(
    `INSERT INTO ${TABELA} (chave) VALUES (?) ON DUPLICATE KEY UPDATE executada_em = CURRENT_TIMESTAMP`,
    [String(chave)]
  );
}

async function executarMigracaoUnica(chave, callback) {
  if (await migracaoJaExecutada(chave)) {
    return { executada: false, resultado: null };
  }

  const resultado = await callback();
  await registrarMigracao(chave);

  return { executada: true, resultado };
}

module.exports = {
  garantirTabelaMigracoes,
  migracaoJaExecutada,
  registrarMigracao,
  executarMigracaoUnica
};
