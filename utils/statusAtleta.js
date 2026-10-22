/*
 * Status de análise do atleta (tabela `atletas.status`).
 * O laudo do admin é o que libera o atleta para o sorteio: somente atletas
 * com status "Regular" entram nas chaves.
 */
const STATUS_ANALISE = {
  PENDENTE: 'Analise',
  APROVADO: 'Regular',
  REPROVADO: 'Reprovado'
};

/* Status que habilita o atleta a participar do sorteio. */
const STATUS_ATLETA_APROVADO = STATUS_ANALISE.APROVADO;

module.exports = {
  STATUS_ANALISE,
  STATUS_ATLETA_APROVADO
};
