const crypto = require('crypto');
const db = require('../config/db');

const equipes = [
  ['Basquete', 'Masculino', 9], ['Basquete', 'Feminino', 8],
  ['Futsal', 'Masculino', 17], ['Futsal', 'Feminino', 12],
  ['Handebol', 'Masculino', 9], ['Handebol', 'Feminino', 6],
  ['Vôlei', 'Masculino', 14], ['Vôlei', 'Feminino', 15],
  ['Vôlei de Praia', 'Masculino', 14], ['Vôlei de Praia', 'Feminino', 12],
  ['Tênis de Mesa', 'Masculino', 9], ['Tênis de Mesa', 'Feminino', 5]
];

function embaralhar(lista) {
  const resultado = [...lista];
  for (let indice = resultado.length - 1; indice > 0; indice -= 1) {
    const troca = crypto.randomInt(indice + 1);
    [resultado[indice], resultado[troca]] = [resultado[troca], resultado[indice]];
  }
  return resultado;
}

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function localizarModalidade(nome, genero) {
  const [linhas] = await db.query('SELECT id, nome, genero FROM modalidades WHERE genero = ?', [genero]);
  const procurado = normalizar(nome);
  const candidatas = linhas.filter((item) => {
    const atual = normalizar(item.nome).replace(/\s+(masculino|feminino)$/i, '');
    return atual === procurado;
  });
  if (!candidatas.length) throw new Error(`Modalidade não encontrada: ${nome} ${genero}`);
  const [jogos] = await db.query('SELECT modalidade_id, COUNT(*) AS total FROM jogos WHERE modalidade_id IN (?) GROUP BY modalidade_id', [candidatas.map((item) => item.id)]);
  const contagem = new Map(jogos.map((item) => [Number(item.modalidade_id), Number(item.total)]));
  return candidatas.sort((a, b) => (contagem.get(b.id) || 0) - (contagem.get(a.id) || 0) || a.id - b.id)[0];
}

async function configurarEquipes(nome, genero, quantidade) {
  const modalidade = await localizarModalidade(nome, genero);
  const [campi] = await db.query('SELECT id FROM campus ORDER BY id');
  if (quantidade > campi.length) throw new Error(`${nome} ${genero} exige ${quantidade} campi, mas só existem ${campi.length}.`);
  await db.query('DELETE FROM campus_modalidade WHERE modalidade_id = ?', [modalidade.id]);
  const selecionados = embaralhar(campi).slice(0, quantidade);
  for (const campus of selecionados) {
    await db.query('INSERT INTO campus_modalidade (campus_id, modalidade_id) VALUES (?, ?)', [campus.id, modalidade.id]);
  }
  console.log(`${nome} ${genero}: ${selecionados.length} equipes (modalidade ${modalidade.id})`);
}

async function obterOuCriarAtleta(genero, indice, campusId) {
  const prefixo = genero === 'Masculino' ? 'M' : 'F';
  const matricula = `TM-IND-${prefixo}-${String(indice).padStart(3, '0')}`;
  const cpf = `8${prefixo === 'M' ? '1' : '2'}${String(indice).padStart(9, '0')}`;
  const [existente] = await db.query('SELECT id FROM atletas WHERE matricula = ? OR cpf = ?', [matricula, cpf]);
  if (existente.length) return existente[0].id;
  const [resultado] = await db.query(
    'INSERT INTO atletas (campus_id, nome, cpf, matricula, genero, data_nascimento) VALUES (?, ?, ?, ?, ?, ?)',
    [campusId, `Tenista de Mesa ${prefixo} ${indice}`, cpf, matricula, genero, '2006-01-01']
  );
  return resultado.insertId;
}

async function configurarIndividualTenis(genero, quantidade) {
  const modalidade = await localizarModalidade('Tênis de Mesa', genero);
  const [campi] = await db.query('SELECT id FROM campus ORDER BY id');
  await db.query('DELETE FROM atleta_modalidade WHERE modalidade_id = ?', [modalidade.id]);
  for (let indice = 1; indice <= quantidade; indice += 1) {
    const atletaId = await obterOuCriarAtleta(genero, indice, campi[(indice - 1) % campi.length].id);
    await db.query('INSERT INTO atleta_modalidade (atleta_id, modalidade_id) VALUES (?, ?)', [atletaId, modalidade.id]);
  }
  console.log(`Tênis de Mesa individual ${genero}: ${quantidade} atletas (modalidade ${modalidade.id})`);
}

(async () => {
  for (const [nome, genero, quantidade] of equipes) {
    await configurarEquipes(nome, genero, quantidade);
  }
  await configurarIndividualTenis('Masculino', 32);
  await configurarIndividualTenis('Feminino', 26);
  console.log('inscricoes-teste-ok: jogos, chaves, sorteios e resultados não foram alterados');
  process.exit(0);
})().catch((error) => {
  console.error('ERRO:', error.message);
  process.exit(1);
});