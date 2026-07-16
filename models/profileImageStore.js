const fs = require('fs');
const path = require('path');

const fotoPadrao = '/imagens/avatar.svg';
const pastaUploads = path.join(__dirname, '..', 'public', 'uploads', 'perfil');
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

module.exports = {
  fotoPadrao,
  normalizarFotoPerfil
};
