const { inferirGeneroModalidade, inferirTipoConfrontoModalidade, inferirFormatoDisputaModalidade } = require('../utils/modalidadeHelpers');
const { obterRegras, colunasParaExibicao, normalizarNome } = require('../utils/sportClassificationRules');

const configService = require('../services/configService');
const modalidadeService = require('../services/modalidadeService');
const chaveamentoService = require('../services/chaveamentoService');
const jogoService = require('../services/jogoService');
const classificacaoService = require('../services/classificacaoService');
const boletimService = require('../services/boletimService');
const edicaoService = require('../services/edicaoService');

function getTipoTabelaModalidade(nomeModalidade) {
  const nome = normalizarNome(nomeModalidade);
  if (/atletismo/i.test(nome)) return 'atletismo';
  if (/xadrez/i.test(nome)) return 'xadrez';
  if (/tenis.*mesa/i.test(nome)) return 'tenis_mesa';
  return 'equipe';
}

function getColunasTabelaModalidade(nomeModalidade) {
  const nome = normalizarNome(nomeModalidade);
  if (/atletismo/i.test(nome)) return ['Categoria', 'Resultado'];
  if (/xadrez/i.test(nome)) return ['Atleta', 'Campus', 'PTS', 'V', 'D', 'E', 'SB'];
  return colunasParaExibicao(nomeModalidade);
}

module.exports = {
  getConfiguracoes: configService.getConfiguracoes,
  salvarConfiguracoes: configService.salvarConfiguracoes,
  getAnoJifc: configService.getAnoJifc,
  getConfiguracoesBanco: configService.getConfiguracoesBanco,
  gerarDatasEventoDisponiveis: configService.gerarDatasEventoDisponiveis,

  getModalidadesBanco: modalidadeService.getModalidadesBanco,
  listarModalidadesConfiguracao: modalidadeService.listarModalidadesConfiguracao,
  adicionarModalidade: modalidadeService.adicionarModalidade,
  removerModalidadePorId: modalidadeService.removerModalidadePorId,
  isModalidadeSorteavel: modalidadeService.isModalidadeSorteavel,
  isModalidadeTenisMesa: modalidadeService.isModalidadeTenisMesa,

  inferirGeneroModalidade,
  inferirTipoConfrontoModalidade,
  inferirFormatoDisputaModalidade,

  agruparParticipantesEmChaves: chaveamentoService.agruparParticipantesEmChaves,
  efetuarChaveamentoMatematico: chaveamentoService.efetuarChaveamentoMatematico,
  montarConfrontosDaChave: chaveamentoService.montarConfrontosDaChave,
  atualizarJogoChaveamento: chaveamentoService.atualizarJogoChaveamento,
  getInscritosModalidade: chaveamentoService.getInscritosModalidade,
  getChavesModalidade: chaveamentoService.getChavesModalidade,
  getJogosModalidade: chaveamentoService.getJogosModalidade,

  getJogos: jogoService.getJogos,
  getJogosPublicados: jogoService.getJogosPublicados,
  getDiasDisponiveis: jogoService.getDiasDisponiveis,
  getJogoPorId: jogoService.getJogoPorId,
  publicarJogosModalidade: jogoService.publicarJogosModalidade,
  publicarTodosJogos: jogoService.publicarTodosJogos,
  agruparJogosPorRodadas: jogoService.agruparJogosPorRodadas,

  getResumoInscricoes: classificacaoService.getResumoInscricoes,
  getClassificacaoModalidade: classificacaoService.getClassificacaoModalidade,
  sincronizarClassificacaoGruposModalidade: classificacaoService.sincronizarClassificacaoGruposModalidade,
  atualizarClassificacaoAposJogo: classificacaoService.atualizarClassificacaoAposJogo,
  registrarCartoes: classificacaoService.registrarCartoes,
  recalcularClassificacaoModalidade: classificacaoService.recalcularClassificacaoModalidade,
  recalcularTodasClassificacoes: classificacaoService.recalcularTodasClassificacoes,

  getTipoTabelaModalidade,
  getColunasTabelaModalidade,

  detectarEncerramentoJifc: boletimService.detectarEncerramentoJifc,
  obterStatusJifc: boletimService.obterStatusJifc,
  gerarBoletimFinal: boletimService.gerarBoletimFinal,
  listarBoletins: boletimService.listarBoletins,
  obterBoletimPorAno: boletimService.obterBoletimPorAno,
  montarResumoBoletim: boletimService.montarResumoBoletim,

  listarEdicoes: edicaoService.listarEdicoes,
  listarAnosEdicoes: edicaoService.listarAnosEdicoes,
  obterEdicaoPorAno: edicaoService.obterEdicao,
  salvarEdicaoAtual: edicaoService.salvarEdicaoAtual,
  importarEdicao: edicaoService.importarEdicao,
  exportarEdicao: edicaoService.exportarEdicao,
  excluirEdicao: edicaoService.excluirEdicao
};
