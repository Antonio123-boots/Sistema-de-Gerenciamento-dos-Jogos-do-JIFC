const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fotoPadrao = '/imagens/avatar.svg';
const pastaUploads = path.join(__dirname, '..', 'public', 'uploads', 'perfil');
const pastaUploadsModalidades = path.join(__dirname, '..', 'public', 'uploads', 'modalidades');
const extensoesPorMime = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp'
};

const ASSINATURAS_IMAGEM = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/jpg': (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/png': (b) => b.length > 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
    b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A,
  'image/gif': (b) => b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  'image/webp': (b) => b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'image/bmp': (b) => b.length > 2 && b[0] === 0x42 && b[1] === 0x4D
};

function normalizarIdentificador(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'perfil';
}

function decodificarBase64(valorTexto) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/i.exec(valorTexto);
  if (!match) {
    return null;
  }

  const mime = String(match[1]).toLowerCase();
  const base64 = String(match[2] || '').replace(/\s+/g, '');
  if (!base64) {
    return null;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (_) {
    return null;
  }

  if (!buffer.length) {
    return null;
  }

  return { mime, buffer };
}

function validarImagemBase64(mime, buffer) {
  if (!extensoesPorMime[mime]) {
    return 'Formato de imagem não permitido. Use JPG, PNG, GIF, WebP ou BMP.';
  }

  const validaBytes = ASSINATURAS_IMAGEM[mime];
  if (!validaBytes || !validaBytes(buffer)) {
    return 'O arquivo enviado não é uma imagem válida.';
  }

  return null;
}

function gravarImagemBase64({ mime, buffer }, pastaDestino, prefixo) {
  const extensao = extensoesPorMime[mime];
  const aleatorio = crypto.randomBytes(6).toString('hex');
  const identificador = normalizarIdentificador(`${prefixo}-${Date.now()}`);
  const nomeArquivo = `${identificador}-${aleatorio}.${extensao}`;

  fs.mkdirSync(pastaDestino, { recursive: true });
  fs.writeFileSync(path.join(pastaDestino, nomeArquivo), buffer);

  return nomeArquivo;
}

function normalizarFotoPerfil(valor) {
  const valorTexto = String(valor || '').trim();

  if (!valorTexto) {
    return fotoPadrao;
  }

  if (!valorTexto.startsWith('data:')) {
    return valorTexto;
  }

  const dados = decodificarBase64(valorTexto);
  if (!dados) {
    return valorTexto;
  }

  const erro = validarImagemBase64(dados.mime, dados.buffer);
  if (erro) {
    throw new Error(erro);
  }

  const nomeArquivo = gravarImagemBase64(dados, pastaUploads, 'perfil');
  return `/uploads/perfil/${nomeArquivo}`;
}

function normalizarImagemUpload(valor, pastaDestino = pastaUploadsModalidades, prefixo = 'imagem') {
  const valorTexto = String(valor || '').trim();
  if (!valorTexto) {
    return '';
  }

  if (!valorTexto.startsWith('data:')) {
    return valorTexto;
  }

  const dados = decodificarBase64(valorTexto);
  if (!dados) {
    throw new Error('Imagem inválida ou corrompida.');
  }

  const erro = validarImagemBase64(dados.mime, dados.buffer);
  if (erro) {
    throw new Error(erro);
  }

  const destino = pastaDestino === pastaUploads ? pastaUploads : pastaUploadsModalidades;
  const nomeArquivo = gravarImagemBase64(dados, destino, prefixo);
  const subpasta = prefixo === 'perfil' ? 'perfil' : 'modalidades';

  return `/uploads/${subpasta}/${nomeArquivo}`;
}

module.exports = {
  fotoPadrao,
  normalizarFotoPerfil,
  normalizarImagemUpload
};
