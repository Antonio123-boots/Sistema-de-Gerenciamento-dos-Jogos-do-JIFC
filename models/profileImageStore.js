const fs = require('fs');
const path = require('path');

const fotoPadrao = '/imagens/avatar.svg';
const pastaUploads = path.join(__dirname, '..', 'public', 'uploads', 'perfil');
const pastaUploadsModalidades = path.join(__dirname, '..', 'public', 'uploads', 'modalidades');
const extensoesPorMime = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif'
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

function normalizarFotoPerfil(valor) {
  const valorTexto = String(valor || '').trim();

  if (!valorTexto) {
    return fotoPadrao;
  }

  if (!valorTexto.startsWith('data:')) {
    return valorTexto;
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/i.exec(valorTexto);
  if (!match) {
    return valorTexto;
  }

  const mime = String(match[1]).toLowerCase();
  const base64 = String(match[2] || '').replace(/\s+/g, '');
  const extensao = extensoesPorMime[mime] || 'png';
  const identificador = normalizarIdentificador(`perfil-${Date.now()}`);
  const nomeArquivo = `${identificador}-${Date.now()}.${extensao}`;

  fs.mkdirSync(pastaUploads, { recursive: true });
  fs.writeFileSync(path.join(pastaUploads, nomeArquivo), Buffer.from(base64, 'base64'));

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

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/i.exec(valorTexto);
  if (!match) {
    return valorTexto;
  }

  const mime = String(match[1]).toLowerCase();
  const base64 = String(match[2] || '').replace(/\s+/g, '');
  const extensao = extensoesPorMime[mime] || 'png';
  const identificador = normalizarIdentificador(`${prefixo}-${Date.now()}`);
  const nomeArquivo = `${identificador}-${Date.now()}.${extensao}`;

  const destino = path.join(__dirname, '..', 'public', 'uploads', prefixo === 'perfil' ? 'perfil' : 'modalidades');
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, nomeArquivo), Buffer.from(base64, 'base64'));

  return `/uploads/${prefixo === 'perfil' ? 'perfil' : 'modalidades'}/${nomeArquivo}`;
}

module.exports = {
  fotoPadrao,
  normalizarFotoPerfil,
  normalizarImagemUpload
};
