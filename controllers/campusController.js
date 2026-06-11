const campusModel = require('../models/campusModel');
const adminModel = require('../models/adminModel');

// Exibe as modalidades já inscritas pelo campus logado.
function renderInscricoes(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  res.render('campus/inscrições', {
    title: 'Inscrição de Modalidades',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    modalidadesInscritas: campusModel.getInscricoes(nomeCampus),
    nomeCampus
  });
}

// Salva as modalidades escolhidas no painel do campus.
function salvarInscricoes(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  campusModel.salvarInscricoes(nomeCampus, req.body.modalidades || []);
  res.redirect('/campus/inscricoes');
}

// Mostra a lista de atletas do campus para cadastro ou substituição.
function renderAtletas(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  res.render('campus/atletas', {
    title: 'Gerenciar Atletas',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    faseAtual: 'regular',
    atletas: campusModel.getAtletas(nomeCampus),
    nomeCampus
  });
}

// Cadastra um atleta com status regular.
function cadastrarAtleta(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  campusModel.cadastrarAtleta(nomeCampus, {
    nome: req.body.nome,
    matricula: req.body.matricula,
    modalidade: req.body.modalidade || 'Futsal Masculino',
    genero: req.body.genero || 'Masculino',
    dataNascimento: req.body.dataNascimento
  });
  res.redirect('/campus/atletas');
}

// Registra uma substituição com status pendente de laudo.
function substituirAtleta(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  campusModel.substituirAtleta(nomeCampus, {
    nome: req.body.nome,
    matricula: req.body.matricula,
    modalidade: req.body.modalidade || 'Futsal Masculino',
    motivo: req.body.motivo || 'Substituição por laudo'
  });
  res.redirect('/campus/atletas');
}

// Lista os jogos relacionados ao campus autenticado.
async function renderJogos(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  const jogos = await adminModel.getJogos();
  const jogosCampus = jogos.filter((jogo) =>
    jogo.casa === nomeCampus || jogo.fora === nomeCampus
  );

  res.render('campus/jogos', {
    title: 'Jogos do Campus',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    nomeCampus,
    jogosCampus
  });
}

module.exports = {
  renderInscricoes,
  salvarInscricoes,
  renderAtletas,
  cadastrarAtleta,
  substituirAtleta,
  renderJogos
};
