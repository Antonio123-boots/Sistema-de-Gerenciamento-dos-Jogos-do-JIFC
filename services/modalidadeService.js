const db = require('../config/db');
const { inferirGeneroModalidade, inferirTipoConfrontoModalidade, inferirFormatoDisputaModalidade } = require('../utils/modalidadeHelpers');
const { registrarRegrasModalidade, limparCacheRegrasModalidade } = require('../utils/sportClassificationRules');

let possuiColunaIcone = null;
let possuiColunaRegras = null;

async function verificarColunaRegrasModalidades() {
  if (typeof possuiColunaRegras === 'boolean') {
    return possuiColunaRegras;
  }

  try {
    const [colunas] = await db.query("SHOW COLUMNS FROM modalidades LIKE 'regras_json'");
    possuiColunaRegras = Array.isArray(colunas) && colunas.length > 0;
  } catch (error) {
    possuiColunaRegras = false;
  }

  return possuiColunaRegras;
}

async function verificarColunaIconeModalidades() {
  if (typeof possuiColunaIcone === 'boolean') {
    return possuiColunaIcone;
  }

  try {
    const [colunas] = await db.query("SHOW COLUMNS FROM modalidades LIKE 'icone'");
    possuiColunaIcone = Array.isArray(colunas) && colunas.length > 0;
  } catch (error) {
    possuiColunaIcone = false;
  }

  return possuiColunaIcone;
}

function obterImagemPadraoModalidade(nome = '') {
  const norm = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('futsal')) return '/imagens/futsal1.svg';
  if (norm.includes('volei de praia') || norm.includes('areia') || (norm.includes('volei') && norm.includes('praia'))) return '/imagens/areia1.svg';
  if (norm.includes('volei')) return '/imagens/volei1.svg';
  if (norm.includes('basquete') || norm.includes('basquetebol')) return '/imagens/basquete1.svg';
  if (norm.includes('handebol')) return '/imagens/handebol1.svg';
  if (norm.includes('atletismo')) return '/imagens/atletismo1.svg';
  if (norm.includes('tenis de mesa') || norm.includes(' tenis') || norm.includes('tenis')) return '/imagens/tenisdemesa1.svg';
  if (norm.includes('xadrez')) return '/imagens/xadrez1.svg';
  if (norm.includes('badminton') || norm.includes('badmintom')) return '/imagens/badminton.png';
  return '/imagens/atletismo1.svg';
}

async function getModalidadesBanco() {
  try {
    const temIcone = await verificarColunaIconeModalidades();
    const query = temIcone
      ? `SELECT id, nome, genero, tipo_confronto, formato_disputa, icone, limite_inscritos
         FROM modalidades
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`
      : `SELECT id, nome, genero, tipo_confronto, formato_disputa, limite_inscritos
         FROM modalidades
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`;

    const [linhas] = await db.query(query);
    return linhas.map((item) => ({
      ...item,
      icone: item.icone || null,
      imagem: item.icone || obterImagemPadraoModalidade(item.nome),
      limite_inscritos: item.limite_inscritos === null || item.limite_inscritos === undefined ? null : Number(item.limite_inscritos)
    }));
  } catch (error) {
    throw error;
  }
}

async function listarModalidadesConfiguracao() {
  try {
    const temIcone = await verificarColunaIconeModalidades();
    const query = temIcone
      ? `SELECT id, nome, genero, tipo_confronto, formato_disputa, icone, limite_inscritos
         FROM modalidades
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`
      : `SELECT id, nome, genero, tipo_confronto, formato_disputa, limite_inscritos
         FROM modalidades
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`;

    const [linhas] = await db.query(query);
    return linhas.map((item) => ({
      ...item,
      icone: item.icone || null,
      imagem: item.icone || obterImagemPadraoModalidade(item.nome),
      limite_inscritos: item.limite_inscritos === null || item.limite_inscritos === undefined ? null : Number(item.limite_inscritos)
    }));
  } catch (error) {
    throw error;
  }
}

async function adicionarModalidade({ nome, tipoConfronto = '', formatoDisputa = '', genero = '', icone = null, limiteInscritos = null, regras = null }) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) {
    throw new Error('Informe o nome da modalidade esportiva.');
  }

  const generoInformado = String(genero || '').trim();
  if (generoInformado && !['Masculino', 'Feminino', 'Misto'].includes(generoInformado)) {
    throw new Error('Gênero inválido. Utilize Masculino, Feminino ou Misto.');
  }

  const nomeNormalizado = nomeLimpo
    .replace(/^Tênis$/i, 'Tênis de Mesa')
    .replace(/^Basquetebol$/i, 'Basquete')
    .replace(/^Voleibol$/i, 'Vôlei')
    .trim();

  const generoFinal = inferirGeneroModalidade(nomeNormalizado, generoInformado);
  const tipo = inferirTipoConfrontoModalidade(nomeNormalizado, tipoConfronto);
  const formato = inferirFormatoDisputaModalidade(nomeNormalizado, formatoDisputa);

  const [existente] = await db.query('SELECT id FROM modalidades WHERE nome = ? AND genero = ?', [nomeNormalizado, generoFinal]);
  if (!existente.length) {
    const temIcone = await verificarColunaIconeModalidades();
    let limite = null;
    if (limiteInscritos !== null && limiteInscritos !== undefined && limiteInscritos !== '') {
      const num = Number(limiteInscritos);
      if (Number.isFinite(num) && num > 0) {
        limite = Math.floor(num);
      } else if (Number.isFinite(num) && num <= 0) {
        limite = null;
      }
    }
    const temRegras = await verificarColunaRegrasModalidades();
    const colunas = ['nome', 'genero', 'tipo_confronto', 'formato_disputa'];
    const valores = [nomeNormalizado, generoFinal, tipo, formato];

    if (temIcone) {
      colunas.push('icone');
      valores.push(icone || null);
    }
    if (temRegras) {
      colunas.push('regras_json');
      valores.push(regras ? JSON.stringify(regras) : null);
    }
    colunas.push('limite_inscritos');
    valores.push(limite);

    const placeholders = colunas.map(() => '?').join(', ');
    const [resultado] = await db.query(
      `INSERT INTO modalidades (${colunas.join(', ')}) VALUES (${placeholders})`,
      valores
    );

    registrarRegrasModalidade(resultado.insertId, nomeNormalizado, regras);
    return [resultado.insertId];
  }

  return [];
}

async function removerModalidadePorId(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) {
    throw new Error('ID da modalidade inválido.');
  }

  const [modalidade] = await db.query('SELECT id, nome FROM modalidades WHERE id = ?', [id]);
  if (!modalidade.length) {
    throw new Error('Modalidade não encontrada.');
  }

  await db.query('DELETE FROM modalidades WHERE id = ?', [id]);
  limparCacheRegrasModalidade(id, modalidade[0].nome);
  return modalidade[0];
}

function isModalidadeSorteavel(nome, tipoConfronto = '', subCategoria = '') {
  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();

  if (!nomeNormalizado) {
    return false;
  }

  if (/(sem sorteio|nao sorteavel|desativado)/i.test(nomeNormalizado)) {
    return false;
  }

  if (/atletismo/i.test(nomeNormalizado) || /xadrez/i.test(nomeNormalizado)) {
    return false;
  }

  if (subCategoriaNormalizada === 'dupla' && /tenis de mesa|tenis/i.test(nomeNormalizado)) {
    return true;
  }

  return true;
}

function isModalidadeTenisMesa(nome = '') {
  const nomeNormalizado = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return /tenis de mesa|tenis/i.test(nomeNormalizado);
}

module.exports = {
  verificarColunaIconeModalidades,
  obterImagemPadraoModalidade,
  getModalidadesBanco,
  listarModalidadesConfiguracao,
  adicionarModalidade,
  removerModalidadePorId,
  isModalidadeSorteavel,
  isModalidadeTenisMesa
};
