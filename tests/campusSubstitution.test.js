const assert = require('assert');
const path = require('path');
const ejs = require('ejs');
const campusController = require('../controllers/campusController');
const campusModel = require('../models/campusModel');
const adminModel = require('../models/adminModel');
const substitutionDocumentStore = require('../services/substitutionDocumentStore');

const dadosDoSubstituto = campusModel.prepararDadosSubstituicao({
  genero: 'Feminino',
  modalidades: ['Atletismo Feminino', 'Xadrez Feminino'],
  atletismoProvas: ['100m rasos'],
  tenisMesaParticipacoes: ['Individual']
});
assert.strictEqual(dadosDoSubstituto.genero, 'Feminino');
assert.deepStrictEqual(dadosDoSubstituto.modalidades, ['Atletismo Feminino', 'Xadrez Feminino']);
assert.deepStrictEqual(dadosDoSubstituto.atletismoProvas, ['100m rasos']);
assert.deepStrictEqual(dadosDoSubstituto.tenisMesaParticipacoes, ['Individual']);

const getConfiguracoesOriginal = adminModel.getConfiguracoes;
const substituirAtletaOriginal = campusModel.substituirAtleta;
const armazenarDocumentoOriginal = substitutionDocumentStore.armazenarDocumento;

assert.strictEqual(substitutionDocumentStore.identificarFormato(Buffer.from('%PDF-1.7')).extensao, 'pdf');
assert.strictEqual(substitutionDocumentStore.resolverDocumento('../documento.pdf'), null);
assert.ok(!substitutionDocumentStore.resolverDocumento('00000000-0000-0000-0000-000000000000.pdf').includes(`${path.sep}public${path.sep}`));

function dataHoje() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

function criarResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(message) {
      this.message = message;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };
}

function criarRequest() {
  return {
    user: { nome: 'Campus Teste' },
    file: { buffer: Buffer.from('fake validated document') },
    body: {
      nome: 'Atleta Substituto',
      matricula: '202611020',
      cpf: '12345678900',
      dataNascimento: '2008-05-10',
      genero: 'Masculino',
      modalidades: ['Futsal Masculino'],
      atletaSubstituidoId: '4'
    }
  };
}

(async () => {
  let chamadasSubstituicao = 0;
  try {
    await assert.rejects(
      campusModel.substituirAtleta('Campus Teste', { atletaSubstituidoId: '' }),
      (error) => error.code === 'ATLETA_SUBSTITUICAO_INVALIDA'
    );

    adminModel.getConfiguracoes = () => ({
      inicio_substituicao_atletas: '',
      fim_substituicao_atletas: '',
      inicio_inscricao_atletas: dataHoje(),
      fim_inscricao_atletas: dataHoje()
    });
    campusModel.substituirAtleta = async () => { chamadasSubstituicao += 1; };

    const responseSemPrazo = criarResponse();
    await campusController.substituirAtleta(criarRequest(), responseSemPrazo);
    assert.strictEqual(responseSemPrazo.statusCode, 403);
    assert.strictEqual(chamadasSubstituicao, 0);

    adminModel.getConfiguracoes = () => ({
      inicio_substituicao_atletas: dataHoje(),
      fim_substituicao_atletas: dataHoje()
    });
    const requestSemDocumento = criarRequest();
    delete requestSemDocumento.file;
    const responseSemDocumento = criarResponse();
    await campusController.substituirAtleta(requestSemDocumento, responseSemDocumento);
    assert.match(decodeURIComponent(responseSemDocumento.redirectUrl), /Anexe um comprovante/);
    assert.strictEqual(chamadasSubstituicao, 0);

    substitutionDocumentStore.armazenarDocumento = async () => '00000000-0000-0000-0000-000000000000.pdf';
    const responseNoPrazo = criarResponse();
    await campusController.substituirAtleta(criarRequest(), responseNoPrazo);
    assert.strictEqual(chamadasSubstituicao, 1);
    assert.match(responseNoPrazo.redirectUrl, /Substitui%C3%A7%C3%A3o%20realizada%20com%20sucesso/);

    const html = await ejs.renderFile(path.join(__dirname, '../views/campus/inscricoes.ejs'), {
      csrfToken: 'token-teste',
      modalidadesDisponiveis: [{ nome: 'Futsal Masculino', genero: 'Masculino' }],
      modalidadesInscritas: [],
      atletas: [{ id: 4, nome: 'Atleta indisponível', status: 'Regular', substituido: false, modalidade: '' }],
      nomeCampus: 'Campus Teste',
      prazoModalidadesAberto: false,
      prazoAtletasAberto: false,
      prazoSubstituicaoAberto: true,
      prazosSubstituicao: { inicio: dataHoje(), fim: dataHoje() },
      abaAtiva: 'atletas',
      quantidadeRegulares: 1,
      quantidadePendentes: 0,
      limiteAtletasTotalCampus: 0
    });
    assert.match(html, /name="atletaSubstituidoId"/);
    assert.match(html, /formaction="\/campus\/atletas\/substituir"/);
    assert.doesNotMatch(html, /formaction="\/campus\/atletas\/cadastrar"/);
    assert.match(html, /name="genero"/);
    assert.match(html, /name="modalidades"/);
    assert.match(html, /name="documentoSubstituicao"[^>]*required/);
    assert.match(html, /class="substitution-document-input"/);
    assert.match(html, /dados esportivos próprios do novo atleta/);
    assert.match(html, /color:#141414; background-color:#fff/);

    const htmlComCadastroAberto = await ejs.renderFile(path.join(__dirname, '../views/campus/inscricoes.ejs'), {
      csrfToken: 'token-teste',
      modalidadesDisponiveis: [{ nome: 'Futsal Masculino', genero: 'Masculino' }],
      modalidadesInscritas: ['Futsal Masculino'],
      atletas: [{ id: 4, nome: 'Atleta indisponível', status: 'Regular', substituido: false, modalidade: 'Futsal Masculino' }],
      nomeCampus: 'Campus Teste',
      prazoModalidadesAberto: false,
      prazoAtletasAberto: true,
      prazoSubstituicaoAberto: true,
      prazosSubstituicao: { inicio: dataHoje(), fim: dataHoje() },
      abaAtiva: 'atletas',
      quantidadeRegulares: 1,
      quantidadePendentes: 0,
      limiteAtletasTotalCampus: 0
    });
    const campoComprovante = htmlComCadastroAberto.match(/<input type="file" name="documentoSubstituicao"[^>]*>/)[0];
    assert.doesNotMatch(campoComprovante, /\srequired(?:\s|>)/);
    assert.match(htmlComCadastroAberto, /formaction="\/campus\/atletas\/cadastrar" onclick="this\.form\.elements\.documentoSubstituicao\.required = false"/);
    assert.match(htmlComCadastroAberto, /formaction="\/campus\/atletas\/substituir" onclick="this\.form\.elements\.documentoSubstituicao\.required = true"/);

    console.log('Substituição respeita o prazo, exige dados próprios e comprovante sem bloquear cadastro normal.');
  } finally {
    adminModel.getConfiguracoes = getConfiguracoesOriginal;
    campusModel.substituirAtleta = substituirAtletaOriginal;
    substitutionDocumentStore.armazenarDocumento = armazenarDocumentoOriginal;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});