const campusModel = require('../models/campusModel');
const adminModel = require('../models/adminModel');
const jogoService = require('../services/jogoService');
const { gerarPlanilhaAtletas } = require('../services/exportAtletasExcelService');
const substitutionDocumentStore = require('../services/substitutionDocumentStore');
const { validationResult } = require('express-validator');

const atletaFormDrafts = new Map();

function validarRequisicaoAtleta(req) {
  const erros = validationResult(req);
  if (erros.isEmpty()) return null;

  const erro = new Error(erros.array().map((item) => item.msg).join(' '));
  erro.code = 'VALIDATION_ERROR';
  return erro;
}

function obterDataAtual() {
  const hoje = new Date();
  const pad = (valor) => String(valor).padStart(2, '0');
  return `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
}

async function renderInscricoes(req, res) {
  try {
    await campusModel.carregarCacheDeInscricoesEAtletas();
    const nomeCampus = req.user.nome;
    const config = adminModel.getConfiguracoes();
    const hoje = obterDataAtual();
    const anoEvento = Number(config.ano_evento || new Date().getFullYear());
    const abaAtiva = req.query.aba === 'atletas' ? 'atletas' : 'modalidades';
    const atletaEmEdicao = req.query.editar ? campusModel.getAtletaPorId(req.query.editar) : null;

    if (atletaEmEdicao && atletaEmEdicao.campus !== nomeCampus) {
      return res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent('Atleta não encontrado para edição.') + '#atletas');
    }

    if (atletaEmEdicao && atletaEmEdicao.status !== 'Analise') {
      return res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent('Atletas validados ou reprovados não podem ser editados.') + '#atletas');
    }

    const inicioModalidades = config.inicio_inscricao_modalidades;
    const fimModalidades = config.fim_inscricao_modalidades;
    const prazoModalidadesAberto = inicioModalidades && fimModalidades && (hoje >= inicioModalidades && hoje <= fimModalidades);

    const inicioAtletas = config.inicio_inscricao_atletas;
    const fimAtletas = config.fim_inscricao_atletas;
    const prazoAtletasAberto = inicioAtletas && fimAtletas && (hoje >= inicioAtletas && hoje <= fimAtletas);

    const inicioSubstituicao = config.inicio_substituicao_atletas;
    const fimSubstituicao = config.fim_substituicao_atletas;
    const prazoSubstituicaoAberto = inicioSubstituicao && fimSubstituicao && (hoje >= inicioSubstituicao && hoje <= fimSubstituicao);

    const modalidadesDisponiveis = await adminModel.getModalidadesBanco();

    res.render('campus/inscricoes', {
      title: 'Painel de Inscrições',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      modalidadesInscritas: campusModel.getInscricoes(nomeCampus),
      atletas: campusModel.getAtletas(nomeCampus),
      atletaFormDraft: atletaFormDrafts.get(req.user.email) || null,
      nomeCampus,
      prazoModalidadesAberto,
      prazoAtletasAberto,
      prazoSubstituicaoAberto,
      prazosSubstituicao: { inicio: inicioSubstituicao, fim: fimSubstituicao },
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
      prazosAtletas: { inicio: inicioAtletas, fim: fimAtletas },
      modalidadesDisponiveis
    });
  } catch (error) {
    console.error('Erro ao carregar inscrições de campus:', error);
    res.status(500).send('Erro ao carregar as inscrições do campus.');
  }
}

async function salvarInscricoes(req, res) {
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_inscricao_modalidades;
  const fim = config.fim_inscricao_modalidades;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  if (!prazoAberto) {
    return res.status(403).send("Erro: O período de inscrição de modalidades está encerrado.");
  }

  const nomeCampus = req.user.nome;
  try {
    await campusModel.salvarInscricoes(nomeCampus, req.body.modalidades || []);
    res.redirect('/campus/inscricoes');
  } catch (error) {
    console.error('Erro ao salvar modalidades do campus:', error);
    res.status(500).send('Erro ao salvar as modalidades do campus.');
  }
}

async function renderAtletas(req, res) {
  try {
    await campusModel.carregarCacheDeInscricoesEAtletas();
    const nomeCampus = req.user.nome;
    const config = adminModel.getConfiguracoes();
    const hoje = obterDataAtual();
    const anoEvento = Number(config.ano_evento || new Date().getFullYear());

    const inicio = config.inicio_inscricao_atletas;
    const fim = config.fim_inscricao_atletas;
    const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);
    const inicioSubstituicao = config.inicio_substituicao_atletas;
    const fimSubstituicao = config.fim_substituicao_atletas;
    const prazoSubstituicaoAberto = inicioSubstituicao && fimSubstituicao && (hoje >= inicioSubstituicao && hoje <= fimSubstituicao);
    const atletaEmEdicao = req.query.editar ? campusModel.getAtletaPorId(req.query.editar) : null;
    const modalidadesInscritas = campusModel.getInscricoes(nomeCampus);
    const atletas = campusModel.getAtletas(nomeCampus);
    const atletaFormDraft = atletaFormDrafts.get(req.user.email) || null;
    const limiteAtletasTotalCampus = Number(config.limite_atletas_total_campus || 0);
    const quantidadeRegulares = campusModel.getQuantidadeRegulares(nomeCampus);
    const quantidadePendentes = campusModel.getQuantidadePendentes(nomeCampus);
    const quantidadeAnalise = campusModel.getQuantidadeAnalise(nomeCampus);
    const quantidadeReprovados = campusModel.getQuantidadeReprovados(nomeCampus);

    return res.render('campus/atletas', {
      title: 'Gerenciar Atletas',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      faseAtual: 'regular',
      atletas,
      modalidadesInscritas,
      atletaEmEdicao,
      nomeCampus,
      prazoAberto: prazoAberto,
      prazos: { inicio, fim },
      prazoSubstituicaoAberto,
      prazosSubstituicao: { inicio: inicioSubstituicao, fim: fimSubstituicao },
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
  } catch (error) {
    console.error('Erro ao renderizar atletas do campus:', error);
    res.status(500).send('Erro ao carregar lista de atletas.');
  }
}

async function cadastrarAtleta(req, res) {
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_inscricao_atletas;
  const fim = config.fim_inscricao_atletas;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  if (!prazoAberto) {
    return res.status(403).send("Erro: O período de inscrição de atletas está encerrado.");
  }

  const nomeCampus = req.user.nome;
  try {
    const erroValidacao = validarRequisicaoAtleta(req);
    if (erroValidacao) throw erroValidacao;

    const atleta = await campusModel.cadastrarAtleta(nomeCampus, {
      nome: req.body.nome,
      matricula: req.body.matricula,
      genero: req.body.genero,
      modalidades: req.body.modalidades || req.body.modalidade || [],
      atletismoProvas: req.body.atletismoProvas || req.body.provasAtletismo || [],
      tenisMesaParticipacoes: req.body.tenisMesaParticipacoes || req.body.participacoesTenisMesa || [],
      dataNascimento: req.body.dataNascimento,
      cpf: req.body.cpf,
      rg: req.body.rg,
      status: 'Analise'
    }, {
      limiteRegularTotalCampus: Number(config.limite_atletas_total_campus || 0),
      anoEvento: Number(config.ano_evento || new Date().getFullYear())
    });

    const mensagem = 'Atleta cadastrado com sucesso e enviado para análise.';
    atletaFormDrafts.delete(req.user.email);
    res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent(mensagem) + '#atletas');
  } catch (error) {
    atletaFormDrafts.set(req.user.email, {
      nome: req.body.nome || '',
      matricula: req.body.matricula || '',
      genero: req.body.genero || 'Masculino',
      modalidades: req.body.modalidades || req.body.modalidade || [],
      atletismoProvas: req.body.atletismoProvas || req.body.provasAtletismo || [],
      tenisMesaParticipacoes: req.body.tenisMesaParticipacoes || req.body.participacoesTenisMesa || [],
      dataNascimento: req.body.dataNascimento || '',
      cpf: req.body.cpf || '',
      rg: req.body.rg || '',
      status: 'Analise'
    });
    const mensagensConhecidas = ['VALIDATION_ERROR', 'CPF_INVALIDO', 'MATRICULA_DUPLICADA', 'MATRICULA_INVALIDA', 'LIMITE_REGULAR_EXCEDIDO', 'LIMITE_MODALIDADE_EXCEDIDO', 'DATA_INVALIDA', 'IDADE_LIMITE_EXCEDIDO', 'MODALIDADES_OBRIGATORIAS', 'MODALIDADES_EXCEDIDAS', 'PROVAS_ATLETISMO_OBRIGATORIAS', 'PARTICIPACOES_TENIS_MESA_OBRIGATORIAS', 'NOME_INCOMPLETO', 'CAMPOS_OBRIGATORIOS'];
    const mensagem = mensagensConhecidas.includes(error.code)
      ? error.message
      : 'Não foi possível cadastrar o atleta.';
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(mensagem) + '#atletas');
  }
}

function editarAtleta(req, res) {
  try {
    const nomeCampus = req.user.nome;
    const atleta = campusModel.getAtletaPorId(req.params.id);

    if (!atleta || atleta.campus !== nomeCampus) {
      return res.redirect('/campus/atletas?erro=' + encodeURIComponent('Atleta não encontrado para edição.'));
    }

    if (atleta.status !== 'Analise') {
      return res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent('Atletas validados ou reprovados não podem ser editados.') + '#atletas');
    }

    const config = adminModel.getConfiguracoes();
    const hoje = obterDataAtual();
    const inicio = config.inicio_inscricao_atletas;
    const fim = config.fim_inscricao_atletas;
    const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

    return res.render('campus/atletas', {
      title: 'Gerenciar Atletas',
      usuarioLogado: req.user,
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
      quantidadeAnalise: campusModel.getQuantidadeAnalise(nomeCampus),
      quantidadeReprovados: campusModel.getQuantidadeReprovados(nomeCampus),
      quantidadeTotal: campusModel.getQuantidadeTotal(nomeCampus),
      limiteAtletasTotalCampus: Number(config.limite_atletas_total_campus || 0),
      limiteDisponivelRegulares: campusModel.getQuantidadeDisponivelRegular(nomeCampus, Number(config.limite_atletas_total_campus || 0)),
      mensagemErro: req.query.erro || '',
      mensagemSucesso: req.query.sucesso || ''
    });
  } catch (error) {
    console.error('Erro ao renderizar edição de atleta:', error);
    res.status(500).send('Erro ao carregar formulário de edição.');
  }
}

async function atualizarAtleta(req, res) {
  const nomeCampus = req.user.nome;
  const config = adminModel.getConfiguracoes();

  try {
    const erroValidacao = validarRequisicaoAtleta(req);
    if (erroValidacao) throw erroValidacao;

    const atleta = await campusModel.atualizarAtleta(req.params.id, nomeCampus, {
      nome: req.body.nome,
      matricula: req.body.matricula,
      genero: req.body.genero,
      modalidades: req.body.modalidades || req.body.modalidade || [],
      atletismoProvas: req.body.atletismoProvas || req.body.provasAtletismo || [],
      tenisMesaParticipacoes: req.body.tenisMesaParticipacoes || req.body.participacoesTenisMesa || [],
      dataNascimento: req.body.dataNascimento,
      cpf: req.body.cpf,
      rg: req.body.rg,
      status: 'Analise'
    }, {
      limiteRegularTotalCampus: Number(config.limite_atletas_total_campus || 0),
      anoEvento: Number(config.ano_evento || new Date().getFullYear())
    });

    if (!atleta) {
      return res.redirect('/campus/atletas?erro=' + encodeURIComponent('Atleta não encontrado para atualização.'));
    }

    atletaFormDrafts.delete(req.user.email);
      res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent('Atleta enviado novamente para análise.') + '#atletas');
  } catch (error) {
    atletaFormDrafts.set(req.user.email, {
      nome: req.body.nome || '',
      matricula: req.body.matricula || '',
      genero: req.body.genero || 'Masculino',
      modalidades: req.body.modalidades || req.body.modalidade || [],
      atletismoProvas: req.body.atletismoProvas || req.body.provasAtletismo || [],
      tenisMesaParticipacoes: req.body.tenisMesaParticipacoes || req.body.participacoesTenisMesa || [],
      dataNascimento: req.body.dataNascimento || '',
      cpf: req.body.cpf || '',
      rg: req.body.rg || '',
      status: 'Analise'
    });
    const mensagensConhecidas = ['VALIDATION_ERROR', 'CPF_INVALIDO', 'MATRICULA_DUPLICADA', 'MATRICULA_INVALIDA', 'IDADE_LIMITE_EXCEDIDO', 'DATA_INVALIDA', 'MODALIDADES_OBRIGATORIAS', 'MODALIDADES_EXCEDIDAS', 'PROVAS_ATLETISMO_OBRIGATORIAS', 'PARTICIPACOES_TENIS_MESA_OBRIGATORIAS', 'LIMITE_REGULAR_EXCEDIDO', 'LIMITE_MODALIDADE_EXCEDIDO', 'NOME_INCOMPLETO', 'CAMPOS_OBRIGATORIOS', 'ATLETA_NAO_EDITAVEL'];
    const mensagem = mensagensConhecidas.includes(error.code) ? error.message : 'Não foi possível atualizar o atleta.';
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(mensagem) + '#atletas');
  }
}

async function excluirAtleta(req, res) {
  try {
    const nomeCampus = req.user.nome;
    const removido = await campusModel.excluirAtleta(req.params.id, nomeCampus);

    if (!removido) {
      return res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent('Atleta não encontrado para exclusão.') + '#atletas');
    }

    res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent('Atleta excluído com sucesso.') + '#atletas');
  } catch (error) {
    if (error && error.code === 'ATLETA_NAO_EDITAVEL') {
      return res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(error.message) + '#atletas');
    }
    console.error('Erro ao excluir atleta:', error);
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent('Erro ao excluir atleta.') + '#atletas');
  }
}

async function substituirAtleta(req, res) {
  const config = adminModel.getConfiguracoes();
  const hoje = obterDataAtual();
  const inicio = config.inicio_substituicao_atletas;
  const fim = config.fim_substituicao_atletas;
  const prazoAberto = inicio && fim && (hoje >= inicio && hoje <= fim);

  if (!prazoAberto) {
    return res.status(403).send("Erro: O período de substituição de atletas está encerrado.");
  }

  const nomeCampus = req.user.nome;
  let documentoPath = null;

  try {
    const erroValidacao = validarRequisicaoAtleta(req);
    if (erroValidacao) throw erroValidacao;
    if (!req.file) {
      const erro = new Error('Anexe um comprovante da substituição em PDF, JPG ou PNG.');
      erro.code = 'DOCUMENTO_SUBSTITUICAO_OBRIGATORIO';
      throw erro;
    }
    documentoPath = await substitutionDocumentStore.armazenarDocumento(req.file.buffer);

    await campusModel.substituirAtleta(nomeCampus, {
      nome: req.body.nome,
      matricula: req.body.matricula,
      genero: req.body.genero,
      modalidades: req.body.modalidades || req.body.modalidade || [],
      atletismoProvas: req.body.atletismoProvas || req.body.provasAtletismo || [],
      tenisMesaParticipacoes: req.body.tenisMesaParticipacoes || req.body.participacoesTenisMesa || [],
      cpf: req.body.cpf,
      rg: req.body.rg,
      dataNascimento: req.body.dataNascimento,
      motivo: req.body.motivo || req.body.alunoSubstituindo || 'Substituição por laudo/documento',
      atletaSubstituidoId: req.body.atletaSubstituidoId || req.body.atleta_substituido_id || null,
      documentoPath
    });
    res.redirect('/campus/inscricoes?aba=atletas&sucesso=' + encodeURIComponent('Substituição realizada com sucesso. O atleta substituído não aparecerá mais nesta edição.') + '#atletas');
  } catch (error) {
    if (documentoPath) {
      try {
        await substitutionDocumentStore.removerDocumento(documentoPath);
      } catch (erroRemocao) {
        console.error('Não foi possível remover comprovante de substituição órfão:', erroRemocao.message);
      }
    }
    const mensagensConhecidas = ['VALIDATION_ERROR', 'CPF_INVALIDO', 'MATRICULA_DUPLICADA', 'MATRICULA_INVALIDA', 'NOME_INCOMPLETO', 'CAMPOS_OBRIGATORIOS', 'LIMITE_MODALIDADE_EXCEDIDO', 'LIMITE_REGULAR_EXCEDIDO', 'ATLETA_NAO_EDITAVEL', 'ATLETA_SUBSTITUICAO_INVALIDA', 'DOCUMENTO_SUBSTITUICAO_OBRIGATORIO', 'DOCUMENTO_SUBSTITUICAO_INVALIDO', 'TIPO_DOCUMENTO_SUBSTITUICAO_INVALIDO', 'DATA_INVALIDA', 'IDADE_LIMITE_EXCEDIDO', 'MODALIDADES_OBRIGATORIAS', 'MODALIDADES_EXCEDIDAS', 'PROVAS_ATLETISMO_OBRIGATORIAS', 'PARTICIPACOES_TENIS_MESA_OBRIGATORIAS'];
    const mensagem = mensagensConhecidas.includes(error.code)
      ? error.message
      : 'Não foi possível registrar a substituição.';
    res.redirect('/campus/inscricoes?aba=atletas&erro=' + encodeURIComponent(mensagem) + '#atletas');
  }
}

function gerarSlugArquivo(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function exportarAtletasExcel(req, res) {
  const nomeCampus = req.user.nome;
  const destino = '/campus/inscricoes?aba=atletas';

  try {
    const atletas = campusModel.getAtletasParaAnalise(nomeCampus);

    if (!atletas.length) {
      return res.redirect(destino + '&erro=' + encodeURIComponent('Nenhum atleta cadastrado para exportar.') + '#atletas');
    }

    const buffer = await gerarPlanilhaAtletas(atletas, { campus: nomeCampus });
    const dataAtual = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `atletas-${gerarSlugArquivo(nomeCampus) || 'campus'}-${dataAtual}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erro ao exportar atletas do campus para Excel:', error);
    return res.redirect(destino + '&erro=' + encodeURIComponent('Não foi possível exportar a planilha de atletas.') + '#atletas');
  }
}

async function renderJogos(req, res) {
  try {
    const nomeCampus = req.user.nome;
    const nomeExibicao = req.user.nomeExibicao;
    const nomesCampus = [nomeCampus, nomeExibicao].filter(Boolean);
    const jogos = await adminModel.getJogos();
    const jogosCampus = jogoService.filtrarJogosDoCampus(jogos, nomesCampus);
    const jogosCampusPorDia = {};
    jogosCampus.forEach((jogo) => {
      const dia = String(jogo.data || '').trim();
      if (!dia) return;
      if (!jogosCampusPorDia[dia]) jogosCampusPorDia[dia] = [];
      jogosCampusPorDia[dia].push(jogo);
    });
    const diasJogosCampus = Object.keys(jogosCampusPorDia).sort((a, b) => {
      const [diaA, mesA] = a.split('/').map(Number);
      const [diaB, mesB] = b.split('/').map(Number);
      return ((mesA || 1) * 100 + (diaA || 1)) - ((mesB || 1) * 100 + (diaB || 1));
    });
    const diaJogosSelecionado = diasJogosCampus.includes(req.query.dia) ? req.query.dia : (diasJogosCampus[0] || '');
    res.render('campus/jogos', {
      title: 'Jogos do Campus',
      usuarioLogado: req.user,
      mostrarFiltros: false,
      jogosCampus,
      jogosCampusPorDia,
      diasJogosCampus,
      diaJogosSelecionado
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar os jogos do campus.");
  }
}

module.exports = {
  renderInscricoes,
  salvarInscricoes,
  renderAtletas,
  cadastrarAtleta,
  editarAtleta,
  atualizarAtleta,
  excluirAtleta,
  substituirAtleta,
  exportarAtletasExcel,
  renderJogos
};
