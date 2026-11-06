const assert = require('assert');
const campusController = require('../controllers/campusController');
const campusModel = require('../models/campusModel');
const adminModel = require('../models/adminModel');

const originaisCampus = {};
const funcoesCampus = [
  'carregarCacheDeInscricoesEAtletas',
  'getAtletas',
  'getInscricoes',
  'getQuantidadeRegulares',
  'getQuantidadePendentes',
  'getQuantidadeAnalise',
  'getQuantidadeReprovados',
  'getQuantidadeTotal',
  'getQuantidadeDisponivelRegular'
];
for (const nome of funcoesCampus) originaisCampus[nome] = campusModel[nome];
const getConfiguracoesOriginal = adminModel.getConfiguracoes;

(async () => {
  let recarregado = false;
  try {
    campusModel.carregarCacheDeInscricoesEAtletas = async () => { recarregado = true; };
    for (const nome of funcoesCampus.slice(1)) {
      campusModel[nome] = () => {
        assert.strictEqual(recarregado, true, 'O cache deve ser recarregado antes de ler atletas.');
        return nome === 'getAtletas' ? [{ id: 5, nome: 'Atleta recém-carregado' }] : [];
      };
    }
    adminModel.getConfiguracoes = () => ({ ano_evento: 2026, limite_atletas_total_campus: 60 });

    const response = {
      status(code) { this.statusCode = code; return this; },
      send(message) { this.message = message; return this; },
      render(view, dados) { this.view = view; this.dados = dados; return this; }
    };

    await campusController.renderAtletas({
      user: { nome: 'IFC Teste', email: 'teste@ifc.edu.br' },
      query: {}
    }, response);

    assert.strictEqual(response.view, 'campus/atletas');
    assert.deepStrictEqual(response.dados.atletas, [{ id: 5, nome: 'Atleta recém-carregado' }]);
    console.log('A lista do campus recarrega os atletas atuais do banco.');
  } finally {
    for (const nome of funcoesCampus) campusModel[nome] = originaisCampus[nome];
    adminModel.getConfiguracoes = getConfiguracoesOriginal;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});