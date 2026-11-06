const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const DIRETORIO_PRIVADO = path.resolve(__dirname, '..', 'data', 'private', 'substituicoes');
const FORMATOS = [
  { extensao: 'pdf', tipo: 'application/pdf', assinatura: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-' },
  { extensao: 'jpg', tipo: 'image/jpeg', assinatura: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { extensao: 'png', tipo: 'image/png', assinatura: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }
];

function identificarFormato(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return FORMATOS.find((formato) => formato.assinatura(buffer)) || null;
}

async function armazenarDocumento(buffer) {
  const formato = identificarFormato(buffer);
  if (!formato) {
    const erro = new Error('O comprovante deve ser um arquivo PDF, JPG ou PNG válido.');
    erro.code = 'DOCUMENTO_SUBSTITUICAO_INVALIDO';
    throw erro;
  }

  await fs.mkdir(DIRETORIO_PRIVADO, { recursive: true });
  const nomeArquivo = `${randomUUID()}.${formato.extensao}`;
  await fs.writeFile(path.join(DIRETORIO_PRIVADO, nomeArquivo), buffer, { flag: 'wx', mode: 0o600 });
  return nomeArquivo;
}

function resolverDocumento(nomeArquivo) {
  if (typeof nomeArquivo !== 'string' || !/^[a-f0-9-]{36}\.(pdf|jpg|png)$/i.test(nomeArquivo)) {
    return null;
  }
  return path.join(DIRETORIO_PRIVADO, nomeArquivo);
}

function obterTipoConteudo(nomeArquivo) {
  const formato = FORMATOS.find((item) => nomeArquivo.endsWith(`.${item.extensao}`));
  return formato ? formato.tipo : 'application/octet-stream';
}

async function removerDocumento(nomeArquivo) {
  const caminho = resolverDocumento(nomeArquivo);
  if (!caminho) return;
  try {
    await fs.unlink(caminho);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  armazenarDocumento,
  identificarFormato,
  resolverDocumento,
  obterTipoConteudo,
  removerDocumento
};