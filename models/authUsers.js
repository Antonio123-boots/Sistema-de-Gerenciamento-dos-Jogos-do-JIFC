const { listarCampi, senhaPadraoCampus } = require('./campiCatalog');

const usuariosBase = {
  'admin@ifc.edu.br': {
    senha: 'admin123',
    tipo: 'admin',
    nome: 'Administrador Principal',
    email: 'admin@ifc.edu.br',
    perfil: 'Administrador'
  },
  'instituicao@ifc.edu.br': {
    senha: 'instituicao123',
    tipo: 'campus',
    nome: 'Instituição Participante',
    email: 'instituicao@ifc.edu.br',
    perfil: 'Instituição'
  },
  'juiz@ifc.edu.br': {
    senha: 'juiz123',
    tipo: 'juiz',
    nome: 'Juiz / Mesário',
    email: 'juiz@ifc.edu.br',
    perfil: 'Juiz'
  }
};

listarCampi().forEach((campus) => {
  usuariosBase[campus.email] = {
    senha: senhaPadraoCampus,
    tipo: 'campus',
    nome: campus.nome,
    email: campus.email,
    perfil: 'Campus',
    campusSlug: campus.slug,
    nomeExibicao: campus.nomeExibicao,
    logoTexto: campus.logoTexto,
    cor: campus.cor
  };
});

function obterUsuarioPorEmail(email) {
  return usuariosBase[String(email || '').trim().toLowerCase()] || null;
}

function construirSessaoUsuario(email) {
  const usuario = obterUsuarioPorEmail(email);

  if (!usuario) {
    return null;
  }

  return {
    id: usuario.email,
    nome: usuario.nome,
    email: usuario.email,
    tipo: usuario.tipo,
    perfil: usuario.perfil,
    campusSlug: usuario.campusSlug || null,
    nomeExibicao: usuario.nomeExibicao || null,
    logoTexto: usuario.logoTexto || null,
    cor: usuario.cor || null
  };
}

module.exports = {
  usuariosBase,
  obterUsuarioPorEmail,
  construirSessaoUsuario,
  senhaPadraoCampus
};