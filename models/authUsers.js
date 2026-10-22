const argon2 = require('argon2');
const { readState, writeState } = require('./stateStore');
const { normalizarFotoPerfil, fotoPadrao } = require('./profileImageStore');
const { listarCampi } = require('./campiCatalog');
const juizService = require('../services/juizService');

function senhaDoAmbiente(nomeVar) {
  const valor = process.env[nomeVar];
  return valor && String(valor).trim() ? String(valor) : null;
}

const SENHAS_PADRAO = {
  'admin@ifc.edu.br': senhaDoAmbiente('DEFAULT_ADMIN_PASSWORD'),
  'instituicao@ifc.edu.br': senhaDoAmbiente('DEFAULT_CAMPUS_PASSWORD'),
  'juiz@ifc.edu.br': senhaDoAmbiente('DEFAULT_JUIZ_PASSWORD')
};

let hashesBase = {};

async function initHashes() {
  for (const [email, senha] of Object.entries(SENHAS_PADRAO)) {
    if (!senha) {
      const variaveis = {
        'admin@ifc.edu.br': 'DEFAULT_ADMIN_PASSWORD',
        'instituicao@ifc.edu.br': 'DEFAULT_CAMPUS_PASSWORD',
        'juiz@ifc.edu.br': 'DEFAULT_JUIZ_PASSWORD'
      };
      throw new Error(`Variável de ambiente ${variaveis[email] || 'desconhecida'} não configurada no .env (necessária para o usuário ${email}).`);
    }
    hashesBase[email] = await argon2.hash(senha);
  }
}

function lerUsuariosPersistidos() {
  const estado = readState();
  return estado.usuarios || {};
}

/*
 * Campos que o state store pode sobrescrever em um usuario.
 * `tipo`, `senhaHash`, `juizId` e `campusSlug` ficam de FORA: permitir que um
 * arquivo de estado (ou um script) sobrescreva o papel do usuario permitiria
 * escalar um campus para admin.
 */
const CAMPOS_PERSISTIDOS_PERMITIDOS = ['fotoPerfil', 'nomeExibicao', 'logoTexto', 'cor'];

function aplicarDadosPersistidos(base, persistidos) {
  if (!persistidos || typeof persistidos !== 'object') return base;

  const resultado = { ...base };
  for (const campo of CAMPOS_PERSISTIDOS_PERMITIDOS) {
    if (persistidos[campo] !== undefined && persistidos[campo] !== null) {
      resultado[campo] = persistidos[campo];
    }
  }
  return resultado;
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

function salvarNomeExibicaoUsuario(email, nomeExibicao) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const nomeNormalizado = String(nomeExibicao || '').trim();

  if (!emailNormalizado) {
    return null;
  }

  if (!nomeNormalizado || nomeNormalizado.length > 100) {
    const erro = new Error('Informe um nome de exibição com até 100 caracteres.');
    erro.code = 'NOME_EXIBICAO_INVALIDO';
    throw erro;
  }

  const estadoAtual = readState();
  estadoAtual.usuarios = {
    ...(estadoAtual.usuarios || {}),
    [emailNormalizado]: {
      ...(estadoAtual.usuarios?.[emailNormalizado] || {}),
      nomeExibicao: nomeNormalizado
    }
  };

  writeState(estadoAtual);
  return nomeNormalizado;
}

function prepararUsuarioCampus(campus) {
  return {
    tipo: 'campus',
    nome: campus.nome,
    email: campus.email,
    perfil: 'Campus',
    campusSlug: campus.slug,
    nomeExibicao: campus.nomeExibicao,
    cidade: campus.cidade,
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
    const dadosBase = aplicarDadosPersistidos({
      ...obterDadosBase(emailNormalizado),
      email: emailNormalizado,
      senhaHash: hashesBase[emailNormalizado]
    }, usuariosPersistidos[emailNormalizado]);

    // Senha trocada pelo usuario tem precedencia sobre a senha do .env.
    const senhaPersistida = usuariosPersistidos[emailNormalizado]?.senhaHash;
    if (senhaPersistida && String(senhaPersistida).startsWith('$argon2')) {
      dadosBase.senhaHash = senhaPersistida;
    }

    if (dadosBase.tipo === 'juiz' && !dadosBase.juizId) {
      const juizRow = await juizService.buscarJuizPorEmail(emailNormalizado);
      if (juizRow) {
        dadosBase.juizId = juizRow.id;
      } else {
        const novoId = await juizService.cadastrarJuiz({
          nome: dadosBase.nome,
          email: emailNormalizado,
          senha: SENHAS_PADRAO[emailNormalizado],
          esportes: []
        });
        dadosBase.juizId = novoId;
      }
    }

    return dadosBase;
  }

  const juizRow = await juizService.buscarJuizPorEmail(emailNormalizado);
  if (juizRow) {
    return aplicarDadosPersistidos({
      tipo: 'juiz',
      nome: juizRow.nome,
      email: juizRow.email,
      perfil: 'Juiz',
      fotoPerfil: normalizarFotoPerfil(juizRow.foto_perfil || fotoPadrao),
      senhaHash: juizRow.senha,
      juizId: juizRow.id
    }, usuariosPersistidos[emailNormalizado]);
  }

  const campi = await listarCampi();
  const campus = campi.find((campusItem) => campusItem.email === emailNormalizado);
  if (campus) {
    return aplicarDadosPersistidos(prepararUsuarioCampus(campus), usuariosPersistidos[emailNormalizado]);
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

/*
 * Troca de senha do proprio usuario.
 * - Admin (e demais contas base): a senha é sobreposta e persistida no state
 *   store, passando a ter precedencia sobre a senha do .env.
 * - Campus/Juiz: a senha é gravada no MySQL (tabela campus / juizes).
 */
async function alterarSenhaUsuario(email, senhaAtual, novaSenha) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const usuario = await obterUsuarioPorEmail(emailNormalizado);

  if (!usuario) {
    const erro = new Error('Usuário não encontrado.');
    erro.code = 'USUARIO_NAO_ENCONTRADO';
    throw erro;
  }

  if (!(await verificarSenha(usuario, senhaAtual))) {
    const erro = new Error('Senha atual incorreta.');
    erro.code = 'SENHA_ATUAL_INVALIDA';
    throw erro;
  }

  const senhaNova = String(novaSenha || '');
  if (senhaNova.length < 8) {
    const erro = new Error('A nova senha deve ter no mínimo 8 caracteres.');
    erro.code = 'SENHA_MUITO_CURTA';
    throw erro;
  }

  const senhaHash = await argon2.hash(senhaNova);

  if (hashesBase[emailNormalizado]) {
    const estadoAtual = readState();
    estadoAtual.usuarios = {
      ...(estadoAtual.usuarios || {}),
      [emailNormalizado]: {
        ...(estadoAtual.usuarios?.[emailNormalizado] || {}),
        senhaHash
      }
    };
    writeState(estadoAtual);
    return { ok: true };
  }

  if (usuario.tipo === 'juiz' && usuario.juizId) {
    await juizService.atualizarSenhaJuiz(usuario.juizId, senhaHash);
    return { ok: true };
  }

  const campus = await listarCampi().then((lista) => lista.find((item) => item.email === emailNormalizado));
  if (campus) {
    await require('./campiCatalog').atualizarSenhaCampus(campus.id, senhaHash);
    return { ok: true };
  }

  const erro = new Error('Não foi possível localizar o cadastro do usuário.');
  erro.code = 'CADASTRO_NAO_LOCALIZADO';
  throw erro;
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
    cidade: usuario.cidade || null,
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
  salvarFotoPerfilUsuario,
  salvarNomeExibicaoUsuario,
  alterarSenhaUsuario
};
