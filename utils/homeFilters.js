function filtrarModalidadesParaHome(modalidades, filtros = {}) {
  const modalidadeSelecionada = String(filtros.modalidade || '').trim();
  const diaSelecionado = String(filtros.dia || '').trim();
  const generoSelecionado = String(filtros.genero || '').trim();

  return modalidades.filter((modalidade) => {
    const modalidadeBase = String(modalidade.slug || modalidade.slugBase || modalidade.nome || '').trim();
    const modalidadeBaseNormalizada = modalidadeBase.toLowerCase().replace(/-(masculino|feminino)$/i, '');
    const modalidadeSelecionadaBase = modalidadeSelecionada.toLowerCase().replace(/-(masculino|feminino)$/i, '');
    const atendeModalidade = !modalidadeSelecionada || modalidade.slug === modalidadeSelecionada || modalidadeBaseNormalizada === modalidadeSelecionadaBase;
    const atendeDia = !diaSelecionado || String(modalidade.dia || '') === diaSelecionado;
    const atendeGenero = !generoSelecionado || String(modalidade.genero || '').toLowerCase() === generoSelecionado.toLowerCase();
    return atendeModalidade && atendeDia && atendeGenero;
  });
}

module.exports = {
  filtrarModalidadesParaHome
};
