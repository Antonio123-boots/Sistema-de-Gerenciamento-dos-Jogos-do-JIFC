function estaNoPrazo(inicio, fim, hojeStr) {
  return Boolean(inicio && fim && hojeStr >= inicio && hojeStr <= fim);
}

function obterStatusPrazos(configuracoes = {}, hojeStr = '') {
  const inicioModalidades = configuracoes.inicio_inscricao_modalidades;
  const fimModalidades = configuracoes.fim_inscricao_modalidades;
  const inicioAtletas = configuracoes.inicio_inscricao_atletas;
  const fimAtletas = configuracoes.fim_inscricao_atletas;
  const inicioSorteio = configuracoes.inicio_sorteio_chaves;
  const fimSorteio = configuracoes.fim_sorteio_chaves;

  const prazoModalidadesAberto = estaNoPrazo(inicioModalidades, fimModalidades, hojeStr);
  const prazoAtletasAberto = estaNoPrazo(inicioAtletas, fimAtletas, hojeStr);
  const inscricoesConfiguradas = Boolean(inicioModalidades && fimModalidades && inicioAtletas && fimAtletas);
  const inscricoesAbertas = inscricoesConfiguradas && (prazoModalidadesAberto || prazoAtletasAberto);
  const inscricoesEncerradas = inscricoesConfiguradas && hojeStr >= fimModalidades && hojeStr >= fimAtletas;
  const sorteioDisponivelPorData = (!inicioSorteio || hojeStr >= inicioSorteio) && (!fimSorteio || hojeStr <= fimSorteio);
  const prazoSorteioAberto = Boolean(inscricoesEncerradas && sorteioDisponivelPorData);
  const sorteioBloqueado = inscricoesAbertas || !prazoSorteioAberto;
  const resumoDisponivel = inscricoesConfiguradas;

  return {
    prazoModalidadesAberto,
    prazoAtletasAberto,
    inscricoesConfiguradas,
    inscricoesAbertas,
    inscricoesEncerradas,
    sorteioDisponivelPorData,
    prazoSorteioAberto,
    sorteioBloqueado,
    resumoDisponivel
  };
}

module.exports = { estaNoPrazo, obterStatusPrazos };