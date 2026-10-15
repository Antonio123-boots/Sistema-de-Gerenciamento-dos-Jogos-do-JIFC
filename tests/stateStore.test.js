const assert = require('node:assert/strict');
const { parseState } = require('../models/stateStore');

assert.deepEqual(parseState('{"configuracoes":{"ano_evento":2026}}'), {
  configuracoes: { ano_evento: 2026 }
});
assert.throws(() => parseState('{json quebrado}', 'teste'), /estado local está inválido \(teste\)/);
assert.throws(() => parseState('[]', 'teste'), /precisa ser um objeto JSON/);

console.log('Teste de leitura explícita de estado local concluído com sucesso.');
