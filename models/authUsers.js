const argon2 = require('argon2');
const { readState, writeState } = require('./stateStore');
const { normalizarFotoPerfil, fotoPadrao } = require('./profileImageStore');
const juizService = require('../services/juizService');

const SENHAS_HARDcoded = {
  'admin@ifc.edu.br': process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
  'instituicao@ifc.edu.br': process.env.DEFAULT_CAMPUS_PASSWORD || 'jifc2026',
  'juiz@ifc.edu.br': process.env.DEFAULT_JUIZ_PASSWORD || 'juiz123'
};

let hashesBase = {};

async function initHashes() {
  for (const [email, senha] of Object.entries(SENHAS_HARDcoded)) {
    hashesBase[email] = await argon2.hash(senha);
  }
}

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
    banMotivo: String(campus.banMotivo || '').trim(),
    senhaHash: campus.senha || null
  };
}

async function obterUsuarioPorEmail(email) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const usuariosPersistidos = lerUsuariosPersistidos();

  if (hashesBase[emailNormalizado]) {
    const dadosBase = {
      ...obterDadosBase(emailNormalizado),
      email: emailNormalizado,
      senhaHash: hashesBase[emailNormalizado],
      ...(usuariosPersistidos[emailNormalizado] || {})
    };

    if (dadosBase.tipo === 'juiz' && !dadosBase.juizId) {
      const juizRow = await juizService.buscarJuizPorEmail(emailNormalizado);
      if (juizRow) {
        dadosBase.juizId = juizRow.id;
      } else {
        const novoId = await juizService.cadastrarJuiz({
          nome: dadosBase.nome,
          email: emailNormalizado,
          senha: SENHAS_HARDcoded[emailNormalizado],
          esportes: []
        });
        dadosBase.juizId = novoId;
      }
    }

    return dadosBase;
  }

  const juizRow = await juizService.buscarJuizPorEmail(emailNormalizado);
  if (juizRow) {
    return {
      tipo: 'juiz',
      nome: juizRow.nome,
      email: juizRow.email,
      perfil: 'Juiz',
      fotoPerfil: normalizarFotoPerfil(juizRow.foto_perfil || fotoPadrao),
      senhaHash: juizRow.senha,
      juizId: juizRow.id,
      ...(usuariosPersistidos[emailNormalizado] || {})
    };
  }

  const campi = await listarCampi();
  const campus = campi.find((campusItem) => campusItem.email === emailNormalizado);
  if (campus) {
    return { ...prepararUsuarioCampus(campus), ...(usuariosPersistidos[emailNormalizado] || {}) };
  }
  return null;
}

function obterDadosBase(email) {
  const dados = {
    'admin@ifc.edu.br': { tipo: 'admin', nome: 'Administrador Principal', perfil: 'Administrador', fotoPerfil: '/imagens/avatar.svg' },
    'instituicao@ifc.edu.br': { tipo: 'campus', nome: 'Instituição Participante', perfil: 'Instituição', fotoPerfil: '/imagens/avatar.svg' },
    'juiz@ifc.edu.br': { tipo: 'juiz', nome: 'Juiz / Mesário', perfil: 'Juiz', fotoPerfil: '/imagens/avatar.svg' }
  };
  return dados[email] || {};
}

async function verificarSenha(usuario, senhaInformada) {
  if (!usuario || !usuario.senhaHash) return false;

  const hash = usuario.senhaHash;

  if (hash.startsWith('$argon2')) {
    return argon2.verify(hash, senhaInformada);
  }

  console.error('[SEGURANCIA] Senha em plaintext detectada para ' + usuario.email + '. Autenticacao recusada. Rode o script de migracao de senha.');
  return false;
}

function construirPayloadJWT(usuario) {
  return {
    email: usuario.email,
    tipo: usuario.tipo,
    nome: usuario.nome,
    perfil: usuario.perfil,
    juizId: usuario.juizId || null,
    campusSlug: usuario.campusSlug || null,
    nomeExibicao: usuario.nomeExibicao || null,
    logoTexto: usuario.logoTexto || null,
    cor: usuario.cor || null,
    fotoPerfil: usuario.fotoPerfil || fotoPadrao
  };
}

module.exports = {
  initHashes,
  obterUsuarioPorEmail,
  verificarSenha,
  construirPayloadJWT,
  salvarFotoPerfilUsuario
};
