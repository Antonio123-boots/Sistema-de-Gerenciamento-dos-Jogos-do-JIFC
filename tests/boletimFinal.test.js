const assert = require('node:assert/strict');
const {
  detectarEncerramentoJifc,
  montarResumoBoletim,
  aplicarFinaisAoBoletim,
  aplicarPodiosIndividuais,
  obterBoletimCompleto,
  listarAnosComBoletim
} = require('../services/boletimService');

const encerrado = detectarEncerramentoJifc({
  totalJogos: 12,
  totalEncerrados: 12,
  totalAgendados: 0,
  totalEmAndamento: 0,
  totalCancelados: 0
});
assert.equal(encerrado, true);

const incompleto = detectarEncerramentoJifc({
  totalJogos: 12,
  totalEncerrados: 10,
  totalAgendados: 1,
  totalEmAndamento: 1,
  totalCancelados: 0
});
assert.equal(incompleto, false);

// Jogo 'Cancelado' é terminal: não pode travar o encerramento do JIFC.
const comCancelado = detectarEncerramentoJifc({
  totalJogos: 12,
  totalEncerrados: 10,
  totalAgendados: 0,
  totalEmAndamento: 0,
  totalCancelados: 2
});
assert.equal(comCancelado, true);

// Todos cancelados = não houve evento, logo o JIFC não está encerrado.
const todosCancelados = detectarEncerramentoJifc({
  totalJogos: 12,
  totalEncerrados: 0,
  totalAgendados: 0,
  totalEmAndamento: 0,
  totalCancelados: 12
});
assert.equal(todosCancelados, false);

// Status inesperado/NULL continua pendente e impede o encerramento.
const comPendente = detectarEncerramentoJifc({
  totalJogos: 3,
  totalEncerrados: 2,
  totalAgendados: 0,
  totalEmAndamento: 0,
  totalCancelados: 0,
  totalPendentes: 1
});
assert.equal(comPendente, false);

const resumo = montarResumoBoletim({
  ano: 2025,
  ranking: [
    { campi: 'Campus A', pontos: 96 },
    { campi: 'Campus B', pontos: 90 }
  ],
  modalidades: [
    { nome: 'Basquete', campeao: 'Campus A', vice: 'Campus B' }
  ],
  dataGeracao: '2026-08-31'
});

assert.equal(resumo.ano, 2025);
assert.equal(resumo.ranking[0].campi, 'Campus A');
assert.equal(resumo.modalidades[0].nome, 'Basquete');
assert.ok(resumo.dataGeracao);

const modalidadesComFaseDeGrupo = [
  { modalidade_id: 1, modalidade: 'Futsal', campeao: 'Campus A', vice: 'Campus B' },
  { modalidade_id: 2, modalidade: 'Xadrez', campeao: 'Campus C', vice: 'Campus D' }
];
const podiosAtualizados = aplicarFinaisAoBoletim(modalidadesComFaseDeGrupo, [{
  modalidade_id: 1,
  status: 'Encerrado',
  campus_1_id: 10,
  campus_2_id: 20,
  campus_1: 'Campus A',
  campus_2: 'Campus B',
  placar_1: 1,
  placar_2: 3
}]);
assert.deepEqual(podiosAtualizados, [
  { modalidade_id: 2, modalidade: 'Xadrez', campeao: 'Campus C', vice: 'Campus D' },
  { modalidade_id: 1, modalidade: 'Futsal', nome: 'Futsal', campeao: 'Campus B', vice: 'Campus A' }
]);

const finaisComMaisDeUmaSubcategoria = aplicarFinaisAoBoletim([], [
  { modalidade_id: 3, modalidade: 'Tênis de Mesa', sub_categoria: 'individual', status: 'Encerrado', campus_1_id: 10, campus_2_id: 20, campus_1: 'Campus A', campus_2: 'Campus B', placar_1: 3, placar_2: 1 },
  { modalidade_id: 3, modalidade: 'Tênis de Mesa', sub_categoria: 'dupla', status: 'Encerrado', campus_1_id: 20, campus_2_id: 10, campus_1: 'Campus B', campus_2: 'Campus A', placar_1: 3, placar_2: 2 }
]);
assert.deepEqual(finaisComMaisDeUmaSubcategoria.map((item) => item.nome), [
  'Tênis de Mesa (individual)',
  'Tênis de Mesa (dupla)'
]);

const podiosIndividualizados = aplicarPodiosIndividuais([
  { modalidade_id: 4, modalidade: 'Atletismo', genero: 'Masculino', campeao: '—', vice: '—' },
  { modalidade_id: 5, modalidade: 'Xadrez', genero: 'Misto', campeao: '—', vice: '—' }
], {
  atletismoPorGenero: {
    masculino: [
      { campus_nome: 'Campus E', pontos: 26 },
      { campus_nome: 'Campus F', pontos: 18 }
    ]
  },
  xadrezPorModalidade: {
    5: [
      { campus_nome: 'Campus G', pontos: 12 },
      { campus_nome: 'Campus H', pontos: 9 }
    ]
  }
});
assert.deepEqual(podiosIndividualizados.map((item) => [item.campeao, item.vice]), [
  ['Campus E', 'Campus F'],
  ['Campus G', 'Campus H']
]);

assert.equal(typeof obterBoletimCompleto, 'function');
assert.equal(typeof listarAnosComBoletim, 'function');

(async () => {
  const semAno = await obterBoletimCompleto(0);
  assert.equal(semAno, null);

  console.log('Teste de boletim final concluído com sucesso.');
})().catch((erro) => {
  console.error('Falha no teste de boletim final:', erro);
  process.exit(1);
});
