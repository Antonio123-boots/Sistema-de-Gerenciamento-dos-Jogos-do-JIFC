function filtrarModalidadesParaHome(modalidades, filtros = {}) {
  const modalidadeSelecionada = String(filtros.modalidade || '').trim();
  const diaSelecionado = String(filtros.dia || '').trim();

  return modalidades.filter((modalidade) => {
    const atendeModalidade = !modalidadeSelecionada || modalidade.slug === modalidadeSelecionada;
    const atendeDia = !diaSelecionado || String(modalidade.dia || '') === diaSelecionado;
    return atendeModalidade && atendeDia;
  });
}

module.exports = {
  filtrarModalidadesParaHome
};
