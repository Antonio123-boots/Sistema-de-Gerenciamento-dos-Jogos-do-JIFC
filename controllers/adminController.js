const adminModel = require('../models/adminModel');
const campusModel = require('../models/campusModel');
const { listarCampi, adicionarCampus, atualizarCampus, banCampus, desbanirCampus, removerCampus } = require('../models/campiCatalog');

function renderConfigurar(req, res) {
  res.render('adm/configEvento', {
    title: 'Configurar Prazos',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    configuracoes: adminModel.getConfiguracoes()
  });
}


async function renderCadastroCampus(req, res) {
  const campi = await listarCampi();
  const campusEdicao = req.query.editar
    ? campi.find((campus) => String(campus.slug) === String(req.query.editar) || String(campus.id) === String(req.query.editar)) || null
    : null;

  res.render('adm/cadastroCampus', {
    title: 'Cadastrar Campus',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    campi,
    campusEdicao,
    mensagemErro: req.query.erro || '',
    mensagemSucesso: req.query.sucesso || ''
  });
}

async function salvarCadastroCampus(req, res) {
  try {
    const campusId = String(req.body.campusId || '').trim();
    let campus;

    if (campusId) {
      campus = await atualizarCampus(campusId, {
        nome: req.body.nome,
        nomeExibicao: req.body.nomeExibicao,
        email: req.body.email,
        senha: req.body.senha,
        cidade: req.body.cidade
      });

      res.redirect('/admin/cadastroCampus?sucesso=' + encodeURIComponent(`Campus "${campus.nomeExibicao}" atualizado com sucesso.`));
      return;
    }

    campus = await adicionarCampus({
      nome: req.body.nome,
      nomeExibicao: req.body.nomeExibicao,
      email: req.body.email,
      senha: req.body.senha,
      cidade: req.body.cidade
    });

    res.redirect('/admin/cadastroCampus?sucesso=' + encodeURIComponent(`Campus "${campus.nomeExibicao}" cadastrado com sucesso.`));
  } catch (error) {
    res.redirect('/admin/cadastroCampus?erro=' + encodeURIComponent(error.message));
  }
}

async function renderBanirCampus(req, res) {
  const campi = await listarCampi();
  const bannedCampi = campi.filter((campus) => campus.banned);
  const atletasPorCampus = campi.reduce((map, campus) => {
    map[campus.slug] = campusModel.getAtletas(campus.nome);
    return map;
  }, {});

  res.render('adm/banirCampus', {
    title: 'Gerenciar punições de campus',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    campi,
    bannedCampi,
    atletasPorCampus,
    mensagemErro: req.query.erro || '',
    mensagemSucesso: req.query.sucesso || ''
  });
}

async function salvarBanirCampus(req, res) {
  try {
    const tipoPunicao = String(req.body.tipoPunicao || '').trim();
    const motivoLivre = String(req.body.motivoLivre || '').trim();
    const duracaoSuspensao = Number(req.body.duracaoSuspensao || 0);
    const atletaId = String(req.body.atletaId || '').trim();
    const atletaNome = String(req.body.atletaNome || '').trim();
    const atletaMatricula = String(req.body.atletaMatricula || '').trim();
    const atletaNascimento = String(req.body.atletaNascimento || '').trim();

    const motivosPredefinidos = {
      banimento: 'Banimento permanente do campus',
      suspensao: 'Suspensão temporária do campus',
      advertencia: 'Advertência formal',
      atleta: `Punição para atleta específico: ${atletaNome || 'não informado'}`
    };

    let motivo = motivoLivre || motivosPredefinidos[tipoPunicao] || 'Motivo não informado';
    if (tipoPunicao === 'suspensao' && duracaoSuspensao > 0) {
      motivo = `Suspensão temporária por ${duracaoSuspensao} edição${duracaoSuspensao === 1 ? '' : 's'} do JIFC`;
      if (motivoLivre) {
        motivo += ` — ${motivoLivre}`;
      }
    }

    if (tipoPunicao === 'atleta' && atletaNome) {
      motivo = `Punição para atleta: ${atletaNome}`;
      if (atletaMatricula) motivo += ` | Matrícula: ${atletaMatricula}`;
      if (atletaNascimento) motivo += ` | Nascimento: ${atletaNascimento}`;
      if (motivoLivre) motivo += ` — ${motivoLivre}`;
    }

    const campus = await banCampus(req.body.slug, motivo);
    res.redirect('/admin/banirCampus?sucesso=' + encodeURIComponent(`Campus "${campus.nomeExibicao}" punido com sucesso.`));
  } catch (error) {
    res.redirect('/admin/banirCampus?erro=' + encodeURIComponent(error.message));
  }
}

async function handleDesbanirCampus(req, res) {
  try {
    const campus = await desbanirCampus(req.params.slug);
    res.redirect('/admin/banirCampus?sucesso=' + encodeURIComponent(`Campus "${campus.nomeExibicao}" desbanido com sucesso.`));
  } catch (error) {
    res.redirect('/admin/banirCampus?erro=' + encodeURIComponent(error.message));
  }
}

async function excluirCampus(req, res) {
  try {
    await removerCampus(req.params.slug);
    res.redirect('/admin/banirCampus?sucesso=' + encodeURIComponent('Campus excluído com sucesso.'));
  } catch (error) {
    res.redirect('/admin/banirCampus?erro=' + encodeURIComponent(error.message));
  }
}

async function excluirCampusCadastro(req, res) {
  try {
    await removerCampus(req.params.slug);
    res.redirect('/admin/cadastroCampus?sucesso=' + encodeURIComponent('Campus excluído com sucesso.'));
  } catch (error) {
    res.redirect('/admin/cadastroCampus?erro=' + encodeURIComponent(error.message));
  }
}

function salvarConfiguracoes(req, res) {
  adminModel.salvarConfiguracoes({
    inicio_evento: req.body.inicio_evento,
    fim_evento: req.body.fim_evento,
    inicio_inscricao_modalidades: req.body.inicioInscricoesModalidades,
    fim_inscricao_modalidades: req.body.fimInscricoesModalidades,
    inicio_inscricao_atletas: req.body.inicioInscricoesAtletas,
    fim_inscricao_atletas: req.body.fimInscricoesAtletas,
    inicio_sorteio_chaves: req.body.inicioSorteio,
    fim_sorteio_chaves: req.body.fimSorteio,
    limite_atletas_total_campus: req.body.limite_atletas_total_campus
  });
  res.redirect('/admin/configurar');
}

async function renderChaveamento(req, res) {
  try {
    const modalidadeIdParam = req.query.modalidade;
    const subCategoria = req.query.sub || 'Individual';
    const configuracoes = adminModel.getConfiguracoes();
    const hoje = new Date().toISOString().split('T')[0];

    const prazoModalidadesAberto = configuracoes.inicio_inscricao_modalidades && configuracoes.fim_inscricao_modalidades && (hoje >= configuracoes.inicio_inscricao_modalidades && hoje <= configuracoes.fim_inscricao_modalidades);
    const prazoAtletasAberto = configuracoes.inicio_inscricao_atletas && configuracoes.fim_inscricao_atletas && (hoje >= configuracoes.inicio_inscricao_atletas && hoje <= configuracoes.fim_inscricao_atletas);
    const inscricoesAbertas = prazoModalidadesAberto || prazoAtletasAberto;
    const inscricoesEncerradas = configuracoes.fim_inscricao_modalidades && configuracoes.fim_inscricao_atletas && (hoje > configuracoes.fim_inscricao_modalidades && hoje > configuracoes.fim_inscricao_atletas);
    const resumoDisponivel = !inscricoesAbertas && inscricoesEncerradas;

    const listaModalidades = await adminModel.getModalidadesBanco();
    if (listaModalidades.length === 0) {
      return res.send("Nenhuma modalidade cadastrada no banco de dados.");
    }

    let modalidadeAtiva = listaModalidades[0];
    if (modalidadeIdParam) {
      const buscada = listaModalidades.find(m => m.id === Number(modalidadeIdParam));
      if (buscada) modalidadeAtiva = buscada;
    }

    const nomeNormalizado = modalidadeAtiva.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let categoriaSlug = nomeNormalizado;
    if (nomeNormalizado.includes("atletismo")) categoriaSlug = "atletismo";
    if (nomeNormalizado.includes("xadrez")) categoriaSlug = "xadrez";
    if (nomeNormalizado.includes("tenis de mesa")) categoriaSlug = "tenis-de-mesa";
    modalidadeAtiva.categoriaSlug = categoriaSlug;

    const icones = { futsal: '⚽', volei: '🏐', basquete: '🏀', handebol: '🤾', atletismo: '🏃', 'tenis-de-mesa': '🏓', xadrez: '♟️' };
    const modalidadesComIcone = listaModalidades.map(m => {
      const norm = m.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let icone = '🏆';
      for (let k in icones) { if (norm.includes(k)) icone = icones[k]; }
      return { ...m, icone };
    });

    const modAtivaFormatada = modalidadesComIcone.find(m => m.id === modalidadeAtiva.id);
    const inscritos = await adminModel.getInscritosModalidade(modalidadeAtiva.id, subCategoria);
    const chaves = await adminModel.getChavesModalidade(modalidadeAtiva.id, subCategoria);
    const jogos = await adminModel.getJogosModalidade(modalidadeAtiva.id, subCategoria);

    let provasAtletismo = [];
    if (categoriaSlug === 'atletismo') {
      provasAtletismo = [
        { nomeProva: "Provas de Pista e Campo", atletas: inscritos }
      ];
    }

    let resumoInscricoes = null;
    try {
      resumoInscricoes = await adminModel.getResumoInscricoes();
    } catch (e) {
      console.error('Erro ao carregar resumoInscricoes:', e);
      resumoInscricoes = null;
    }

    res.render('adm/chaveamento', {
      title: 'Chaveamento dos Jogos — JIFC',
      usuarioLogado: req.session?.usuario || { tipo: 'admin' },
      mostrarFiltros: false,
      inscricoesAbertas,
      listaModalidadesCompleta: modalidadesComIcone,
      modalidadeAtiva: modAtivaFormatada,
      subCategoriaAtiva: subCategoria,
      inscritosPendentes: inscritos,
      chavesGeradas: chaves,
      provasAtletismo: provasAtletismo,
      jogosProgramados: jogos,
      resumoDisponivel,
      resumoInscricoes
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar painel de chaveamento.");
  }
}

function escapeCsv(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  const precisaEscapar = /[",\n\r]/.test(texto);
  if (precisaEscapar) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

async function exportResumoInscricoes(req, res) {
  try {
    const resumo = await adminModel.getResumoInscricoes();
    const linhas = [
      ['Campus', 'Modalidade', 'Gênero', 'Atleta', 'Matrícula', 'Data de Nascimento', 'Status']
    ];

    resumo.campi.forEach((campus) => {
      campus.modalidades.forEach((modalidade) => {
        const appendAtletas = (lista, generoLabel) => {
          if (!lista || !lista.length) return;
          lista.forEach((atleta) => {
            linhas.push([
              campus.nome,
              modalidade.nome,
              generoLabel,
              atleta.nome,
              atleta.matricula,
              atleta.dataNascimento,
              atleta.status
            ]);
          });
        };

        appendAtletas(modalidade.atletasMasculino, 'Masculino');
        appendAtletas(modalidade.atletasFeminino, 'Feminino');
      });
    });

    const csv = linhas.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="resumo-inscricoes.csv"');
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao exportar o resumo de inscrições.');
  }
}

async function gerarChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    await adminModel.efetuarChaveamentoMatematico(modalidadeId, subCategoria);
    res.redirect(`/admin/chaveamento?modalidade=${modalidadeId}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao processar sorteio automático.");
  }
}

async function limparChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    const db = require('../config/db');
    await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [modalidadeId]);
    res.redirect(`/admin/chaveamento?modalidade=${modalidadeId}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao limpar dados do chaveamento.");
  }
}

async function renderAnalise(req, res) {
  const campusSelecionado = req.query.campus || '';
  const atletas = campusModel.getAtletasParaAnalise(campusSelecionado || null);

  res.render('adm/analiseAtletas', {
    title: 'Análise de Atletas',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    campi: await listarCampi(),
    campusSelecionado,
    atletas
  });
}

function validarAtleta(req, res) {
  const atleta = campusModel.atualizarStatusAtleta(req.params.atletaId, 'Regular');
  if (!atleta) {
    return res.redirect('/admin/laudos?erro=' + encodeURIComponent('Atleta não encontrado para validação.'));
  }

  res.redirect('/admin/laudos?campus=' + encodeURIComponent(atleta.campus) + '&sucesso=' + encodeURIComponent('Atleta validado com sucesso.') + '#lista-atletas');
}

function marcarIrregular(req, res) {
  const atleta = campusModel.atualizarStatusAtleta(req.params.atletaId, 'Reprovado');
  if (!atleta) {
    return res.redirect('/admin/laudos?erro=' + encodeURIComponent('Atleta não encontrado para reprovação.'));
  }

  res.redirect('/admin/laudos?campus=' + encodeURIComponent(atleta.campus) + '&sucesso=' + encodeURIComponent('Atleta reprovado com sucesso.') + '#lista-atletas');
}

async function renderPlacar(req, res) {
  try {
    const jogos = await adminModel.getJogos();
    const jogo = jogos.find((item) => item.id === Number(req.params.jogoId)) || null;

    res.render('adm/placares', {
      title: 'Lançar Resultado',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      jogoId: req.params.jogoId,
      jogo
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao carregar o placar do jogo.');
  }
}

async function renderResumoCampus(req, res) {
  try {
    const campusId = Number(req.params.id);
    if (Number.isNaN(campusId)) return res.status(400).send('ID de campus inválido.');

    const resumo = await adminModel.getResumoInscricoes();
    if (!resumo || !resumo.campi) return res.status(404).send('Resumo não disponível.');

    const campus = resumo.campi.find(c => Number(c.id) === campusId || String(c.id) === String(campusId));
    if (!campus) return res.status(404).send('Campus não encontrado no resumo.');

    res.render('adm/chaveamento_campus', {
      title: `Resumo - ${campus.nome}`,
      usuarioLogado: req.session?.usuario || { tipo: 'admin' },
      mostrarFiltros: false,
      campus
    });
  } catch (error) {
    console.error('Erro ao renderizar resumo por campus:', error);
    res.status(500).send('Erro ao carregar resumo do campus.');
  }
}

async function salvarPlacar(req, res) {
  try {
    await adminModel.salvarPlacar(req.params.jogoId, req.body);
    res.redirect('/admin/chaveamento');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao salvar o placar.');
  }
}

module.exports = {
  renderConfigurar,
  salvarConfiguracoes,
  renderCadastroCampus,
  salvarCadastroCampus,
  excluirCampusCadastro,
  renderBanirCampus,
  salvarBanirCampus,
  handleDesbanirCampus,
  excluirCampus,
  renderChaveamento,
  gerarChaveamento,
  limparChaveamento,
  exportResumoInscricoes,
  renderAnalise,
  validarAtleta,
  marcarIrregular,
  renderPlacar,
  salvarPlacar
};
module.exports.renderResumoCampus = renderResumoCampus;