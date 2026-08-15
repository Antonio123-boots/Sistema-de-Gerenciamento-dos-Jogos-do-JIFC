const adminModel = require('../models/adminModel');
const campusModel = require('../models/campusModel');
const db = require('../config/db');
const { listarCampi, adicionarCampus, atualizarCampus, banCampus, desbanirCampus, removerCampus } = require('../models/campiCatalog');

async function renderConfigurar(req, res) {
  try {
    const configuracoes = adminModel.getConfiguracoes();
    const modalidades = await adminModel.listarModalidadesConfiguracao();

    res.render('adm/configEvento', {
      title: 'Configurar Prazos',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      configuracoes,
      modalidades,
      mensagemErro: req.query.erro || '',
      mensagemSucesso: req.query.sucesso || ''
    });
  } catch (error) {
    console.error(error);
    res.redirect('/admin/configurar?erro=' + encodeURIComponent('Não foi possível carregar a configuração.'));
  }
}

const { normalizarImagemUpload } = require('../models/profileImageStore');

async function cadastrarModalidade(req, res) {
  try {
    const nome = String(req.body.nome_modalidade || '').trim();
    const tipoConfronto = String(req.body.tipo_confronto || '').trim();
    const genero = String(req.body.genero_modalidade || '').trim();
    const formatoDisputa = String(req.body.formato_disputa || '').trim();
    const iconeData = String(req.body.icone_modalidade_data || '').trim();

    const icone = iconeData ? normalizarImagemUpload(iconeData, null, 'modalidades') : null;
    await adminModel.adicionarModalidade({ nome, tipoConfronto, formatoDisputa, genero, icone });
    res.redirect('/admin/configurar?sucesso=' + encodeURIComponent(`Modalidade "${nome}" adicionada com sucesso.`));
  } catch (error) {
    res.redirect('/admin/configurar?erro=' + encodeURIComponent(error.message));
  }
}

async function excluirModalidade(req, res) {
  try {
    const modalidadeId = Number(req.params.modalidadeId || req.body.modalidadeId || 0);
    const resultado = await adminModel.removerModalidadePorId(modalidadeId);
    res.redirect('/admin/configurar?sucesso=' + encodeURIComponent(`Modalidade "${resultado.nome}" removida com sucesso.`));
  } catch (error) {
    res.redirect('/admin/configurar?erro=' + encodeURIComponent(error.message));
  }
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
        cidade: req.body.cidade,
        fotoPerfil: req.body.fotoPerfil
      });

      res.redirect('/admin/cadastroCampus?sucesso=' + encodeURIComponent(`Campus "${campus.nomeExibicao}" atualizado com sucesso.`));
      return;
    }

    campus = await adicionarCampus({
      nome: req.body.nome,
      nomeExibicao: req.body.nomeExibicao,
      email: req.body.email,
      senha: req.body.senha,
      cidade: req.body.cidade,
      fotoPerfil: req.body.fotoPerfil
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
    const configuracoes = adminModel.getConfiguracoes();
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    const inicioModalidades = configuracoes.inicio_inscricao_modalidades;
    const fimModalidades = configuracoes.fim_inscricao_modalidades;
    const inicioAtletas = configuracoes.inicio_inscricao_atletas;
    const fimAtletas = configuracoes.fim_inscricao_atletas;
    const inicioSorteio = configuracoes.inicio_sorteio_chaves;
    const fimSorteio = configuracoes.fim_sorteio_chaves;

    const prazoModalidadesAberto = Boolean(inicioModalidades && fimModalidades && hojeStr >= inicioModalidades && hojeStr <= fimModalidades);
    const prazoAtletasAberto = Boolean(inicioAtletas && fimAtletas && hojeStr >= inicioAtletas && hojeStr <= fimAtletas);
    const inscricoesConfiguradas = Boolean(inicioModalidades && fimModalidades && inicioAtletas && fimAtletas);
    const inscricoesAbertas = inscricoesConfiguradas && (prazoModalidadesAberto || prazoAtletasAberto);
    const inscricoesEncerradas = inscricoesConfiguradas && hojeStr >= fimModalidades && hojeStr >= fimAtletas;
    const sorteioDisponivelPorData = (!inicioSorteio || hojeStr >= inicioSorteio) && (!fimSorteio || hojeStr <= fimSorteio);
    const prazoSorteioAberto = Boolean(inscricoesEncerradas && sorteioDisponivelPorData);
    const sorteioBloqueado = inscricoesAbertas || !prazoSorteioAberto;
    const resumoDisponivel = inscricoesConfiguradas;

    let listaModalidades = [];
    try {
      listaModalidades = await adminModel.getModalidadesBanco();
    } catch (error) {
      console.error('Erro ao buscar modalidades para o chaveamento:', error);
      listaModalidades = [];
    }

    const chaveamentoBloqueado = false;

    let modalidadeAtiva = { id: 0, nome: '—', categoria: '' };
    let modalidadeAtivaNome = '—';
    let categoriaSlug = '';
    const configuracoesBanco = await adminModel.getConfiguracoesBanco();
    const datasEventoDisponiveis = adminModel.gerarDatasEventoDisponiveis(configuracoesBanco || configuracoes);
    let modalidadesComIcone = [];
    let modAtivaFormatada = null;
    let subCategoria = 'geral';
    let subProva = '';
    let modalidadeSorteavel = true;
    let permitirGerarSorteio = false;

    if (listaModalidades.length > 0) {
      modalidadeAtiva = listaModalidades[0];
      if (modalidadeIdParam) {
        const buscada = listaModalidades.find(m => m.id === Number(modalidadeIdParam));
        if (buscada) modalidadeAtiva = buscada;
      }

      modalidadeAtivaNome = modalidadeAtiva.nome || '—';
      const nomeNormalizado = String(modalidadeAtivaNome).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      categoriaSlug = nomeNormalizado;
      if (nomeNormalizado.includes("atletismo")) {
        subCategoria = req.query.sub || 'geral';
        subProva = String(req.query.subProva || '').trim();
      } else if (nomeNormalizado.includes("tenis de mesa") || nomeNormalizado.includes("tenis")) {
        subCategoria = req.query.sub || 'individual';
      } else {
        subCategoria = req.query.sub || 'geral';
      }
      if (nomeNormalizado.includes("atletismo")) categoriaSlug = "atletismo";
      if (nomeNormalizado.includes("xadrez")) categoriaSlug = "xadrez";
      if (nomeNormalizado.includes("tenis de mesa") || nomeNormalizado.includes("tenis")) categoriaSlug = "tenis-de-mesa";
      modalidadeAtiva.categoriaSlug = categoriaSlug;
      modalidadeAtiva.categoria = categoriaSlug;
      modalidadeSorteavel = adminModel.isModalidadeSorteavel(modalidadeAtivaNome, modalidadeAtiva.tipo_confronto, subCategoria);
      permitirGerarSorteio = inscricoesEncerradas && prazoSorteioAberto && modalidadeSorteavel;

      modalidadesComIcone = listaModalidades.map((m) => {
        const nome = String(m.nome || '').trim();
        const genero = String(m.genero || '').trim();
        const norm = `${nome} ${genero}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let imagem = '/imagens/atletismo1.svg';
        let slug = 'atletismo';
        if (norm.includes('futsal')) { imagem = '/imagens/futsal1.svg'; slug = 'futsal'; }
        else if (norm.includes('volei')) { imagem = '/imagens/volei1.svg'; slug = 'volei'; }
        else if (norm.includes('basquete')) { imagem = '/imagens/basquete1.svg'; slug = 'basquete'; }
        else if (norm.includes('handebol')) { imagem = '/imagens/handebol1.svg'; slug = 'handebol'; }
        else if (norm.includes('atletismo')) { imagem = '/imagens/atletismo1.svg'; slug = 'atletismo'; }
        else if (norm.includes('tenis de mesa') || norm.includes('tenis')) { imagem = '/imagens/tenisdemesa1.svg'; slug = 'tenis-de-mesa'; }
        else if (norm.includes('xadrez')) { imagem = '/imagens/xadrez1.svg'; slug = 'xadrez'; }

        return {
          id: m.id,
          nome,
          genero,
          tipo_confronto: m.tipo_confronto,
          categoria: slug,
          imagem,
          slug,
          icone: String(m.icone || '🏆').trim() || '🏆'
        };
      }).sort((a, b) => {
        const nomeCompare = a.nome.localeCompare(b.nome);
        if (nomeCompare !== 0) return nomeCompare;
        return a.genero.localeCompare(b.genero);
      });

      modAtivaFormatada = modalidadesComIcone.find(m => m.id === modalidadeAtiva.id) || modalidadeAtiva;
    }

    if (listaModalidades.length === 0) {
      modalidadeAtiva = { id: 0, nome: 'Nenhuma modalidade cadastrada', categoria: '' };
      modalidadesComIcone = [];
      modAtivaFormatada = modalidadeAtiva;
    }

    let inscritos = [];
    let chaves = [];
    let jogos = [];
    let provasAtletismo = [];

    if (listaModalidades.length > 0) {
      inscritos = await adminModel.getInscritosModalidade(modalidadeAtiva.id, subCategoria);
      chaves = await adminModel.getChavesModalidade(modalidadeAtiva.id, subCategoria);
      jogos = await adminModel.getJogosModalidade(modalidadeAtiva.id, subCategoria);

      if (categoriaSlug === 'atletismo') {
        const provasBase = [
          { slug: 'geral', nomeProva: 'Geral', descricao: 'Atletas inscritos em atletismo', atletas: inscritos, subprovas: [] },
          {
            slug: 'corrida',
            nomeProva: 'Corrida',
            descricao: 'Selecione a prova específica de corrida.',
            atletas: inscritos,
            subprovas: [
              { slug: '100m', nomeProva: '100m', descricao: 'Velocidade', atletas: inscritos.slice(0, Math.max(1, Math.ceil(inscritos.length / 4))) },
              { slug: '200m', nomeProva: '200m', descricao: 'Velocidade', atletas: inscritos.slice(Math.max(0, Math.floor(inscritos.length / 4))) },
              { slug: '400m', nomeProva: '400m', descricao: 'Velocidade', atletas: inscritos.slice(0, Math.max(1, Math.ceil(inscritos.length / 3))) },
              { slug: '800m', nomeProva: '800m', descricao: 'Meio-fundo', atletas: inscritos.slice(Math.max(0, Math.floor(inscritos.length / 3))) },
              { slug: '1500m', nomeProva: '1500m', descricao: 'Fundo', atletas: inscritos.slice(0, Math.max(1, Math.ceil(inscritos.length / 2))) },
              { slug: '3000m', nomeProva: '3000m', descricao: 'Fundo', atletas: inscritos.slice(Math.max(0, Math.floor(inscritos.length / 2))) },
              { slug: '5000m', nomeProva: '5000m', descricao: 'Fundo', atletas: inscritos.slice(0, Math.max(1, Math.min(6, inscritos.length))) }
            ]
          },
          {
            slug: 'salto',
            nomeProva: 'Salto',
            descricao: 'Selecione a prova específica de salto.',
            atletas: inscritos,
            subprovas: [
              { slug: 'salto-em-distancia', nomeProva: 'Salto em Distância', descricao: 'Salto em distância', atletas: inscritos.slice(0, Math.max(1, Math.ceil(inscritos.length / 2))) },
              { slug: 'salto-em-altura', nomeProva: 'Salto em Altura', descricao: 'Salto em altura', atletas: inscritos.slice(Math.max(0, Math.floor(inscritos.length / 2))) },
              { slug: 'salto-triplo', nomeProva: 'Salto Triplo', descricao: 'Salto triplo', atletas: inscritos.slice(0, Math.max(1, Math.min(5, inscritos.length))) }
            ]
          },
          {
            slug: 'arremesso',
            nomeProva: 'Arremesso',
            descricao: 'Selecione a prova específica de arremesso.',
            atletas: inscritos,
            subprovas: [
              { slug: 'disco', nomeProva: 'Disco', descricao: 'Disco', atletas: inscritos.slice(0, Math.max(1, Math.ceil(inscritos.length / 2))) },
              { slug: 'dardo', nomeProva: 'Dardo', descricao: 'Dardo', atletas: inscritos.slice(Math.max(0, Math.floor(inscritos.length / 2))) },
              { slug: 'peso', nomeProva: 'Peso', descricao: 'Peso', atletas: inscritos.slice(0, Math.max(1, Math.min(5, inscritos.length))) }
            ]
          }
        ];

        const provaAtiva = provasBase.find((prova) => String(prova.slug).toLowerCase() === String(subCategoria).toLowerCase()) || provasBase[0];
        provasAtletismo = provasBase.map((prova) => {
          let atletas = prova.atletas || [];
          let subProvaSelecionada = null;
          if (prova.slug === provaAtiva.slug && prova.subprovas && prova.subprovas.length) {
            const subProvaAtiva = prova.subprovas.find((item) => String(item.slug).toLowerCase() === String(subProva).toLowerCase());
            if (subProvaAtiva) {
              atletas = subProvaAtiva.atletas;
              subProvaSelecionada = subProvaAtiva;
            } else if (prova.subprovas[0]) {
              atletas = prova.subprovas[0].atletas;
              subProvaSelecionada = prova.subprovas[0];
            }
          }
          return {
            ...prova,
            ativa: prova.slug === provaAtiva.slug,
            atletas,
            subProvaSelecionada
          };
        });
      }
    }

    let resumoInscricoes = null;
    try {
      resumoInscricoes = await adminModel.getResumoInscricoes();
    } catch (e) {
      console.error('Erro ao carregar resumoInscricoes:', e);
      resumoInscricoes = null;
    }

    const rodadasJogos = adminModel.agruparJogosPorRodadas(jogos);

    const isIndividualModalidade = modalidadeAtiva.tipo_confronto === 'Individual'
        || categoriaSlug === 'atletismo'
        || categoriaSlug === 'xadrez'
        || subCategoria === 'individual';

      const slugModalidadeAtiva = String(`${modalidadeAtivaNome} ${modalidadeAtiva.genero}` || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const jogosPublicadosDaModalidade = await adminModel.getJogosPublicados({ modalidadeSlug: slugModalidadeAtiva });
      const modalidadePublicada = jogosPublicadosDaModalidade.length > 0;

      res.render('adm/chaveamento', {
        title: 'Chaveamento dos Jogos — JIFC',
        usuarioLogado: req.session?.usuario || { tipo: 'admin' },
        mostrarFiltros: false,
        inscricoesAbertas,
        chaveamentoBloqueado: false,
        sorteioBloqueado,
        permitirGerarSorteio,
        modalidadeSorteavel,
        inicioSorteio,
        fimSorteio,
        listaModalidadesCompleta: modalidadesComIcone,
        modalidadeAtiva: modAtivaFormatada,
        subCategoriaAtiva: subCategoria,
        subProvaAtiva: subProva,
        isIndividualModalidade,
        inscritosPendentes: inscritos,
        chavesGeradas: chaves,
        provasAtletismo: provasAtletismo,
        jogosProgramados: jogos,
        rodadasJogos,
        datasEventoDisponiveis,
        resumoDisponivel,
        resumoInscricoes,
        mensagemErro: req.query.erro || '',
        mensagemSucesso: req.query.sucesso || '',
        modalidadePublicada
      });

    } catch (error) {
      console.error(error);
      res.status(500).send("Erro ao carregar painel de chaveamento.");
    }
  }

async function exportResumoInscricoes(req, res) {
  try {
    const resumo = await adminModel.getResumoInscricoes();
    const linhas = [];
    construirLinhaCsv(linhas, ['Campus', 'Modalidade', 'Gênero', 'Atleta', 'Matrícula', 'Data de Nascimento', 'Status']);

    resumo.campi.forEach((campus) => {
      construirLinhaCsv(linhas, ['']);
      construirLinhaCsv(linhas, [campus.nome, '', '', '', '', '', '']);

      campus.modalidades.forEach((modalidade) => {
        construirLinhaCsv(linhas, ['']);
        construirLinhaCsv(linhas, [modalidade.nome, '', '', '', '', '', '']);

        const appendAtletas = (lista, generoLabel) => {
          if (!lista || !lista.length) return;
          lista.forEach((atleta) => {
            construirLinhaCsv(linhas, [
              '',
              '',
              generoLabel,
              atleta.nome,
              atleta.matricula,
              atleta.dataNascimento,
              atleta.status || 'Regular'
            ]);
          });
        };

        appendAtletas(modalidade.atletasMasculino, 'Masculino');
        appendAtletas(modalidade.atletasFeminino, 'Feminino');
      });
    });

    const csv = linhas.join('\r\n');
    const buffer = Buffer.from(['\uFEFF', csv].join(''), 'utf8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8; header=present');
    res.setHeader('Content-Disposition', 'attachment; filename="resumo-inscricoes-por-campus.csv"');
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao exportar o resumo de inscrições.');
  }
}

async function gerarChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    const modalidadeIdNum = Number(modalidadeId || 0);
    const configuracoes = adminModel.getConfiguracoes();
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const inicioSorteio = configuracoes.inicio_sorteio_chaves;
    const fimSorteio = configuracoes.fim_sorteio_chaves;
    const inicioModalidades = configuracoes.inicio_inscricao_modalidades;
    const fimModalidades = configuracoes.fim_inscricao_modalidades;
    const inicioAtletas = configuracoes.inicio_inscricao_atletas;
    const fimAtletas = configuracoes.fim_inscricao_atletas;
    const prazoModalidadesAberto = Boolean(inicioModalidades && fimModalidades && hojeStr >= inicioModalidades && hojeStr <= fimModalidades);
    const prazoAtletasAberto = Boolean(inicioAtletas && fimAtletas && hojeStr >= inicioAtletas && hojeStr <= fimAtletas);
    const inscricoesConfiguradas = Boolean(inicioModalidades && fimModalidades && inicioAtletas && fimAtletas);
    const inscricoesAbertas = inscricoesConfiguradas && (prazoModalidadesAberto || prazoAtletasAberto);
    const inscricoesEncerradas = inscricoesConfiguradas && hojeStr >= fimModalidades && hojeStr >= fimAtletas;
    const sorteioDisponivelPorData = (!inicioSorteio || hojeStr >= inicioSorteio) && (!fimSorteio || hojeStr <= fimSorteio);
    const permitirGerarSorteio = Boolean(inscricoesEncerradas && sorteioDisponivelPorData);

    if (!permitirGerarSorteio) {
      const mensagem = inicioSorteio
        ? `Sorteio ainda não liberado. Somente a partir de ${inicioSorteio}.`
        : 'Sorteio ainda não liberado. Aguarde o fim das inscrições.';
      return res.status(403).send(mensagem);
    }

    if (!modalidadeIdNum) {
      const [modalidades] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades ORDER BY nome ASC');
      const elegiveis = modalidades.filter((modalidade) => {
        const nome = String(modalidade.nome || '').trim().toLowerCase();
        if (nome.includes('atletismo') || nome.includes('xadrez')) {
          return false;
        }

        return adminModel.isModalidadeSorteavel(modalidade.nome, modalidade.tipo_confronto, subCategoria || '');
      });

      if (!elegiveis.length) {
        return res.redirect(`/admin/chaveamento?erro=${encodeURIComponent('Nenhuma modalidade elegível para sorteio automático.')}`);
      }

      for (const modalidade of elegiveis) {
        await adminModel.efetuarChaveamentoMatematico(modalidade.id, subCategoria || '');
      }

      return res.redirect(`/admin/chaveamento?sucesso=${encodeURIComponent('Sorteio realizado para todas as modalidades elegíveis, exceto atletismo e xadrez.')}`);
    }

    const [mod] = await db.query('SELECT tipo_confronto, nome FROM modalidades WHERE id = ?', [modalidadeIdNum]);
    if (!mod.length) {
      return res.status(404).send('Modalidade não encontrada.');
    }

    const modalidade = mod[0];
    const modalidadeSorteavel = adminModel.isModalidadeSorteavel(modalidade.nome, modalidade.tipo_confronto, subCategoria);
    if (!modalidadeSorteavel) {
      return res.status(403).send('Esta modalidade não possui sorteio automático.');
    }

    await adminModel.efetuarChaveamentoMatematico(modalidadeIdNum, subCategoria);
    res.redirect(`/admin/chaveamento?modalidade=${modalidadeIdNum}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao processar sorteio automático.");
  }
}

async function limparChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    const db = require('../config/db');
    await db.query('UPDATE campus_modalidade SET chave_id = NULL WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [modalidadeId]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [modalidadeId]);
    res.redirect(`/admin/chaveamento?modalidade=${modalidadeId}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao limpar dados do chaveamento.");
  }
}

async function publicarChaveamento(req, res) {
  try {
    await adminModel.publicarTodosJogos();
    res.redirect(`/admin/chaveamento?sucesso=` + encodeURIComponent('Sorteio confirmado e jogos publicados com sucesso.'));
  } catch (error) {
    console.error(error);
    res.redirect(`/admin/chaveamento?erro=` + encodeURIComponent(error.message || 'Erro ao publicar jogos.'));
  }
}

async function cancelarSorteio(req, res) {
  try {
    const [modalidades] = await db.query('SELECT id, nome FROM modalidades');

    for (const modalidade of modalidades) {
      const nome = String(modalidade.nome || '').trim().toLowerCase();
      if (nome.includes('atletismo') || nome.includes('xadrez')) {
        continue;
      }

      await db.query('UPDATE campus_modalidade SET chave_id = NULL WHERE modalidade_id = ?', [modalidade.id]);
      await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [modalidade.id]);
      await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [modalidade.id]);
    }

    res.redirect('/admin/chaveamento');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao cancelar o sorteio.');
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

async function salvarJogoChaveamento(req, res) {
  try {
    await adminModel.atualizarJogoChaveamento(req.params.jogoId, req.body);
    res.redirect('/admin/chaveamento');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao salvar o confronto.');
  }
}

module.exports = {
  renderConfigurar,
  cadastrarModalidade,
  excluirModalidade,
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
  publicarChaveamento,
  cancelarSorteio,
  exportResumoInscricoes,
  renderAnalise,
  validarAtleta,
  marcarIrregular,
  renderPlacar,
  salvarPlacar,
  salvarJogoChaveamento
};
module.exports.renderResumoCampus = renderResumoCampus;