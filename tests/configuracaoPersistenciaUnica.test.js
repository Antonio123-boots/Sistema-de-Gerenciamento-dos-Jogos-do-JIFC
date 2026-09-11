const assert = require('assert');
const fs = require('fs');
const path = require('path');
const stateStore = require('../models/stateStore');
const configService = require('../services/configService');

const caminhoState = stateStore.stateFilePath;
const backup = fs.existsSync(caminhoState) ? fs.readFileSync(caminhoState, 'utf8') : null;

function restaurarEstado() {
  if (backup === null) {
    try { fs.unlinkSync(caminhoState); } catch (_) { /* arquivo já não existia */ }
  } else {
    fs.writeFileSync(caminhoState, backup, 'utf8');
  }
}

(async () => {
  try {
    fs.mkdirSync(path.dirname(caminhoState), { recursive: true });
    fs.writeFileSync(caminhoState, JSON.stringify({
      configuracoes: { ano_evento: 2026, inicio_inscricao_modalidades: '2026-03-01' }
    }), 'utf8');

    // REGRESSÃO: antes, a gravação no MySQL era fire-and-forget e o erro era
    // engolido; o admin via "salvo" no JSON, mas o MySQL continuava com dados
    // antigos (divergência). Agora o banco é a fonte e o JSON só muda se o banco aceitar.
    const persistirFalha = async () => { throw new Error('Banco de dados fora do ar.'); };
    let rejeitou = false;
    try {
      await configService.salvarConfiguracoes(
        { inicio_evento: '2026-08-26', fim_evento: '2026-08-28' },
        persistirFalha
      );
    } catch (e) {
      rejeitou = true;
    }
    assert.strictEqual(rejeitou, true, 'Deveria rejeitar quando a gravação no banco falha.');

    const estadoPosFalha = JSON.parse(fs.readFileSync(caminhoState, 'utf8'));
    assert.strictEqual(
      estadoPosFalha.configuracoes.inicio_inscricao_modalidades,
      '2026-03-01',
      'O cache JSON não deve ser alterado quando o banco rejeita a gravação.'
    );

    const persistirOk = async () => {};
    await configService.salvarConfiguracoes(
      { inicio_evento: '2026-08-26', fim_evento: '2026-08-28' },
      persistirOk
    );
    const estadoPosOk = JSON.parse(fs.readFileSync(caminhoState, 'utf8'));
    assert.strictEqual(estadoPosOk.configuracoes.inicio_evento, '2026-08-26');
    assert.strictEqual(estadoPosOk.configuracoes.ano_evento, 2026);
  } finally {
    restaurarEstado();
  }
  console.log('Teste de persistência única (MySQL como fonte) concluído com sucesso.');
})().catch((erro) => {
  restaurarEstado();
  console.error(erro);
  process.exit(1);
});