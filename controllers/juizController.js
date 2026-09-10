const juizService = require('../services/juizService');
const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
const { ehTenisDeMesa, normalizarSubCategoriaFiltro } = require('../services/jogoService');
const { validationResult } = require('express-validator');
const { obterRegras } = require('../utils/sportClassificationRules');

function extrairErros(req) {
  const erros = validationResult(req);
  return erros.isEmpty() ? null : erros.array().map((e) => e.msg).join('; ');
}

function juizPodeEditarModalidade(esportesDoJuiz, modalidadeNome, modalidadeGenero) {
  const candidatos = [modalidadeNome];
  if (modalidadeGenero) candidatos.push(`${modalidadeNome} ${modalidadeGenero}`);
  return esportesDoJuiz.some((esporte) =>
    candidatos.some((candidato) =>
      esporte === candidato ||
      `${esporte} Masculino` === candidato ||
      `${esporte} Feminino` === candidato
    )
  );
}

async function obterNomeModalidadePorId(modalidadeId) {
  const [rows] = await require('../config/db').query('SELECT nome FROM modalidades WHERE id = ?', [Number(modalidadeId)]);
  return rows.length ? rows[0].nome : null;
}

async function obterModalidadeDaProva(provaId) {
  const [rows] = await require('../config/db').query(
    'SELECT m.nome, m.genero FROM provas p JOIN modalidades m ON p.modalidade_id = m.id WHERE p.id = ?',
    [Number(provaId)]
  );
  return rows.length ? rows[0] : null;
}

/* ========== Admin: CRUD de Juízes ========== */

async function renderListar(req, res) {
  try {
    const juizes = await juizService.listarJuizes();
    res.render('adm/juizes', {
      title: 'Gerenciar Juízes',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      juizes,
      mensagemSucesso: req.query.ok || null,
      mensagemErro: req.query.erro || null
    });
  } catch (err) {
    console.error('Erro ao listar juízes:', err);
    res.status(500).send('Erro ao carregar lista de juízes.');
  }
}

async function renderCadastrar(req, res) {
  try {
    const esportes = await juizService.obterEsportesUnicos();
    res.render('adm/cadastrarJuiz', {
      title: 'Cadastrar Juiz',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esportes,
      juizEdicao: null,
      mensagemErro: null
    });
  } catch (err) {
    console.error('Erro ao renderizar cadastro de juiz:', err);
    res.status(500).send('Erro ao carregar formulário de cadastro.');
  }
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
  try {
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
  } catch (err) {
    console.error('Erro ao renderizar edição de juiz:', err);
    res.status(500).send('Erro ao carregar formulário de edição.');
  }
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

  try {
    const { nome, email, senha, esportes } = req.body;
    await juizService.atualizarJuiz(Number(req.params.id), { nome, email, senha, esportes });
    res.redirect('/admin/juizes?ok=Alterações salvas');
  } catch (err) {
    console.error('Erro ao atualizar juiz:', err);
    const esportes = await juizService.obterEsportesUnicos();
    const juiz = await juizService.buscarJuizPorId(Number(req.params.id));
    res.render('adm/cadastrarJuiz', {
      title: 'Editar Juiz',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esportes,
      juizEdicao: juiz,
      mensagemErro: 'Erro ao salvar alterações. Tente novamente.'
    });
  }
}

async function handleExcluir(req, res) {
  try {
    await juizService.excluirJuiz(Number(req.params.id));
    res.redirect('/admin/juizes?ok=Juiz removido');
  } catch (err) {
    console.error('Erro ao excluir juiz:', err);
    res.redirect('/admin/juizes?erro=Erro ao remover juiz');
  }
}

/* ========== Juiz: Perfil + Jogos + Placar ========== */

async function renderPerfil(req, res) {
  try {
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
  } catch (err) {
    console.error('Erro ao renderizar perfil do juiz:', err);
    res.status(500).send('Erro ao carregar perfil.');
  }
}

async function renderJogos(req, res) {
  try {
    const esporte = req.params.esporte;
    const genero = req.query.genero || null;

    const esporteIndividualComTelaPropria = resultadosIndividuaisService.ehAtletismo(esporte)
      || resultadosIndividuaisService.ehXadrez(esporte);
    if (esporteIndividualComTelaPropria) {
      return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados' + (genero ? '?genero=' + encodeURIComponent(genero) : ''));
    }

    await juizService.atualizarStatusAutomatico();
    let jogos = await juizService.obterJogosPorEsporte(esporte, genero);

    const mostrarFiltroTipo = ehTenisDeMesa(esporte);
    const tipoFiltro = mostrarFiltroTipo ? normalizarSubCategoriaFiltro(req.query.tipo) : '';
    if (tipoFiltro) {
      jogos = jogos.filter((jogo) => (tipoFiltro === 'individual' ? jogo.tipoIndividual : !jogo.tipoIndividual));
    }

    const esportesDoJuiz = await juizService.obterEsportesDoJuiz(req.user.juizId);
    res.render('juiz/jogos', {
      title: esporte,
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esporte,
      jogos,
      esportesDoJuiz,
      generoFiltro: genero,
      mostrarFiltroTipo,
      tipoFiltro,
      mensagemSucesso: req.query.ok || null
    });
  } catch (err) {
    console.error('Erro ao listar jogos do juiz:', err);
    res.status(500).send('Erro ao carregar lista de jogos.');
  }
}

async function renderPlacar(req, res) {
  try {
    const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
    if (!jogo) return res.redirect('/juiz');

    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
    const regras = obterRegras(jogo.modalidade);
    const modoEdicao = String(req.query.editar || '') === '1' && !jogo.wo;

    res.render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      modoEdicao,
      mensagemErro: null
    });
  } catch (err) {
    console.error('Erro ao renderizar placar:', err);
    res.status(500).send('Erro ao carregar placar.');
  }
}

async function handleSalvarPlacar(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
  const regras = obterRegras(jogo.modalidade);

  if (!juizPodeEditarModalidade(esportes, jogo.modalidade)) {
    return res.status(403).render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: 'Este jogo não é da sua modalidade.'
    });
  }

  if (jogo.bloqueado) {
    return res.status(403).render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: 'Este jogo ainda não pode ser editado. Aguarde o encerramento da fase anterior.'
    });
  }

  const { placar1, placar2, status, sets } = req.body;

  const erro = extrairErros(req);
  if (erro) {
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

  const setEmpatado = setsParsed.find((s) => s.pontos_1 === s.pontos_2);
  if (setEmpatado) {
    return res.render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: `O ${setEmpatado.numero}º set não pode terminar empatado (${setEmpatado.pontos_1} x ${setEmpatado.pontos_2}). Corrija os pontos do set antes de salvar.`
    });
  }

  const tiposCartaoValidos = ['amarelo', 'vermelho'];
  const cartoesValidos = regras.temCartoes && Array.isArray(req.body.cartoes)
    ? req.body.cartoes
      .map((c) => ({
        campus_id: Number(c.campus_id || 0),
        tipo: String(c.tipo || '').trim().toLowerCase(),
        jogador_nome: String(c.jogador_nome || '').trim() || null,
        minuto: c.minuto !== undefined && c.minuto !== '' ? Number(c.minuto) : null
      }))
      .filter((c) =>
        c.campus_id
        && tiposCartaoValidos.includes(c.tipo)
        && (c.campus_id === jogo.campus_1_id || c.campus_id === jogo.campus_2_id))
    : [];

  try {
    if (cartoesValidos.length > 0) {
      const classificacaoService = require('../services/classificacaoService');
      await classificacaoService.registrarCartoes(req.params.jogoId, cartoesValidos);
    }
    await juizService.salvarPlacar(req.params.jogoId, {
      placar1,
      placar2,
      status,
      sets: setsParsed,
      disputa1: req.body.disputa1,
      disputa2: req.body.disputa2
    });
  } catch (e) {
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

  const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
  const generoRedirect = jogo.genero ? '&genero=' + encodeURIComponent(jogo.genero) : '';
  res.redirect('/juiz/' + esporteRedirect + '?ok=Placar+atualizado' + generoRedirect);
}

async function handleAplicarWO(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
  const regras = obterRegras(jogo.modalidade);

  if (!juizPodeEditarModalidade(esportes, jogo.modalidade)) {
    return res.status(403).render('juiz/placar', {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro: 'Este jogo não é da sua modalidade.'
    });
  }

  const { campus_vencedor } = req.body;

  if (!campus_vencedor) {
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

  const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
  const generoRedirect = jogo.genero ? '&genero=' + encodeURIComponent(jogo.genero) : '';
  res.redirect('/juiz/' + esporteRedirect + '?ok=W.O.+aplicado+com+sucesso' + generoRedirect);
}

async function handleDesfazerWO(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  if (!juizPodeEditarModalidade(esportes, jogo.modalidade)) {
    return res.status(403).send('Este jogo não é da sua modalidade.');
  }

  try {
    await juizService.desfazerWO(req.params.jogoId);
  } catch (e) {
    const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
    const generoRedirect = jogo.genero ? '&genero=' + encodeURIComponent(jogo.genero) : '';
    return res.redirect('/juiz/' + esporteRedirect + '?erro=' + encodeURIComponent(e.message) + generoRedirect);
  }

  const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
  const generoRedirect = jogo.genero ? '&genero=' + encodeURIComponent(jogo.genero) : '';
  res.redirect('/juiz/' + esporteRedirect + '?ok=W.O.+desfeito+com+sucesso' + generoRedirect);
}

async function handleAdiarJogo(req, res) {
  const jogo = await juizService.buscarJogoPorId(Number(req.params.jogoId));
  if (!jogo) return res.redirect('/juiz');

  const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
  const esporteDoJogo = esportes.length === 1 ? esportes[0] : '';
  const regras = obterRegras(jogo.modalidade);

  const renderizarErro = (mensagemErro, status = null) => {
    const dados = {
      title: 'Atualizar Placar',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogo,
      esporteVoltar: esporteDoJogo,
      regras,
      mensagemErro
    };
    return status ? res.status(status).render('juiz/placar', dados) : res.render('juiz/placar', dados);
  };

  if (!juizPodeEditarModalidade(esportes, jogo.modalidade)) {
    return renderizarErro('Este jogo não é da sua modalidade.', 403);
  }

  if (jogo.bloqueado) {
    return renderizarErro('Este jogo ainda não pode ser editado. Aguarde o encerramento da fase anterior.', 403);
  }

  if (jogo.status === 'Encerrado' || jogo.wo) {
    return renderizarErro('Este jogo já foi finalizado e não pode ser adiado.');
  }

  const erro = extrairErros(req);
  if (erro) {
    return renderizarErro(erro);
  }

  const { nova_data, nova_hora } = req.body;

  try {
    await juizService.adiarJogo(req.params.jogoId, nova_data, nova_hora);
  } catch (e) {
    return renderizarErro('Erro ao adiar a partida: ' + e.message);
  }

  const esporteRedirect = esportes.length === 1 ? encodeURIComponent(esportes[0]) : '';
  res.redirect('/juiz/' + esporteRedirect + '?ok=Partida+adiada+com+sucesso');
}

/* ========== Juiz: Resultados Individuais (Atletismo / Xadrez) ========== */

async function renderResultados(req, res) {
  try {
    const esporte = req.params.esporte;
    const genero = req.query.genero || 'Masculino';
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
      const classificacao = await resultadosIndividuaisService.obterClassificacaoGeralCampi(modalidadeAlvo.genero);
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
  } catch (err) {
    console.error('Erro ao renderizar resultados individuais:', err);
    res.status(500).send('Erro ao carregar resultados.');
  }
}

async function handleCriarProva(req, res) {
  const esporte = req.params.esporte;
  const { modalidade_id, nome, tipo_resultado, ordem, formato } = req.body;
  try {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const [modalidadeRows] = await require('../config/db').query('SELECT nome, genero FROM modalidades WHERE id = ?', [Number(modalidade_id)]);
    const modalidade = modalidadeRows.length ? modalidadeRows[0] : null;
    if (!modalidade || !juizPodeEditarModalidade(esportes, modalidade.nome, modalidade.genero)) {
      return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent('Modalidade fora das suas atribuições.'));
    }
    await resultadosIndividuaisService.criarProva(Number(modalidade_id), nome, tipo_resultado, Number(ordem) || 0, formato);
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?ok=Prova+criada');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent(e.message));
  }
}

async function handleExcluirProva(req, res) {
  const esporte = req.params.esporte;
  try {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const modalidade = await obterModalidadeDaProva(req.params.provaId);
    if (!modalidade || !juizPodeEditarModalidade(esportes, modalidade.nome, modalidade.genero)) {
      return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent('Prova fora das suas atribuições.'));
    }
    await resultadosIndividuaisService.excluirProva(Number(req.params.provaId));
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?ok=Prova+excluida');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent(e.message));
  }
}

async function renderResultadosProva(req, res) {
  try {
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
    const formatoProva = resultadosIndividuaisService.normalizarFormato(prova.formato);

    const todosAtletas = await resultadosIndividuaisService.obterAtletasPorModalidade(prova.modalidade_id);
    const resultados = await resultadosIndividuaisService.obterResultadosPorProva(provaId);

    const { resolverSlugDaProva, montarMapaProvasParaInscritos, filtrarInscritosPorProva } = require('../utils/atletismoProvas');
    let atletas = todosAtletas;
    let semInscritosNaProva = false;
    const slugProva = resolverSlugDaProva(prova.nome);
    if (slugProva && todosAtletas.length) {
      const mapaProvasInscricao = await montarMapaProvasParaInscritos(todosAtletas);
      const inscritos = filtrarInscritosPorProva(todosAtletas, mapaProvasInscricao, slugProva);
      if (inscritos.length) {
        atletas = inscritos;
      } else if (mapaProvasInscricao.size > 0) {
        atletas = [];
        semInscritosNaProva = true;
      }
    }

    res.render('juiz/resultadosProva', {
      title: prova.nome,
      usuarioLogado: req.user,
      mostrarFiltros: false,
      esporte,
      esportesDoJuiz,
      prova: { ...prova, formato: formatoProva },
      formatoProva,
      atletas,
      semInscritosNaProva,
      resultados,
      mensagemSucesso: req.query.ok || null,
      mensagemErro: req.query.erro || null
    });
  } catch (err) {
    console.error('Erro ao renderizar resultados da prova:', err);
    res.status(500).send('Erro ao carregar resultados da prova.');
  }
}

async function handleSalvarResultadosProva(req, res) {
  const esporte = req.params.esporte;
  const provaId = Number(req.params.provaId);
  const { resultados } = req.body;
  try {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const modalidade = await obterModalidadeDaProva(provaId);
    if (!modalidade || !juizPodeEditarModalidade(esportes, modalidade.nome, modalidade.genero)) {
      return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados/prova/' + provaId + '?erro=' + encodeURIComponent('Prova fora das suas atribuições.'));
    }
    const [provaRows] = await require('../config/db').query('SELECT formato FROM provas WHERE id = ?', [provaId]);
    const formatoProva = resultadosIndividuaisService.normalizarFormato(provaRows.length ? provaRows[0].formato : 'direta');
    await resultadosIndividuaisService.salvarResultadosProva(provaId, resultados || [], formatoProva);
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados/prova/' + provaId + '?ok=Resultados+salvos');
  } catch (e) {
    res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados/prova/' + provaId + '?erro=' + encodeURIComponent(e.message));
  }
}

async function handleSalvarResultadosXadrez(req, res) {
  const esporte = req.params.esporte;
  const { modalidade_id, resultados } = req.body;
  try {
    const esportes = await juizService.obterEsportesDoJuiz(req.user.juizId);
    const [modalidadeRows] = await require('../config/db').query('SELECT nome, genero FROM modalidades WHERE id = ?', [Number(modalidade_id)]);
    const modalidade = modalidadeRows.length ? modalidadeRows[0] : null;
    if (!modalidade || !juizPodeEditarModalidade(esportes, modalidade.nome, modalidade.genero)) {
      return res.redirect('/juiz/' + encodeURIComponent(esporte) + '/resultados?erro=' + encodeURIComponent('Modalidade fora das suas atribuições.'));
    }
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
  handleDesfazerWO,
  handleAdiarJogo,
  renderResultados,
  handleCriarProva,
  handleExcluirProva,
  renderResultadosProva,
  handleSalvarResultadosProva,
  handleSalvarResultadosXadrez
};
