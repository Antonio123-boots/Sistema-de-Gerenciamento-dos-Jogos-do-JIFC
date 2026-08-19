const juizService = require('../services/juizService');
const { validationResult } = require('express-validator');

function extrairErros(req) {
  const erros = validationResult(req);
  return erros.isEmpty() ? null : erros.array().map((e) => e.msg).join('; ');
}

/* ========== Admin: CRUD de Juízes ========== */

async function renderListar(req, res) {
  const juizes = await juizService.listarJuizes();
  res.render('adm/juizes', {
    title: 'Gerenciar Juízes',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    juizes,
    mensagemSucesso: req.query.ok || null,
    mensagemErro: req.query.erro || null
  });
}

async function renderCadastrar(req, res) {
  const esportes = await juizService.obterEsportesUnicos();
  res.render('adm/cadastrarJuiz', {
    title: 'Cadastrar Juiz',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esportes,
    juizEdicao: null,
    mensagemErro: null
  });
}

async function handleCadastrar(req, res) {
  const erro = extrairErros(req);
  if (erro) {
    const esportes = await juizService.obterEsportesUnicos();
    return res.render('adm/cadastrarJuiz', {
      title: 'Cadastrar Juiz',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esportes,
      juizEdicao: null,
      mensagemErro: erro
    });
  }

  const { nome, email, senha, esportes } = req.body;
  try {
    await juizService.cadastrarJuiz({ nome, email, senha, esportes });
    res.redirect('/admin/juizes?ok=Cadastro realizado com sucesso');
  } catch (e) {
    const esportes = await juizService.obterEsportesUnicos();
    res.render('adm/cadastrarJuiz', {
      title: 'Cadastrar Juiz',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esportes,
      juizEdicao: null,
      mensagemErro: 'E-mail já cadastrado ou dados inválidos.'
    });
  }
}

async function renderEditar(req, res) {
  const juiz = await juizService.buscarJuizPorId(Number(req.params.id));
  if (!juiz) return res.redirect('/admin/juizes?erro=Juiz não encontrado');
  const esportes = await juizService.obterEsportesUnicos();
  res.render('adm/cadastrarJuiz', {
    title: 'Editar Juiz',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esportes,
    juizEdicao: juiz,
    mensagemErro: null
  });
}

async function handleEditar(req, res) {
  const erro = extrairErros(req);
  if (erro) {
    const juiz = await juizService.buscarJuizPorId(Number(req.params.id));
    const esportes = await juizService.obterEsportesUnicos();
    return res.render('adm/cadastrarJuiz', {
      title: 'Editar Juiz',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esportes,
      juizEdicao: juiz,
      mensagemErro: erro
    });
  }

  const { nome, email, senha, esportes } = req.body;
  await juizService.atualizarJuiz(Number(req.params.id), { nome, email, senha, esportes });
  res.redirect('/admin/juizes?ok=Alterações salvas');
}

async function handleExcluir(req, res) {
  await juizService.excluirJuiz(Number(req.params.id));
  res.redirect('/admin/juizes?ok=Juiz removido');
}

/* ========== Juiz: Perfil + Jogos + Placar ========== */

async function renderPerfil(req, res) {
  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  res.render('juiz/perfil', {
    title: 'Painel do Juiz',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esportes
  });
}

async function renderJogos(req, res) {
  const esporte = req.params.esporte;
  const jogos = await juizService.obterJogosPorEsporte(esporte);
  const esportesDoJuiz = await juizService.obterEsportesDoJuiz(req.user.juizId);
  res.render('juiz/jogos', {
    title: esporte,
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esporte,
    jogos,
    esportesDoJuiz
  });
}

async function renderPlacar(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz?erro=Jogo não encontrado');
  res.render('juiz/placar', {
    title: 'Atualizar Placar',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    jogo,
    mensagemErro: null
  });
}

async function handleSalvarPlacar(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz?erro=Jogo não encontrado');

  const { placar1, placar2, status } = req.body;
  await juizService.salvarPlacar(req.params.jogoId, { placar1, placar2, status });

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  res.render('juiz/perfil', {
    title: 'Painel do Juiz',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esportes,
    mensagemSucesso: 'Placar atualizado!'
  });
}

module.exports = {
  renderListar,
  renderCadastrar,
  handleCadastrar,
  renderEditar,
  handleEditar,
  handleExcluir,
  renderPerfil,
  renderJogos,
  renderPlacar,
  handleSalvarPlacar
};
