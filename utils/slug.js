function gerarSlug(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
}

function gerarSlugModalidade(nome = '', genero = '') {
  return gerarSlug(`${nome} ${genero}`);
}

module.exports = { gerarSlug, gerarSlugModalidade };
