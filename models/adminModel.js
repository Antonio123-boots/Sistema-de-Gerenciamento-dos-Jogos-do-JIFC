const { inferirGeneroModalidade, inferirTipoConfrontoModalidade, inferirFormatoDisputaModalidade } = require('../utils/modalidadeHelpers');

const configService = require('../services/configService');
const modalidadeService = require('../services/modalidadeService');
const chaveamentoService = require('../services/chaveamentoService');
const jogoService = require('../services/jogoService');
const classificacaoService = require('../services/classificacaoService');

module.exports = {
  getConfiguracoes: configService.getConfiguracoes,
  salvarConfiguracoes: configService.salvarConfiguracoes,
  getAnoJifc: configService.getAnoJifc,
  getAtletasPendentes: configService.getAtletasPendentes,
  validarAtleta: configService.validarAtleta,
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
  getJogoPorId: jogoService.getJogoPorId,
  publicarJogosModalidade: jogoService.publicarJogosModalidade,
  publicarTodosJogos: jogoService.publicarTodosJogos,
  agruparJogosPorRodadas: jogoService.agruparJogosPorRodadas,

  getResumoInscricoes: classificacaoService.getResumoInscricoes,
  getClassificacaoModalidade: classificacaoService.getClassificacaoModalidade,
  sincronizarClassificacaoGruposModalidade: classificacaoService.sincronizarClassificacaoGruposModalidade
};
