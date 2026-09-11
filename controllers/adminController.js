const adminModel = require('../models/adminModel');
const campusModel = require('../models/campusModel');
const resultadosIndividuaisService = require('../services/resultadosIndividuaisService');
const mataMataService = require('../services/mataMataService');
const boletimService = require('../services/boletimService');
const edicaoService = require('../services/edicaoService');
const db = require('../config/db');
const { listarCampi, adicionarCampus, atualizarCampus, banCampus, desbanirCampus, removerCampus } = require('../models/campiCatalog');
const { obterStatusPrazos } = require('../utils/statusPrazos');

async function renderConfigurar(req, res) {
  try {
    const configuracoes = adminModel.getConfiguracoes();
    const modalidades = await adminModel.listarModalidadesConfiguracao();

    res.render('adm/configEvento', {
      title: 'Configurar Prazos',
      usuarioLogado: req.user,
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

function chaveModalidadeUnica(modalidade) {
  const nome = String(modalidade.nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(masculino|feminino)$/i, '')
    .trim();
  return `${nome}|${String(modalidade.genero || '').toLowerCase().trim()}`;
}

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
  try {
    const campi = await listarCampi();
    const campusEdicao = req.query.editar
      ? campi.find((campus) => String(campus.slug) === String(req.query.editar) || String(campus.id) === String(req.query.editar)) || null
      : null;

    res.render('adm/cadastroCampus', {
      title: 'Cadastrar Campus',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      campi,
      campusEdicao,
      mensagemErro: req.query.erro || '',
      mensagemSucesso: req.query.sucesso || ''
    });
  } catch (error) {
    console.error('Erro ao renderizar cadastro de campus:', error);
    res.redirect('/admin/configurar?erro=' + encodeURIComponent('Erro ao carregar cadastro de campus.'));
  }
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
  try {
    const campi = await listarCampi();
    const bannedCampi = campi.filter((campus) => campus.banned);
    const atletasPorCampus = campi.reduce((map, campus) => {
      map[campus.slug] = campusModel.getAtletas(campus.nome);
      return map;
    }, {});

    res.render('adm/banirCampus', {
      title: 'Gerenciar punições de campus',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      campi,
      bannedCampi,
      atletasPorCampus,
      mensagemErro: req.query.erro || '',
      mensagemSucesso: req.query.sucesso || ''
    });
  } catch (error) {
    console.error('Erro ao renderizar banir campus:', error);
    res.redirect('/admin/configurar?erro=' + encodeURIComponent('Erro ao carregar gerenciamento de punições.'));
  }
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

async function salvarConfiguracoes(req, res) {
  try {
    await adminModel.salvarConfiguracoes({
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
    res.redirect('/admin/configurar?sucesso=' + encodeURIComponent('Configurações salvas com sucesso.'));
  } catch (error) {
    console.error('Erro ao salvar configurações:', error.message);
    res.redirect('/admin/configurar?erro=' + encodeURIComponent('Não foi possível salvar as configurações: ' + error.message));
  }
}

/* ===== Atletismo: provas inscritas por atleta ===== */
const { MAPA_PROVAS_INSCRICAO, obterMapaProvasAtletismo, filtrarInscritosPorProva, montarMapaProvasParaInscritos, obterPontuacaoPorAtleta } = require('../utils/atletismoProvas');

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

    const { prazoModalidadesAberto, prazoAtletasAberto, inscricoesAbertas, inscricoesEncerradas, prazoSorteioAberto, sorteioBloqueado, resumoDisponivel } = obterStatusPrazos(configuracoes, hojeStr);

    let listaModalidades = [];
    try {
      listaModalidades = await adminModel.getModalidadesBanco();
      const [jogosPorModalidade] = await db.query('SELECT modalidade_id, COUNT(*) AS total FROM jogos GROUP BY modalidade_id');
      const quantidadeJogos = new Map(jogosPorModalidade.map((item) => [Number(item.modalidade_id), Number(item.total)]));
      const modalidadesUnicas = new Map();
      listaModalidades.forEach((modalidade) => {
        const chave = chaveModalidadeUnica(modalidade);
        const atual = modalidadesUnicas.get(chave);
        const totalAtual = quantidadeJogos.get(Number(atual?.id)) || 0;
        const totalNovo = quantidadeJogos.get(Number(modalidade.id)) || 0;
        if (!atual || totalNovo > totalAtual || (totalNovo === totalAtual && Number(modalidade.id) < Number(atual.id))) {
          modalidadesUnicas.set(chave, modalidade);
        }
      });
      listaModalidades = [...modalidadesUnicas.values()];
    } catch (error) {
      console.error('Erro ao buscar modalidades para o chaveamento:', error);
      listaModalidades = [];
    }

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
        else if (norm.includes('praia') || (norm.includes('volei') && norm.includes('areia'))) { imagem = '/imagens/areia1.svg'; slug = 'volei-de-praia'; }
        else if (norm.includes('volei')) { imagem = '/imagens/volei1.svg'; slug = 'volei'; }
        else if (norm.includes('basquete')) { imagem = '/imagens/basquete1.svg'; slug = 'basquete'; }
        else if (norm.includes('handebol')) { imagem = '/imagens/handebol1.svg'; slug = 'handebol'; }
        else if (norm.includes('atletismo')) { imagem = '/imagens/atletismo1.svg'; slug = 'atletismo'; }
        else if (norm.includes('tenis de mesa') || norm.includes('tenis')) { imagem = '/imagens/tenisdemesa1.svg'; slug = 'tenis-de-mesa'; }
        else if (norm.includes('xadrez')) { imagem = '/imagens/xadrez1.svg'; slug = 'xadrez'; }
        if (String(m.icone || '').trim() && (String(m.icone).trim().startsWith('/') || String(m.icone).trim().startsWith('http'))) {
          imagem = String(m.icone).trim();
        }

        return {
          id: m.id,
          nome,
          genero,
          tipo_confronto: m.tipo_confronto,
          categoria: slug,
          imagem,
          slug,
          icone: String(imagem || '🏆').trim() || '🏆'
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

      if (categoriaSlug === 'xadrez') {
        try {
          const resultadosXadrez = await resultadosIndividuaisService.obterResultadosXadrez(modalidadeAtiva.id);
          const pontosPorAtleta = new Map((resultadosXadrez || []).map((r) => [Number(r.atleta_id), Number(r.pontuacao) || 0]));
          inscritos = inscritos.map((inscrito) => ({
            ...inscrito,
            pontuacaoAtual: pontosPorAtleta.get(Number(inscrito.id)) || 0
          }));
        } catch (error) {
          console.error('Erro ao carregar pontuação de xadrez:', error);
        }
      }

      if (categoriaSlug === 'atletismo') {
        const [atletasDasEquipes] = await db.query(
          `SELECT DISTINCT a.id, a.nome AS nome_atleta, a.campus_id, c.nome AS campus_nome, c.nome_exibicao
           FROM campus_modalidade cm
           JOIN atletas a ON a.campus_id = cm.campus_id
           JOIN campus c ON c.id = a.campus_id
           WHERE cm.modalidade_id = ? AND a.genero = ?
           ORDER BY c.nome ASC, a.nome ASC`,
          [modalidadeAtiva.id, modalidadeAtiva.genero]
        );
        inscritos = atletasDasEquipes.map((atleta) => ({
          id: atleta.id,
          nomeAtleta: atleta.nome_atleta,
          nomeCampus: atleta.nome_exibicao || atleta.campus_nome,
          campus: atleta.nome_exibicao || atleta.campus_nome
        }));
      }
      chaves = await adminModel.getChavesModalidade(modalidadeAtiva.id, subCategoria);
      jogos = await adminModel.getJogosModalidade(modalidadeAtiva.id, subCategoria);

      if (categoriaSlug === 'atletismo') {
        const mapaProvasAtleta = await montarMapaProvasParaInscritos(inscritos);
        const atletasSemProvasRegistradas = inscritos.filter((atleta) => !mapaProvasAtleta.has(Number(atleta.id)));
        const pontuacaoPorAtleta = await obterPontuacaoPorAtleta();
        const filtrarPorProva = (slugProva) => {
          const filtrados = filtrarInscritosPorProva(inscritos, mapaProvasAtleta, slugProva);
          const lista = filtrados.length > 0 || !atletasSemProvasRegistradas.length
            ? filtrados
            : atletasSemProvasRegistradas;
          const limite = ['4x100m', '4x400m'].includes(String(slugProva).toLowerCase()) ? 6 : 200;
          return lista.slice(0, limite).map((atleta) => {
            const porProva = pontuacaoPorAtleta.get(Number(atleta.id));
            const detalhe = porProva ? porProva.get(String(slugProva).toLowerCase()) : null;
            return { ...atleta, pontosAtletismo: detalhe ? detalhe.pontos : 0 };
          });
        };

        let classificacaoGeralCampi = [];
        try {
          classificacaoGeralCampi = await resultadosIndividuaisService.obterClassificacaoGeralCampi();
        } catch (e) {
          console.error('Erro ao carregar classificação geral do atletismo:', e);
          classificacaoGeralCampi = [];
        }

        const provasBase = [
          { slug: 'geral', nomeProva: 'Geral', descricao: 'Pontuação total de todos os campi no atletismo, somando todas as provas.', campi: classificacaoGeralCampi, subprovas: [] },
          {
            slug: 'corrida',
            nomeProva: 'Corrida',
            descricao: 'Selecione a prova específica de corrida.',
            subprovas: [
              { slug: '100m', nomeProva: '100m', descricao: 'Velocidade' },
              { slug: '200m', nomeProva: '200m', descricao: 'Velocidade' },
              { slug: '400m', nomeProva: '400m', descricao: 'Velocidade' },
              { slug: '800m', nomeProva: '800m', descricao: 'Meio-fundo' },
              { slug: '1500m', nomeProva: '1500m', descricao: 'Fundo' },
              { slug: '3000m', nomeProva: '3000m', descricao: 'Fundo' },
              { slug: '5000m', nomeProva: '5000m', descricao: 'Fundo' },
              { slug: '4x100m', nomeProva: '4x100m', descricao: 'Revezamento' },
              { slug: '4x400m', nomeProva: '4x400m', descricao: 'Revezamento' }
            ]
          },
          {
            slug: 'salto',
            nomeProva: 'Salto',
            descricao: 'Selecione a prova específica de salto.',
            subprovas: [
              { slug: 'salto-em-distancia', nomeProva: 'Salto em Distância', descricao: 'Salto em distância' },
              { slug: 'salto-em-altura', nomeProva: 'Salto em Altura', descricao: 'Salto em altura' },
              { slug: 'salto-triplo', nomeProva: 'Salto Triplo', descricao: 'Salto triplo' }
            ]
          },
          {
            slug: 'arremesso',
            nomeProva: 'Arremesso',
            descricao: 'Selecione a prova específica de arremesso.',
            subprovas: [
              { slug: 'disco', nomeProva: 'Disco', descricao: 'Disco' },
              { slug: 'dardo', nomeProva: 'Dardo', descricao: 'Dardo' },
              { slug: 'peso', nomeProva: 'Peso', descricao: 'Peso' }
            ]
          }
        ];

        const provaAtiva = provasBase.find((prova) => String(prova.slug).toLowerCase() === String(subCategoria).toLowerCase()) || provasBase[0];
        provasAtletismo = provasBase.map((prova) => {
          let atletas = [];
          let subProvaSelecionada = null;
          if (prova.slug !== 'geral') {
            prova.subprovas.forEach((sub) => { sub.atletas = filtrarPorProva(sub.slug); });
            if (prova.slug === provaAtiva.slug) {
              subProvaSelecionada = prova.subprovas.find((item) => String(item.slug).toLowerCase() === String(subProva).toLowerCase()) || prova.subprovas[0] || null;
              atletas = subProvaSelecionada ? subProvaSelecionada.atletas : [];
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

    const FASES_ELIMINATORIA_ADMIN = new Set(['Oitavas', 'Quartas', 'Semifinal', 'Final', 'Terceiro Lugar']);
    const rodadasJogos = adminModel.agruparJogosPorRodadas((jogos || []).filter((jogo) => !FASES_ELIMINATORIA_ADMIN.has(String(jogo.fase || ''))));

    let fasesEliminatoria = [];
    try {
      fasesEliminatoria = await mataMataService.listarEliminatoria(modalidadeAtiva.id, subCategoria);
    } catch (error) {
      console.error('Erro ao carregar eliminatória no painel:', error);
    }

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

      let atletismoPublicado = false;
      let xadrezPublicado = false;
      if (categoriaSlug === 'atletismo') {
        const [provasPub] = await db.query('SELECT 1 FROM provas WHERE modalidade_id = ? AND publicado = 1 LIMIT 1', [modalidadeAtiva.id]);
        atletismoPublicado = provasPub.length > 0;
      } else if (categoriaSlug === 'xadrez') {
        const [xadrezPub] = await db.query('SELECT 1 FROM resultados_xadrez WHERE modalidade_id = ? AND publicado = 1 LIMIT 1', [modalidadeAtiva.id]);
        xadrezPublicado = xadrezPub.length > 0;
      }

      const modalidadePublicada = jogosPublicadosDaModalidade.length > 0 || atletismoPublicado || xadrezPublicado;

      const [modalidadesPublicadas] = await db.query(`
        SELECT DISTINCT m.id, m.nome, m.genero
        FROM modalidades m
        LEFT JOIN jogos j ON j.modalidade_id = m.id AND j.publicado = 1
        LEFT JOIN provas p ON p.modalidade_id = m.id AND p.publicado = 1
        LEFT JOIN resultados_xadrez r ON r.modalidade_id = m.id AND r.publicado = 1
        WHERE j.id IS NOT NULL OR p.id IS NOT NULL OR r.id IS NOT NULL
        ORDER BY m.nome ASC, m.genero ASC
      `);

      let statusJifcEncerrado = false;
      let edicaoAnoAtualJaSalva = false;
      const anoJifcAtual = Number(adminModel.getAnoJifc() || 0);
      try {
        const statusJifc = await boletimService.obterStatusJifc();
        statusJifcEncerrado = Boolean(statusJifc && statusJifc.encerrado);
      } catch (erroStatus) {
        console.error('Erro ao verificar status do JIFC (chaveamento):', erroStatus);
      }
      if (statusJifcEncerrado) {
        try {
          const edicaoDoAno = await edicaoService.obterEdicao(anoJifcAtual);
          edicaoAnoAtualJaSalva = Boolean(edicaoDoAno);
        } catch (erroEdicao) {
          console.error('Erro ao verificar edição do ano atual:', erroEdicao);
        }
      }

      res.render('adm/chaveamento', {
        title: 'Chaveamento dos Jogos — JIFC',
        usuarioLogado: req.user,
        mostrarFiltros: false,
        statusJifcEncerrado,
        edicaoAnoAtualJaSalva,
        anoJifcAtual: Number(adminModel.getAnoJifc() || 0),
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
        fasesEliminatoria,
        rodadaAtiva: Number.isInteger(Number(req.query.rodada)) && Number(req.query.rodada) >= 0 ? Number(req.query.rodada) : 0,
        datasEventoDisponiveis,
        resumoDisponivel,
        resumoInscricoes,
        mensagemErro: req.query.erro || '',
        mensagemSucesso: req.query.sucesso || '',
        modalidadePublicada,
        modalidadesPublicadas
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

function montarDestinoChaveamento(modalidadeId, subCategoria) {
  const id = Number(modalidadeId || 0);
  if (!id) return '';
  const sub = String(subCategoria || '').trim() || 'geral';
  return `modalidade=${id}&sub=${encodeURIComponent(sub)}&`;
}

async function gerarChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria, forcar } = req.body;
    const modalidadeIdNum = Number(modalidadeId || 0);
    const forcarSorteio = String(forcar || '').trim() === '1' || String(forcar || '').trim() === 'true';
    const configuracoes = adminModel.getConfiguracoes();
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const { prazoSorteioAberto } = obterStatusPrazos(configuracoes, hojeStr);
    const permitirGerarSorteio = forcarSorteio || prazoSorteioAberto;

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
        return res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeIdNum, subCategoria)}erro=${encodeURIComponent('Nenhuma modalidade elegível para sorteio automático.')}`);
      }

      for (const modalidade of elegiveis) {
        if (adminModel.isModalidadeTenisMesa(modalidade.nome)) {
          await adminModel.efetuarChaveamentoMatematico(modalidade.id, 'individual');
          await adminModel.efetuarChaveamentoMatematico(modalidade.id, 'dupla');
          continue;
        }

        await adminModel.efetuarChaveamentoMatematico(modalidade.id, subCategoria || '');
      }

      return res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeIdNum, subCategoria)}sucesso=${encodeURIComponent('Sorteio realizado para todas as modalidades elegíveis, exceto atletismo e xadrez.')}`);
    }

    const [mod] = await db.query('SELECT tipo_confronto, nome FROM modalidades WHERE id = ?', [modalidadeIdNum]);
    if (!mod.length) {
      return res.status(404).send('Modalidade não encontrada.');
    }

    const modalidade = mod[0];
    const modalidadeSorteavel = adminModel.isModalidadeSorteavel(modalidade.nome, modalidade.tipo_confronto, subCategoria);
    if (!modalidadeSorteavel) {
      return res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeIdNum, subCategoria)}erro=${encodeURIComponent('Esta modalidade não possui sorteio automático.')}`);
    }

    if (adminModel.isModalidadeTenisMesa(modalidade.nome)) {
      // Tênis de Mesa sempre gera os dois formatos (Individual e Dupla)
      // para que ambos apareçam nos filtros da home, independente do gênero.
      await adminModel.efetuarChaveamentoMatematico(modalidadeIdNum, 'individual');
      await adminModel.efetuarChaveamentoMatematico(modalidadeIdNum, 'dupla');
    } else {
      await adminModel.efetuarChaveamentoMatematico(modalidadeIdNum, subCategoria);
    }
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeIdNum, subCategoria)}sucesso=${encodeURIComponent(`Sorteio realizado somente para ${modalidade.nome}.`)}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao processar sorteio automático.");
  }
}

async function apagarJogosEDadosDaModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) return;

  await db.query(
    'DELETE FROM cartoes WHERE jogo_id IN (SELECT id FROM jogos WHERE modalidade_id = ?)',
    [id]
  );
  await db.query(
    'DELETE FROM resultados_por_sets WHERE jogo_id IN (SELECT id FROM jogos WHERE modalidade_id = ?)',
    [id]
  );
  await db.query(
    'DELETE FROM resultados_coletivos WHERE jogo_id IN (SELECT id FROM jogos WHERE modalidade_id = ?)',
    [id]
  );
  await db.query('UPDATE campus_modalidade SET chave_id = NULL WHERE modalidade_id = ?', [id]);
  await db.query('DELETE FROM resultados_atletismo WHERE prova_id IN (SELECT id FROM provas WHERE modalidade_id = ?)', [id]);
  await db.query('DELETE FROM resultados_xadrez WHERE modalidade_id = ?', [id]);
  await db.query('DELETE FROM classificacao_grupos WHERE modalidade_id = ?', [id]);
  await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [id]);
  await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [id]);
}

async function limparChaveamento(req, res) {
  try {
    const { modalidadeId, subCategoria } = req.body;
    const [mod] = await db.query('SELECT nome FROM modalidades WHERE id = ?', [Number(modalidadeId || 0)]);
    if (!mod.length) {
      return res.status(404).send('Modalidade não encontrada.');
    }
    const ehTenisMesa = adminModel.isModalidadeTenisMesa(mod[0].nome);

    if (ehTenisMesa) {
      const subAlvo = String(subCategoria || '').trim().toLowerCase() === 'dupla' ? 'dupla' : 'individual';
      await db.query(
        `DELETE FROM cartoes WHERE jogo_id IN (SELECT id FROM jogos WHERE modalidade_id = ? AND sub_categoria = ?)`,
        [modalidadeId, subAlvo]
      );
      await db.query(
        `DELETE FROM resultados_por_sets WHERE jogo_id IN (SELECT id FROM jogos WHERE modalidade_id = ? AND sub_categoria = ?)`,
        [modalidadeId, subAlvo]
      );
      await db.query(
        `DELETE FROM resultados_coletivos WHERE jogo_id IN (SELECT id FROM jogos WHERE modalidade_id = ? AND sub_categoria = ?)`,
        [modalidadeId, subAlvo]
      );
      await db.query('UPDATE campus_modalidade SET chave_id = NULL WHERE modalidade_id = ?', [modalidadeId]);
      await db.query('DELETE FROM classificacao_grupos WHERE modalidade_id = ?', [modalidadeId]);
      await db.query('DELETE FROM jogos WHERE modalidade_id = ? AND sub_categoria = ?', [modalidadeId, subAlvo]);
      await db.query('DELETE FROM chaves WHERE modalidade_id = ? AND sub_categoria = ?', [modalidadeId, subAlvo]);
    } else {
      await apagarJogosEDadosDaModalidade(modalidadeId);
    }

    res.redirect(`/admin/chaveamento?modalidade=${modalidadeId}&sub=${subCategoria || 'geral'}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao limpar dados do chaveamento.");
  }
}

async function publicarChaveamento(req, res) {
  const { modalidadeId, subCategoria } = req.body;
  try {
    await adminModel.publicarJogosModalidade(Number(modalidadeId || 0));
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}sucesso=` + encodeURIComponent('Sorteio confirmado e jogos publicados com sucesso.'));
  } catch (error) {
    console.error(error);
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}erro=` + encodeURIComponent(error.message || 'Erro ao publicar jogos.'));
  }
}

async function publicarTodosJogos(req, res) {
  const { modalidadeId, subCategoria } = req.body;
  try {
    await adminModel.publicarTodosJogos(Number(modalidadeId || 0));
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}sucesso=` + encodeURIComponent('Todos os jogos foram publicados com sucesso, incluindo atletismo e xadrez.'));
  } catch (error) {
    console.error(error);
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}erro=` + encodeURIComponent(error.message || 'Erro ao publicar todos os jogos.'));
  }
}

async function excluirPublicacao(req, res) {
  const { modalidadeId, subCategoria } = req.body;
  const bruto = req.body.modalidadeIds;
  const selecionadas = [
    ...new Set(
      (Array.isArray(bruto) ? bruto : String(bruto || '').split(','))
        .map((id) => Number(String(id).trim()))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  ];
  try {
    if (!selecionadas.length) {
      return res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}erro=` + encodeURIComponent('Nenhuma modalidade selecionada.'));
    }
    const placeholders = selecionadas.map(() => '?').join(',');
    await db.query(`UPDATE jogos SET publicado = 0 WHERE modalidade_id IN (${placeholders})`, selecionadas);
    await db.query(`UPDATE provas SET publicado = 0 WHERE modalidade_id IN (${placeholders})`, selecionadas);
    await db.query(`UPDATE resultados_xadrez SET publicado = 0 WHERE modalidade_id IN (${placeholders})`, selecionadas);
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}sucesso=` + encodeURIComponent('Publicação excluída das modalidades selecionadas. Chaves e sorteio mantidos.'));
  } catch (error) {
    console.error(error);
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}erro=` + encodeURIComponent(error.message || 'Erro ao excluir publicação.'));
  }
}

async function gerarEliminatoria(req, res) {
  const { modalidadeId, subCategoria } = req.body;
  try {
    const resultado = await mataMataService.gerarEliminatoria(Number(modalidadeId || 0), subCategoria);
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}sucesso=` + encodeURIComponent(`Eliminatória gerada: ${resultado.totalJogos} jogos (a partir do jogo ${resultado.numeroInicial}).`));
  } catch (error) {
    console.error(error);
    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}erro=` + encodeURIComponent(error.message || 'Erro ao gerar a eliminatória.'));
  }
}

async function cancelarSorteio(req, res) {
  const { modalidadeId, subCategoria } = req.body;
  try {
    const [modalidades] = await db.query('SELECT id, nome FROM modalidades');

    for (const modalidade of modalidades) {
      await apagarJogosEDadosDaModalidade(modalidade.id);
    }

    res.redirect(`/admin/chaveamento?${montarDestinoChaveamento(modalidadeId, subCategoria)}sucesso=${encodeURIComponent('Todos os sorteios foram cancelados.')}`);
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
    usuarioLogado: req.user,
    mostrarFiltros: false,
    campi: await listarCampi(),
    campusSelecionado,
    atletas
  });
}

async function validarAtleta(req, res) {
  const atleta = await campusModel.atualizarStatusAtleta(req.params.atletaId, 'Regular');
  if (!atleta) {
    return res.redirect('/admin/laudos?erro=' + encodeURIComponent('Atleta não encontrado para validação.'));
  }

  res.redirect('/admin/laudos?campus=' + encodeURIComponent(atleta.campus) + '&sucesso=' + encodeURIComponent('Atleta validado com sucesso.') + '#lista-atletas');
}

async function marcarIrregular(req, res) {
  const atleta = await campusModel.atualizarStatusAtleta(req.params.atletaId, 'Reprovado');
  if (!atleta) {
    return res.redirect('/admin/laudos?erro=' + encodeURIComponent('Atleta não encontrado para reprovação.'));
  }

  res.redirect('/admin/laudos?campus=' + encodeURIComponent(atleta.campus) + '&sucesso=' + encodeURIComponent('Atleta reprovado com sucesso.') + '#lista-atletas');
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
      usuarioLogado: req.user,
      mostrarFiltros: false,
      campus
    });
  } catch (error) {
    console.error('Erro ao renderizar resumo por campus:', error);
    res.status(500).send('Erro ao carregar resumo do campus.');
  }
}

async function salvarJogoChaveamento(req, res) {
  try {
    await adminModel.atualizarJogoChaveamento(req.params.jogoId, req.body);
    if (req.body.status === 'Encerrado') {
      await adminModel.atualizarClassificacaoAposJogo(req.params.jogoId);
    }
    const [jogoRows] = await db.query('SELECT modalidade_id, sub_categoria FROM jogos WHERE id = ?', [req.params.jogoId]);
    const mid = Number(jogoRows[0]?.modalidade_id || 0);
    if (!mid) {
      return res.redirect('/admin/chaveamento');
    }
    const sub = String(jogoRows[0]?.sub_categoria || 'geral');
    const rodada = Number(req.body.rodadaAtual);
    const rodadaQuery = Number.isInteger(rodada) && rodada >= 0 ? `&rodada=${rodada}` : '';
    res.redirect(`/admin/chaveamento?modalidade=${mid}&sub=${encodeURIComponent(sub)}${rodadaQuery}#match-carousel-${mid}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao salvar o confronto.');
  }
}

async function recalcularClassificacoes(req, res) {
  try {
    await adminModel.recalcularTodasClassificacoes();
    res.redirect('/admin/chaveamento');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao recalcular classificações.');
  }
}

async function renderBoletins(req, res) {
  try {
    const boletins = await adminModel.listarBoletins();
    const statusJifc = await adminModel.obterStatusJifc();
    const anoAtual = adminModel.getAnoJifc();

    res.render('adm/boletins', {
      title: 'Boletins Finais',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      boletins,
      statusJifc,
      anoAtual,
      mensagemErro: req.query.erro || '',
      mensagemSucesso: req.query.sucesso || ''
    });
  } catch (error) {
    console.error('Erro ao carregar boletins:', error);
    res.redirect('/admin/configurar?erro=' + encodeURIComponent('Erro ao carregar boletins finais.'));
  }
}

function parseJsonValue(valor, fallback) {
  if (valor === null || valor === undefined || valor === '') {
    return fallback;
  }

  if (typeof valor === 'string') {
    try {
      return JSON.parse(valor);
    } catch (error) {
      return fallback;
    }
  }

  return valor;
}

async function renderBoletimAno(req, res) {
  try {
    const ano = Number(req.params.ano || 0);
    const boletim = await adminModel.obterBoletimPorAno(ano);

    if (!boletim) {
      return res.redirect('/admin/boletins?erro=' + encodeURIComponent('Boletim final não encontrado para este ano.'));
    }

    const resumo = parseJsonValue(boletim.resumo_json, { ano, ranking: [], modalidades: [], dataGeracao: null });
    const ranking = parseJsonValue(boletim.ranking_json, resumo.ranking || []);
    const modalidades = parseJsonValue(boletim.modalidades_json, resumo.modalidades || []);

    res.render('adm/boletimDetalhe', {
      title: `Boletim final ${ano}`,
      usuarioLogado: req.user,
      mostrarFiltros: false,
      boletim,
      resumo,
      ranking,
      modalidades
    });
  } catch (error) {
    console.error('Erro ao visualizar boletim:', error);
    res.redirect('/admin/boletins?erro=' + encodeURIComponent('Erro ao visualizar o boletim final.'));
  }
}

async function gerarBoletimFinal(req, res) {
  try {
    const ano = Number(req.body.ano_jifc || adminModel.getAnoJifc());
    const resultado = await adminModel.gerarBoletimFinal(ano);

    res.redirect('/admin/boletins/' + ano + '?sucesso=' + encodeURIComponent('Boletim final gerado com sucesso.'));
  } catch (error) {
    console.error('Erro ao gerar boletim final:', error);
    res.redirect('/admin/boletins?erro=' + encodeURIComponent(error.message || 'Erro ao gerar o boletim final.'));
  }
}

async function renderEdicoesAnteriores(req, res) {
  try {
    const edicoes = await adminModel.listarEdicoes();
    const statusJifc = await adminModel.obterStatusJifc();
    const anoAtual = adminModel.getAnoJifc();

    res.render('adm/edicoesAnteriores', {
      title: 'Edições Anteriores',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      edicoes,
      statusJifc,
      anoAtual,
      mensagemErro: req.query.erro || '',
      mensagemSucesso: req.query.sucesso || ''
    });
  } catch (error) {
    console.error('Erro ao carregar edições anteriores:', error);
    res.redirect('/admin/configurar?erro=' + encodeURIComponent('Erro ao carregar edições anteriores.'));
  }
}

async function salvarEdicaoAtualAno(req, res) {
  try {
    const ano = Number(req.body.ano_jifc || adminModel.getAnoJifc());
    const resultado = await adminModel.salvarEdicaoAtual(ano);
    res.redirect('/admin/edicoes?sucesso=' + encodeURIComponent(`Edição do JIFC ${resultado.ano} salva em edições anteriores.`));
  } catch (error) {
    res.redirect('/admin/edicoes?erro=' + encodeURIComponent(error.message || 'Erro ao salvar a edição.'));
  }
}

async function importarEdicaoArquivo(req, res) {
  try {
    const texto = String(req.body.edicao_json_texto || '').trim();
    if (!texto) {
      throw new Error('Nenhum arquivo enviado.');
    }

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch (_) {
      throw new Error('O arquivo enviado não é um JSON válido.');
    }

    const resultado = await adminModel.importarEdicao(dados);
    let mensagem = `Edição do JIFC ${resultado.ano} importada com sucesso.`;
    if (Array.isArray(resultado.avisos) && resultado.avisos.length) {
      mensagem += ' Avisos: ' + resultado.avisos.join(' ');
    }
    res.redirect('/admin/edicoes?sucesso=' + encodeURIComponent(mensagem));
  } catch (error) {
    res.redirect('/admin/edicoes?erro=' + encodeURIComponent('Erro ao importar a edição: ' + (error.message || error)));
  }
}

async function excluirEdicaoAno(req, res) {
  try {
    await adminModel.excluirEdicao(req.params.ano);
    res.redirect('/admin/edicoes?sucesso=' + encodeURIComponent(`Edição ${req.params.ano} excluída.`));
  } catch (error) {
    res.redirect('/admin/edicoes?erro=' + encodeURIComponent(error.message || 'Erro ao excluir a edição.'));
  }
}

async function exportarEdicaoAno(req, res) {
  try {
    const dados = await adminModel.exportarEdicao(req.params.ano);
    if (!dados) {
      return res.redirect('/admin/edicoes?erro=' + encodeURIComponent('Edição não encontrada.'));
    }
    const ano = Number(req.params.ano);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jifc-${ano}.json"`);
    res.send(JSON.stringify(dados, null, 2));
  } catch (error) {
    res.redirect('/admin/edicoes?erro=' + encodeURIComponent('Erro ao exportar a edição.'));
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
  publicarTodosJogos,
  excluirPublicacao,
  gerarEliminatoria,
  cancelarSorteio,
  exportResumoInscricoes,
  renderAnalise,
  validarAtleta,
  marcarIrregular,
  salvarJogoChaveamento,
  recalcularClassificacoes,
  renderBoletins,
  renderBoletimAno,
  gerarBoletimFinal,
  renderEdicoesAnteriores,
  salvarEdicaoAtualAno,
  importarEdicaoArquivo,
  excluirEdicaoAno,
  exportarEdicaoAno
};
module.exports.renderResumoCampus = renderResumoCampus;