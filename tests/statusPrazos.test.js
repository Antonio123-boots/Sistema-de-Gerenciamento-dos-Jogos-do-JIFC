const assert = require('assert');
const { obterStatusPrazos } = require('../utils/statusPrazos');

const config = {
  inicio_inscricao_modalidades: '2026-03-01',
  fim_inscricao_modalidades: '2026-03-20',
  inicio_inscricao_atletas: '2026-03-21',
  fim_inscricao_atletas: '2026-04-10',
  inicio_sorteio_chaves: '2026-04-15',
  fim_sorteio_chaves: '2026-04-20'
};

let s = obterStatusPrazos(config, '2026-03-05');
assert.strictEqual(s.prazoModalidadesAberto, true);
assert.strictEqual(s.prazoAtletasAberto, false);
assert.strictEqual(s.inscricoesAbertas, true);
assert.strictEqual(s.inscricoesEncerradas, false);
assert.strictEqual(s.prazoSorteioAberto, false);
assert.strictEqual(s.sorteioBloqueado, true);

s = obterStatusPrazos(config, '2026-04-01');
assert.strictEqual(s.prazoAtletasAberto, true);
assert.strictEqual(s.inscricoesAbertas, true);
assert.strictEqual(s.inscricoesEncerradas, false);

s = obterStatusPrazos(config, '2026-04-16');
assert.strictEqual(s.inscricoesEncerradas, true);
assert.strictEqual(s.sorteioDisponivelPorData, true);
assert.strictEqual(s.prazoSorteioAberto, true);
assert.strictEqual(s.sorteioBloqueado, false);

s = obterStatusPrazos(config, '2026-05-01');
assert.strictEqual(s.inscricoesEncerradas, true);
assert.strictEqual(s.sorteioDisponivelPorData, false);
assert.strictEqual(s.prazoSorteioAberto, false);
assert.strictEqual(s.sorteioBloqueado, true);

s = obterStatusPrazos({}, '2026-03-05');
assert.strictEqual(s.inscricoesConfiguradas, false);
assert.strictEqual(s.inscricoesAbertas, false);
assert.strictEqual(s.inscricoesEncerradas, false);
assert.strictEqual(s.resumoDisponivel, false);

console.log('Teste de status de prazos concluído com sucesso.');