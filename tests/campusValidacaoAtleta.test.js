const assert = require('assert');
const campusModel = require('../models/campusModel');

const { validarDadosCadastroAtleta } = campusModel;

const camposValidos = {
  nome: 'João Silva',
  matricula: '123456789',
  genero: 'Masculino',
  dataNascimento: '2008-05-10',
  cpf: '12345678900',
  status: 'Analise',
  modalidades: ['Futsal Masculino', 'Atletismo Masculino'],
  atletismoProvas: ['100m'],
  tenisMesaParticipacoes: []
};

function validar(alteracoes = {}) {
  const campos = { ...camposValidos, ...(alteracoes.campos || {}) };
  const dados = { ...campos, ...(alteracoes.dados || {}) };
  return validarDadosCadastroAtleta({
    campos,
    dados,
    opcoes: { anoEvento: 2026 },
    matriculaDuplicada: Boolean(alteracoes.matriculaDuplicada),
    limiteRegularTotalCampus: alteracoes.limiteRegularTotalCampus || 0,
    contagemParaLimite: alteracoes.contagemParaLimite || 0
  });
}

function esperaErro(exec, code) {
  assert.throws(exec, (erro) => erro && erro.code === code, `Deveria lançar ${code}`);
}

esperaErro(() => validar({ matriculaDuplicada: true }), 'MATRICULA_DUPLICADA');
esperaErro(() => validar({ campos: { dataNascimento: 'inválida' } }), 'DATA_INVALIDA');
esperaErro(() => validar({ campos: { nome: 'João' } }), 'NOME_INCOMPLETO');
esperaErro(() => validar({ campos: { dataNascimento: '2005-01-01' } }), 'IDADE_LIMITE_EXCEDIDO');
esperaErro(() => validar({ campos: { modalidades: [] } }), 'MODALIDADES_OBRIGATORIAS');
esperaErro(() => validar({ campos: { modalidades: ['A', 'B', 'C', 'D'] } }), 'MODALIDADES_EXCEDIDAS');
esperaErro(() => validar({ limiteRegularTotalCampus: 10, contagemParaLimite: 10 }), 'LIMITE_REGULAR_EXCEDIDO');

const ok = validar();
assert.strictEqual(ok.nomeCompleto, 'João Silva');
assert.strictEqual(ok.detalhesAtleta.atletismoProvas[0], '100m');
assert.deepStrictEqual(ok.modalidadesSelecionadas, ['Futsal Masculino', 'Atletismo Masculino']);
assert.strictEqual(ok.matriculaNormalizada, '123456789');

esperaErro(() => validar({ dados: { atletismoProvas: [] } }), 'PROVAS_ATLETISMO_OBRIGATORIAS');

console.log('Teste de validação de atleta (cadastrar/atualizar) concluído com sucesso.');