const senhaPadraoCampus = 'jifc2026';

const campi = [
  { slug: 'abelardo-luz', nome: 'IFC Abelardo Luz', nomeExibicao: 'Abelardo Luz', cor: '#00bcd4' },
  { slug: 'araquari', nome: 'IFC Araquari', nomeExibicao: 'Araquari', cor: '#2ecc71' },
  { slug: 'blumenau', nome: 'IFC Blumenau', nomeExibicao: 'Blumenau', cor: '#f39c12' },
  { slug: 'brusque', nome: 'IFC Brusque', nomeExibicao: 'Brusque', cor: '#9b59b6' },
  { slug: 'camboriu', nome: 'IFC Camboriú', nomeExibicao: 'Camboriú', cor: '#e67e22' },
  { slug: 'concordia', nome: 'IFC Concórdia', nomeExibicao: 'Concórdia', cor: '#1abc9c' },
  { slug: 'fraiburgo', nome: 'IFC Fraiburgo', nomeExibicao: 'Fraiburgo', cor: '#3498db' },
  { slug: 'ibirama', nome: 'IFC Ibirama', nomeExibicao: 'Ibirama', cor: '#e74c3c' },
  { slug: 'luzerna', nome: 'IFC Luzerna', nomeExibicao: 'Luzerna', cor: '#16a085' },
  { slug: 'rio-do-sul', nome: 'IFC Rio do Sul', nomeExibicao: 'Rio do Sul', cor: '#8e44ad' },
  { slug: 'santa-rosa-do-sul', nome: 'IFC Santa Rosa do Sul', nomeExibicao: 'Santa Rosa do Sul', cor: '#d35400' },
  { slug: 'sao-bento-do-sul', nome: 'IFC São Bento do Sul', nomeExibicao: 'São Bento do Sul', cor: '#2980b9' },
  { slug: 'sao-francisco-do-sul', nome: 'IFC São Francisco do Sul', nomeExibicao: 'São Francisco do Sul', cor: '#27ae60' },
  { slug: 'sombrio', nome: 'IFC Sombrio', nomeExibicao: 'Sombrio', cor: '#c0392b' },
  { slug: 'videira', nome: 'IFC Videira', nomeExibicao: 'Videira', cor: '#2c3e50' }
];

function gerarSigla(nomeExibicao) {
  return String(nomeExibicao || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => parte[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function montarCampus(campus) {
  return {
    ...campus,
    logoTexto: gerarSigla(campus.nomeExibicao),
    email: `${campus.slug}@ifc.edu.br`,
    senha: senhaPadraoCampus
  };
}

function listarCampi() {
  return campi.map(montarCampus);
}

function obterCampusPorSlug(slug) {
  return listarCampi().find((campus) => campus.slug === slug) || null;
}

function obterCampusPorEmail(email) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  return listarCampi().find((campus) => campus.email === emailNormalizado) || null;
}

function listarCredenciaisCampus() {
  return listarCampi().map((campus) => ({
    nomeExibicao: campus.nomeExibicao,
    email: campus.email,
    senha: senhaPadraoCampus
  }));
}

module.exports = {
  senhaPadraoCampus,
  listarCampi,
  obterCampusPorSlug,
  obterCampusPorEmail,
  listarCredenciaisCampus
};