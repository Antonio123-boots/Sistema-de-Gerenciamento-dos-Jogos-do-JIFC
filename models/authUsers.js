const { readState, writeState } = require('./stateStore');
const { listarCampi, senhaPadraoCampus } = require('./campiCatalog');
const { normalizarFotoPerfil, fotoPadrao } = require('./profileImageStore');

const usuariosBase = {
  'admin@ifc.edu.br': {
    senha: 'admin123',
    tipo: 'admin',
    nome: 'Administrador Principal',
    email: 'admin@ifc.edu.br',
    perfil: 'Administrador',
    fotoPerfil: '/imagens/avatar.svg'
  },
  'instituicao@ifc.edu.br': {
    senha: 'instituicao123',
    tipo: 'campus',
    nome: 'Instituição Participante',
    email: 'instituicao@ifc.edu.br',
    perfil: 'Instituição',
    fotoPerfil: '/imagens/avatar.svg'
  },
  'juiz@ifc.edu.br': {
    senha: 'juiz123',
    tipo: 'juiz',
    nome: 'Juiz / Mesário',
    email: 'juiz@ifc.edu.br',
    perfil: 'Juiz',
    fotoPerfil: '/imagens/avatar.svg'
  }
};

function lerUsuariosPersistidos() {
  const estado = readState();
  return estado.usuarios || {};
}

function salvarFotoPerfilUsuario(email, fotoPerfil) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const fotoNormalizada = normalizarFotoPerfil(fotoPerfil);

  if (!emailNormalizado) {
    return null;
  }

  const estadoAtual = readState();
  estadoAtual.usuarios = {
    ...(estadoAtual.usuarios || {}),
    [emailNormalizado]: {
      ...(estadoAtual.usuarios?.[emailNormalizado] || {}),
      fotoPerfil: fotoNormalizada
    }
  };

  writeState(estadoAtual);
  return fotoNormalizada;
}

function prepararUsuarioCampus(campus) {
  return {
    senha: campus.senha || senhaPadraoCampus,
    tipo: 'campus',
    nome: campus.nome,
    email: campus.email,
    perfil: 'Campus',
    campusSlug: campus.slug,
    nomeExibicao: campus.nomeExibicao,
    logoTexto: campus.logoTexto,
    cor: campus.cor,
    fotoPerfil: normalizarFotoPerfil(campus.fotoPerfil || campus.foto_perfil || fotoPadrao),
    banned: Boolean(campus.banned),
    banMotivo: String(campus.banMotivo || '').trim()
  };
}

async function obterUsuarioPorEmail(email) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const usuariosPersistidos = lerUsuariosPersistidos();

  if (usuariosBase[emailNormalizado]) {
    return {
      ...usuariosBase[emailNormalizado],
      ...(usuariosPersistidos[emailNormalizado] || {})
    };
  }

  const campi = await listarCampi();
  const campus = campi.find((campusItem) => campusItem.email === emailNormalizado);
  return campus ? { ...prepararUsuarioCampus(campus), ...(usuariosPersistidos[emailNormalizado] || {}) } : null;
}

async function construirSessaoUsuario(email) {
  const usuario = await obterUsuarioPorEmail(email);

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
    cor: usuario.cor || null,
    fotoPerfil: usuario.fotoPerfil || fotoPadrao
  };
}

module.exports = {
  usuariosBase,
  obterUsuarioPorEmail,
  construirSessaoUsuario,
  salvarFotoPerfilUsuario,
  senhaPadraoCampus
};