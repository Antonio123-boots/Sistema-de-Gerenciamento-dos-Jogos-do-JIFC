const campusModel = require('../models/campusModel');
const adminModel = require('../models/adminModel');

// Função auxiliar para obter a data atual do servidor em formato AAAA-MM-DD
function obterDataAtual() {
  return new Date().toISOString().split('T')[0];
}

// 1. Exibe as modalidades já inscritas pelo campus logado
function renderInscricoes(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const anoEvento = Number(config.ano_evento || new Date().getFullYear());
  const abaAtiva = req.query.aba === 'atletas' ? 'atletas' : 'modalidades';
  const atletaEmEdicao = req.query.editar ? campusModel.getAtletaPorId(req.query.editar) : null;

  const inicioModalidades = config.inicio_inscricao_modalidades;
  const fimModalidades = config.fim_inscricao_modalidades;
  const prazoModalidadesAberto = inicioModalidades && fimModalidades && (hoje >= inicioModalidades && hoje <= fimModalidades);

  const inicioAtletas = config.inicio_inscricao_atletas;
  const fimAtletas = config.fim_inscricao_atletas;
  const prazoAtletasAberto = inicioAtletas && fimAtletas && (hoje >= inicioAtletas && hoje <= fimAtletas);

  res.render('campus/inscrições', {
    title: 'Painel de Inscrições',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    modalidadesInscritas: campusModel.getInscricoes(nomeCampus),
    atletas: campusModel.getAtletas(nomeCampus),
    nomeCampus,
    prazoModalidadesAberto,
    prazoAtletasAberto,
    quantidadeRegulares: campusModel.getQuantidadeRegulares(nomeCampus),
    quantidadePendentes: campusModel.getQuantidadePendentes(nomeCampus),
    quantidadeAnalise: campusModel.getQuantidadeAnalise(nomeCampus),
    quantidadeReprovados: campusModel.getQuantidadeReprovados(nomeCampus),
    quantidadeTotal: campusModel.getQuantidadeTotal(nomeCampus),
    limiteAtletasTotalCampus: Number(config.limite_atletas_total_campus || 0),
    anoEvento,
    abaAtiva,
    atletaEmEdicao,
    mensagemErro: req.query.erro || '',
    mensagemSucesso: req.query.sucesso || '',
    prazosModalidades: { inicio: inicioModalidades, fim: fimModalidades },
    prazosAtletas: { inicio: inicioAtletas, fim: fimAtletas }
  });
}

// 2. Salva as modalidades escolhidas no painel do campus
function salvarInscricoes(req, res) {
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_inscricao_modalidades;
  const fim = config.fim_inscricao_modalidades;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  if (!prazoAberto) {
    return res.status(403).send("Erro: O período de inscrição de modalidades está encerrado.");
  }

  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  campusModel.salvarInscricoes(nomeCampus, req.body.modalidades || []);
  res.redirect('/campus/inscricoes');
}

// 3. Mostra a lista de atletas do campus para cadastro ou substituição
function renderAtletas(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const anoEvento = Number(config.ano_evento || new Date().getFullYear());

  const inicio = config.inicio_inscricao_atletas;
  const fim = config.fim_inscricao_atletas;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);
  const atletaEmEdicao = req.query.editar ? campusModel.getAtletaPorId(req.query.editar) : null;
  const modalidadesInscritas = campusModel.getInscricoes(nomeCampus);
  const atletas = campusModel.getAtletas(nomeCampus);
  const atletaFormDraft = req.session?.atletaFormDraft || null;
  const limiteAtletasTotalCampus = Number(config.limite_atletas_total_campus || 0);
  const quantidadeRegulares = campusModel.getQuantidadeRegulares(nomeCampus);
  const quantidadePendentes = campusModel.getQuantidadePendentes(nomeCampus);
  const quantidadeAnalise = campusModel.getQuantidadeAnalise(nomeCampus);
  const quantidadeReprovados = campusModel.getQuantidadeReprovados(nomeCampus);

  res.render('campus/atletas', {
    title: 'Gerenciar Atletas',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    faseAtual: 'regular',
    atletas,
    modalidadesInscritas,
    atletaEmEdicao,
    nomeCampus,
    prazoAberto: prazoAberto,
    prazos: { inicio, fim },
    quantidadeRegulares,
    quantidadePendentes,
    quantidadeAnalise,
    quantidadeReprovados,
    quantidadeTotal: campusModel.getQuantidadeTotal(nomeCampus),
    limiteAtletasTotalCampus,
    limiteDisponivelRegulares: campusModel.getQuantidadeDisponivelRegular(nomeCampus, limiteAtletasTotalCampus),
    anoEvento,
    atletaFormDraft,
    mensagemErro: req.query.erro || '',
    mensagemSucesso: req.query.sucesso || ''
  });
}

// 4. Registra um novo atleta na base de dados local
function cadastrarAtleta(req, res) {
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_inscricao_atletas;
  const fim = config.fim_inscricao_atletas;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  if (!prazoAberto) {
    return res.status(403).send("Erro: O período de inscrição de atletas está encerrado.");
  }

  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  try {
    const atleta = campusModel.cadastrarAtleta(nomeCampus, {
      nome: req.body.nome,
      matricula: req.body.matricula,
      genero: req.body.genero,
      modalidades: req.body.modalidades || req.body.modalidade || [],
      dataNascimento: req.body.dataNascimento,
      status: 'Analise'
    }, {
      limiteRegularTotalCampus: Number(config.limite_atletas_total_campus || 0),
      anoEvento: Number(config.ano_evento || new Date().getFullYear())
    });

    const mensagem = 'Atleta enviado para análise do admin.';
    if (req.session) {
      delete req.session.atletaFormDraft;
    }
    res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent(mensagem) + '#atletas');
  } catch (error) {
    if (req.session) {
      req.session.atletaFormDraft = {
        nome: req.body.nome || '',
        matricula: req.body.matricula || '',
        genero: req.body.genero || 'Masculino',
        modalidades: req.body.modalidades || req.body.modalidade || [],
        dataNascimento: req.body.dataNascimento || '',
        status: 'Analise'
      };
    }
    const mensagensConhecidas = ['MATRICULA_DUPLICADA', 'LIMITE_REGULAR_EXCEDIDO', 'DATA_INVALIDA', 'IDADE_LIMITE_EXCEDIDO', 'MODALIDADES_OBRIGATORIAS', 'MODALIDADES_EXCEDIDAS', 'NOME_INCOMPLETO', 'CAMPOS_OBRIGATORIOS'];
    const mensagem = mensagensConhecidas.includes(error.code)
      ? error.message
      : 'Não foi possível cadastrar o atleta.';
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(mensagem) + '#atletas');
  }
}

function editarAtleta(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  const atleta = campusModel.getAtletaPorId(req.params.id);

  if (!atleta || atleta.campus !== nomeCampus) {
    return res.redirect('/campus/atletas?erro=' + encodeURIComponent('Atleta não encontrado para edição.'));
  }

  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_inscricao_atletas;
  const fim = config.fim_inscricao_atletas;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  return res.render('campus/atletas', {
    title: 'Gerenciar Atletas',
    usuarioLogado: req.session?.usuario || null,
    mostrarFiltros: false,
    faseAtual: 'regular',
    atletas: campusModel.getAtletas(nomeCampus),
    modalidadesInscritas: campusModel.getInscricoes(nomeCampus),
    atletaEmEdicao: atleta,
    nomeCampus,
    prazoAberto,
    prazos: { inicio, fim },
    quantidadeRegulares: campusModel.getQuantidadeRegulares(nomeCampus),
    quantidadePendentes: campusModel.getQuantidadePendentes(nomeCampus),
    quantidadeTotal: campusModel.getQuantidadeTotal(nomeCampus),
    limiteAtletasTotalCampus: Number(config.limite_atletas_total_campus || 0),
    limiteDisponivelRegulares: campusModel.getQuantidadeDisponivelRegular(nomeCampus, Number(config.limite_atletas_total_campus || 0)),
    mensagemErro: req.query.erro || '',
    mensagemSucesso: req.query.sucesso || ''
  });
}

function atualizarAtleta(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  const config = adminModel.getConfiguracoes();

  try {
    const atleta = campusModel.atualizarAtleta(req.params.id, nomeCampus, {
      nome: req.body.nome,
      matricula: req.body.matricula,
      genero: req.body.genero,
      modalidades: req.body.modalidades || req.body.modalidade || [],
      dataNascimento: req.body.dataNascimento,
        status: 'Analise'
    }, {
      limiteRegularTotalCampus: Number(config.limite_atletas_total_campus || 0),
      anoEvento: Number(config.ano_evento || new Date().getFullYear())
    });

    if (!atleta) {
      return res.redirect('/campus/atletas?erro=' + encodeURIComponent('Atleta não encontrado para atualização.'));
    }

    if (req.session) {
      delete req.session.atletaFormDraft;
    }
      res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent('Atleta enviado novamente para análise.') + '#atletas');
  } catch (error) {
    if (req.session) {
      req.session.atletaFormDraft = {
        nome: req.body.nome || '',
        matricula: req.body.matricula || '',
        genero: req.body.genero || 'Masculino',
        modalidades: req.body.modalidades || req.body.modalidade || [],
        dataNascimento: req.body.dataNascimento || '',
          status: 'Analise'
      };
    }
    const mensagensConhecidas = ['MATRICULA_DUPLICADA', 'IDADE_LIMITE_EXCEDIDO', 'DATA_INVALIDA', 'MODALIDADES_OBRIGATORIAS', 'MODALIDADES_EXCEDIDAS', 'LIMITE_REGULAR_EXCEDIDO', 'NOME_INCOMPLETO', 'CAMPOS_OBRIGATORIOS'];
    const mensagem = mensagensConhecidas.includes(error.code) ? error.message : 'Não foi possível atualizar o atleta.';
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(mensagem) + '#atletas');
  }
}

function excluirAtleta(req, res) {
  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
  const removido = campusModel.excluirAtleta(req.params.id, nomeCampus);

  if (!removido) {
    return res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent('Atleta não encontrado para exclusão.') + '#atletas');
  }

  res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent('Atleta excluído com sucesso.') + '#atletas');
}

// 5. Registra uma substituição com status pendente de laudo
function substituirAtleta(req, res) {
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_inscricao_atletas;
  const fim = config.fim_inscricao_atletas;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  if (!prazoAberto) {
    return res.status(403).send("Erro: O período de alteração de atletas está encerrado.");
  }

  const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';

  try {
    campusModel.substituirAtleta(nomeCampus, {
      nome: req.body.nome,
      matricula: req.body.matricula,
      genero: req.body.genero,
      modalidades: req.body.modalidades || req.body.modalidade || [],
      motivo: req.body.motivo || 'Substituição por laudo'
    });
    res.redirect('/campus/inscricoes?aba=atletas#atletas');
  } catch (error) {
    const mensagem = ['NOME_INCOMPLETO', 'CAMPOS_OBRIGATORIOS'].includes(error.code) ? error.message : 'Não foi possível registrar a substituição.';
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(mensagem) + '#atletas');
  }
}

// 6. Lista os jogos relacionados ao campus autenticado (Mantido intacto)
async function renderJogos(req, res) {
  try {
    const nomeCampus = req.session?.usuario?.nome || 'IFC Blumenau';
    const jogos = await adminModel.getJogos();
    const jogosCampus = jogos.filter((jogo) =>
      jogo.casa === nomeCampus || jogo.fora === nomeCampus
    );
    res.render('campus/jogos', {
      title: 'Jogos do Campus',
      usuarioLogado: req.session?.usuario || null,
      mostrarFiltros: false,
      jogosCampus
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar os jogos do campus.");
  }
}

// Exportações corretas para o campusRoutes.js conseguir mapear
module.exports = {
  renderInscricoes,
  salvarInscricoes,
  renderAtletas,
  cadastrarAtleta,
  editarAtleta,
  atualizarAtleta,
  excluirAtleta,
  substituirAtleta,
  renderJogos
};