const juizService = require('../services/juizService');
const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
const { validationResult } = require('express-validator');
const { obterRegras } = require('../utils/sportClassificationRules');

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
  if (esportes.length === 1) {
    return res.redirect('/juiz/' + encodeURIComponent(esportes[0]));
  }
  res.render('juiz/perfil', {
    title: 'Painel do Juiz',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esportes
  });
}

async function renderJogos(req, res) {
  const esporte = req.params.esporte;
  const genero = req.query.genero || null;

  if (resultadosIndividuaisService.ehEsporteIndividual(esporte)) {
    return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados' + (genero ? '?genero=' + encodeURIComponent(genero) : ''));
  }

  await juizService.atualizarStatusAutomatico();
  const jogos = await juizService.obterJogosPorEsporte(esporte, genero);
  const esportesDoJuiz = await juizService.obterEsportesDoJuiz(req.user.juizId);
  res.render('juiz/jogos', {
    title: esporte,
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esporte,
    jogos,
    esportesDoJuiz,
    generoFiltro: genero,
    mensagemSucesso: req.query.ok || null
  });
}

async function renderPlacar(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
  const regras = obterRegras(jogo.modalidade);

  res.render('juiz/placar', {
    title: 'Atualizar Placar',
    usuarioLogado: req.user,
    mostrarFiltros: false,
    jogo,
    esporteVoltar: esporteDoJogo,
    regras,
    mensagemErro: null
  });
}

async function handleSalvarPlacar(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const { placar1, placar2, status, sets } = req.body;
  const regras = obterRegras(jogo.modalidade);

  const erro = extrairErros(req);
  if (erro) {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
    return res.render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: erro
    });
  }

  let setsParsed = [];
  if (Array.isArray(sets)) {
    setsParsed = sets
      .map((s, i) => ({ numero: i + 1, pontos_1: Number(s.pontos_1 || 0), pontos_2: Number(s.pontos_2 || 0) }))
      .filter(s => s.pontos_1 > 0 || s.pontos_2 > 0);
  }

  try {
    await juizService.salvarPlacar(req.params.jogoId, { placar1, placar2, status, sets: setsParsed });
  } catch (e) {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
    return res.render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: 'Erro ao salvar: ' + e.message
    });
  }

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
  res.redirect('/juiz/' + esporteRedirect + '?ok=Placar+atualizado');
}

async function handleAplicarWO(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const { campus_vencedor } = req.body;
  const regras = obterRegras(jogo.modalidade);

  if (!campus_vencedor) {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
    return res.render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: 'Selecione o campus vencedor do W.O.'
    });
  }

  try {
    await juizService.aplicarWO(req.params.jogoId, campus_vencedor);
  } catch (e) {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
    return res.render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: 'Erro ao aplicar W.O.: ' + e.message
    });
  }

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
  res.redirect('/juiz/' + esporteRedirect + '?ok=W.O.+aplicado+com+sucesso');
}

/* ========== Juiz: Resultados Individuais (Atletismo / Xadrez) ========== */

async function renderResultados(req, res) {
  const esporte = req.params.esporte;
  const genero = req.query.genero || null;
  const esportesDoJuiz = await juizService.obterEsportesDoJuiz(req.user.juizId);

  const [modalidades] = await require('../config/db').query(
    "SELECT id, nome, genero FROM modalidades WHERE nome = ? OR nome = CONCAT(?, ' Masculino') OR nome = CONCAT(?, ' Feminino')",
    [esporte, esporte, esporte]
  );

  let modalidadeAlvo = null;
  if (genero) {
    modalidadeAlvo = modalidades.find(m => m.genero === genero);
  }
  if (!modalidadeAlvo && modalidades.length) {
    modalidadeAlvo = modalidades[0];
  }
  if (!modalidadeAlvo) {
    return res.redirect('/juiz/' + encodeURIComponent(esporte));
  }

  const ehAtl = resultadosIndividuaisService.ehAtletismo(esporte + ' ' + (genero || ''));
  const ehXad = resultadosIndividuaisService.ehXadrez(esporte + ' ' + (genero || ''));

  if (ehAtl) {
    const provas = await resultadosIndividuaisService.obterProvasPorModalidade(modalidadeAlvo.id);
    const classificacao = await resultadosIndividuaisService.obterClassificacaoAtletismo(modalidadeAlvo.id);
    return res.render('juiz/resultados', {
      title: esporte,
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esporte,
      esportesDoJuiz,
      generoFiltro: genero,
      tipoEsporte: 'atletismo',
      modalidade: modalidadeAlvo,
      provas,
      classificacao,
      mensagemSucesso: req.query.ok || null,
      mensagemErro: req.query.erro || null
    });
  }

  if (ehXad) {
    const atletas = await resultadosIndividuaisService.obterAtletasPorModalidade(modalidadeAlvo.id);
    const resultados = await resultadosIndividuaisService.obterResultadosXadrez(modalidadeAlvo.id);
    return res.render('juiz/resultados', {
      title: esporte,
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esporte,
      esportesDoJuiz,
      generoFiltro: genero,
      tipoEsporte: 'xadrez',
      modalidade: modalidadeAlvo,
      atletas,
      resultados,
      mensagemSucesso: req.query.ok || null,
      mensagemErro: req.query.erro || null
    });
  }

  return res.redirect('/juiz/' + encodeURIComponent(esporte));
}

async function handleCriarProva(req, res) {
  const esporte = req.params.esporte;
  const { modalidade_id, nome, tipo_resultado, ordem } = req.body;
  try {
    await resultadosIndividuaisService.criarProva(Number(modalidade_id), nome, tipo_resultado, Number(ordem) || 0);
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?ok=Prova+criada');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent(e.message));
  }
}

async function handleExcluirProva(req, res) {
  const esporte = req.params.esporte;
  try {
    await resultadosIndividuaisService.excluirProva(Number(req.params.provaId));
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?ok=Prova+excluida');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent(e.message));
  }
}

async function renderResultadosProva(req, res) {
  const esporte = req.params.esporte;
  const provaId = Number(req.params.provaId);
  const esportesDoJuiz = await juizService.obterEsportesDoJuiz(req.user.juizId);

  const [provaRows] = await require('../config/db').query(
    'SELECT p.*, m.nome AS modalidade_nome FROM provas p JOIN modalidades m ON p.modalidade_id = m.id WHERE p.id = ?',
    [provaId]
  );
  if (!provaRows.length) {
    return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados');
  }
  const prova = provaRows[0];

  const atletas = await resultadosIndividuaisService.obterAtletasPorModalidade(prova.modalidade_id);
  const resultados = await resultadosIndividuaisService.obterResultadosPorProva(provaId);

  res.render('juiz/resultadosProva', {
    title: prova.nome,
    usuarioLogado: req.user,
    mostrarFiltros: false,
    esporte,
    esportesDoJuiz,
    prova,
    atletas,
    resultados,
    mensagemSucesso: req.query.ok || null,
    mensagemErro: req.query.erro || null
  });
}

async function handleSalvarResultadosProva(req, res) {
  const esporte = req.params.esporte;
  const provaId = Number(req.params.provaId);
  const { resultados } = req.body;
  try {
    await resultadosIndividuaisService.salvarResultadosProva(provaId, resultados || []);
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados/prova/' + provaId + '?ok=Resultados+salvos');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados/prova/' + provaId + '?erro=' + encodeURIComponent(e.message));
  }
}

async function handleSalvarResultadosXadrez(req, res) {
  const esporte = req.params.esporte;
  const { modalidade_id, resultados } = req.body;
  try {
    await resultadosIndividuaisService.salvarResultadosXadrez(Number(modalidade_id), resultados || []);
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?ok=Resultados+salvos');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent(e.message));
  }
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
  handleSalvarPlacar,
  handleAplicarWO,
  renderResultados,
  handleCriarProva,
  handleExcluirProva,
  renderResultadosProva,
  handleSalvarResultadosProva,
  handleSalvarResultadosXadrez
};
