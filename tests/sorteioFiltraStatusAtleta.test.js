const assert = require('node:assert/strict');
const path = require('node:path');

// Mock do config/db antes de carregar o serviço: registramos o SQL executado
// para garantir que o sorteio só considere atletas aprovados no laudo.
const dbPath = require.resolve('../config/db');
const chamadas = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params) => {
      const texto = String(sql);
      chamadas.push({ sql: texto, params: params || [] });

      if (/FROM\s+modalidades/i.test(texto)) {
        const modalidadeId = Number((params || [])[0] || 0);
        if (modalidadeId === 1) {
          return [[{ id: 1, nome: 'Futsal Masculino', tipo_confronto: 'Coletivo', genero: 'Masculino' }]];
        }
        return [[{ id: modalidadeId, nome: 'Atletismo 100m', tipo_confronto: 'Individual', genero: 'Masculino' }]];
      }

      return [[]];
    }
  },
  children: [],
  paths: []
};

const { buscarParticipantesModalidade } = require('../services/chaveamentoService');
const { STATUS_ATLETA_APROVADO, STATUS_ANALISE } = require('../utils/statusAtleta');

function consultaDeAtletas() {
  return chamadas.find((chamada) => /FROM\s+atletas\s+a/i.test(chamada.sql) && /nome_atleta/.test(chamada.sql));
}

(async () => {
  // Modalidade coletiva: só campus vinculados entram.
  chamadas.length = 0;
  await buscarParticipantesModalidade(1, '');
  assert.equal(consultaDeAtletas(), undefined, 'Modalidade coletiva não deve consultar atletas individuais.');

  // Modalidade individual: o filtro de status precisa estar presente.
  chamadas.length = 0;
  await buscarParticipantesModalidade(2, 'individual');
  const consulta = consultaDeAtletas();
  assert.ok(consulta, 'A consulta de atletas deveria ter sido executada.');
  assert.match(consulta.sql, /a\.status\s*=\s*\?/i, 'A consulta deve filtrar por a.status.');
  assert.ok(
    consulta.params.includes(STATUS_ATLETA_APROVADO),
    `A consulta deve filtrar pelo status "${STATUS_ATLETA_APROVADO}".`
  );
  assert.ok(
    !consulta.params.includes(STATUS_ANALISE.PENDENTE),
    'Atletas pendentes de laudo não podem entrar no sorteio.'
  );

  console.log('Teste de filtro de status no sorteio concluído com sucesso.');
})().catch((erro) => {
  console.error('Falha no teste de filtro de status no sorteio:', erro);
  process.exit(1);
});
