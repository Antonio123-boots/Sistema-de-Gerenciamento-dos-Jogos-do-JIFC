// Importação da conexão ativa com o banco de dados MySQL/MariaDB
const db = require('../config/db');
const { readState, writeState, cloneState } = require('./stateStore');

// Configurações padrão usadas quando ainda não existe estado persistido em disco.
const configuracoesPadrao = {
  ano_evento: 2026,
  inicio_evento: '',
  fim_evento: '',
  inicio_inscricao_modalidades: '',
  fim_inscricao_modalidades: '',
  inicio_inscricao_atletas: '',
  fim_inscricao_atletas: '',
  inicio_sorteio_chaves: '',
  fim_sorteio_chaves: '',
  limite_atletas_total_campus: 0
};

function carregarConfiguracoes() {
  const estado = readState();
  return { ...configuracoesPadrao, ...(estado.configuracoes || {}) };
}

const atletasPendentes = [];

/**
 * Retorna as configurações locais guardadas em memória.
 */
function getConfiguracoes() {
  return cloneState(carregarConfiguracoes());
}

/**
 * Atualiza e mescla as novas datas configuradas pelo administrador em memória.
 */
function salvarConfiguracoes(novosDados) {
  const estadoAtual = readState();
  const configuracoesAtuais = { ...configuracoesPadrao, ...(estadoAtual.configuracoes || {}) };
  const inicioEvento = novosDados.inicio_evento || configuracoesAtuais.inicio_evento || '';
  const anoDerivado = Number(
    novosDados.ano_evento ||
    novosDados.anoEvento ||
    (inicioEvento ? new Date(`${inicioEvento}T00:00:00`).getFullYear() : configuracoesAtuais.ano_evento)
  );

  estadoAtual.configuracoes = {
    ...configuracoesAtuais,
    ...novosDados,
    ano_evento: Number.isFinite(anoDerivado) ? anoDerivado : configuracoesAtuais.ano_evento,
    limite_atletas_total_campus: Number(
      novosDados.limite_atletas_total_campus ?? configuracoesAtuais.limite_atletas_total_campus ?? 0
    )
  };

  writeState(estadoAtual);
  return getConfiguracoes();
}

function getAnoJifc() {
  const configuracoes = getConfiguracoes();
  const anoBase = Number(configuracoes.ano_evento) || new Date().getFullYear();

  if (!configuracoes.fim_evento) {
    return anoBase;
  }

  const limiteEvento = new Date(`${configuracoes.fim_evento}T23:59:59`);
  if (Number.isNaN(limiteEvento.getTime())) {
    return anoBase;
  }

  return new Date() > limiteEvento ? anoBase + 1 : anoBase;
}

/**
 * Retorna a lista de atletas pendentes em memória (contingência).
 */
function getAtletasPendentes() {
  return atletasPendentes.map((item) => ({ ...item }));
}

/**
 * Valida o status técnico/médico de um competidor local para 'Regular'.
 */
function validarAtleta(atletaId) {
  const atleta = atletasPendentes.find((item) => item.id === Number(atletaId));
  if (atleta) atleta.status = 'Regular';
  return atleta;
}

/**
 * FUNÇÃO DE COMPATIBILIDADE: Evita quebras em rotas legadas que buscam dados crus em memória.
 */
async function getJogos() {
  try {
    const query = `
      SELECT j.id, j.fase, j.status,
             COALESCE(rc.placar_1, 0) AS placar_casa,
             COALESCE(rc.placar_2, 0) AS placar_fora,
             DATE_FORMAT(j.data_hora, '%d/%m') AS data,
             DATE_FORMAT(j.data_hora, '%H:%i') AS horario,
             c1.nome AS casa, c2.nome AS fora,
             a1.nome AS atletaCasa, a2.nome AS atletaFora,
             m.nome AS modalidade,
             m.tipo_confronto
      FROM jogos j
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN campus c1 ON j.campus_1_id = c1.id
      LEFT JOIN campus c2 ON j.campus_2_id = c2.id
      LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id
      LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id
      LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
      ORDER BY j.id ASC`;
    const [linhas] = await db.query(query);
    return linhas;
  } catch (error) {
    console.error('Erro ao buscar jogos:', error);
    return [];
  }
}

async function getJogoPorId(jogoId) {
  try {
    const [linhas] = await db.query('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    return linhas[0] || null;
  } catch (error) {
    console.error('Erro ao buscar jogo:', error);
    return null;
  }
}

// =========================================================================
// MÉTODOS REAIS CONECTADOS AO BANCO DE DADOS (CORE DO CHAVEAMENTO)
// =========================================================================

/**
 * Busca a lista de configurações e prazos oficiais diretamente das tabelas do banco.
 */
let possuiColunaIcone = null;

async function verificarColunaIconeModalidades() {
  if (typeof possuiColunaIcone === 'boolean') {
    return possuiColunaIcone;
  }

  try {
    const [colunas] = await db.query("SHOW COLUMNS FROM modalidades LIKE 'icone'");
    possuiColunaIcone = Array.isArray(colunas) && colunas.length > 0;
  } catch (error) {
    console.error('Erro ao verificar coluna icone na tabela modalidades:', error);
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
  return '/imagens/atletismo1.svg';
}

function gerarDatasEventoDisponiveis(configuracoes = {}) {
  const inicioEvento = String(configuracoes?.inicio_evento || '').trim();
  const fimEvento = String(configuracoes?.fim_evento || '').trim();

  if (!inicioEvento && !fimEvento) {
    return [];
  }

  const inicio = inicioEvento ? new Date(`${inicioEvento}T00:00:00`) : null;
  const fim = fimEvento ? new Date(`${fimEvento}T00:00:00`) : null;

  if (!inicio && !fim) {
    return [];
  }

  const dataInicial = inicio || fim;
  const dataFinal = fim || inicio;

  if (!dataInicial || !dataFinal || dataInicial > dataFinal) {
    return [];
  }

  const datas = [];
  const cursor = new Date(dataInicial);
  while (cursor <= dataFinal) {
    const ano = cursor.getFullYear();
    const mes = String(cursor.getMonth() + 1).padStart(2, '0');
    const dia = String(cursor.getDate()).padStart(2, '0');
    datas.push(`${ano}-${mes}-${dia}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return datas;
}

function agruparJogosPorRodadas(jogos = []) {
  const lista = Array.isArray(jogos) ? [...jogos] : [];
  if (!lista.length) {
    return [];
  }

  const rodadasMap = new Map();
  const totalRodadas = 3;

  lista.forEach((jogo) => {
    const rodadaNumero = Number(jogo?.rodada || jogo?.rodadaNumero || 0);
    const rodadaDaFase = Number.isFinite(rodadaNumero) && rodadaNumero > 0
      ? rodadaNumero
      : Number(String(jogo?.fase || '').match(/rodada\s*(\d+)/i)?.[1] || String(jogo?.fase || '').match(/(\d+)/)?.[1] || 0);

    const rodadaFinal = rodadaDaFase > 0 ? rodadaDaFase : 1;
    const chaveNumero = Number(jogo?.chave_numero || jogo?.chaveNumero || 0);

    if (!rodadasMap.has(rodadaFinal)) {
      rodadasMap.set(rodadaFinal, []);
    }

    rodadasMap.get(rodadaFinal).push({
      ...jogo,
      chaveLabel: chaveNumero > 0 ? String.fromCharCode(64 + chaveNumero) : '—'
    });
  });

  const rodadas = [];
  const rodadaMaxima = Number.isFinite(totalRodadas) && totalRodadas > 0
    ? totalRodadas
    : Math.max(1, ...Array.from(rodadasMap.keys()));

  for (let rodadaIndex = 1; rodadaIndex <= rodadaMaxima; rodadaIndex += 1) {
    const jogosDaRodada = (rodadasMap.get(rodadaIndex) || []).slice().sort((a, b) => {
      const chaveA = Number(a.chave_numero || a.chaveNumero || 0);
      const chaveB = Number(b.chave_numero || b.chaveNumero || 0);
      if (chaveA !== chaveB) {
        return chaveA - chaveB;
      }
      return Number(a.id || 0) - Number(b.id || 0);
    });

    rodadas.push({
      id: rodadaIndex,
      label: `Rodada ${rodadaIndex}`,
      jogos: jogosDaRodada
    });
  }

  return rodadas;
}

async function getConfiguracoesBanco() {
  try {
    const [linhas] = await db.query('SELECT * FROM configuracoes_evento ORDER BY id DESC LIMIT 1');
    return linhas[0] || null;
  } catch (error) {
    console.error('Erro ao buscar configurações no banco:', error);
    return null;
  }
}

/**
 * Retorna a listagem completa das modalidades do JIFC.
 */
async function getModalidadesBanco() {
  try {
    const temIcone = await verificarColunaIconeModalidades();
    const query = temIcone
      ? `SELECT id, nome, genero, tipo_confronto, formato_disputa, icone
         FROM modalidades
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`
      : `SELECT id, nome, genero, tipo_confronto, formato_disputa
         FROM modalidades
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`;

    const [linhas] = await db.query(query);
    return linhas.map((item) => ({
      ...item,
      icone: item.icone || null,
      imagem: obterImagemPadraoModalidade(item.nome)
    }));
  } catch (error) {
    console.error('Erro ao buscar modalidades no banco:', error);
    throw error;
  }
}

async function listarModalidadesConfiguracao() {
  try {
    const temIcone = await verificarColunaIconeModalidades();
    const query = temIcone
      ? `SELECT id, nome, genero, tipo_confronto, formato_disputa, icone
         FROM modalidades
         WHERE genero IN ('Masculino', 'Feminino')
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`
      : `SELECT id, nome, genero, tipo_confronto, formato_disputa
         FROM modalidades
         WHERE genero IN ('Masculino', 'Feminino')
         ORDER BY CASE genero WHEN 'Masculino' THEN 1 WHEN 'Feminino' THEN 2 ELSE 3 END, nome ASC`;

    const [linhas] = await db.query(query);
    return linhas.map((item) => ({
      ...item,
      icone: item.icone || null,
      imagem: obterImagemPadraoModalidade(item.nome)
    }));
  } catch (error) {
    console.error('Erro ao listar modalidades para configuração:', error);
    throw error;
  }
}

function inferirGeneroModalidade(nome, generoInformado = '') {
  const generoNormalizado = String(generoInformado || '').trim();
  if (generoNormalizado === 'Masculino' || generoNormalizado === 'Feminino') {
    return generoNormalizado;
  }

  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  if (nomeNormalizado.includes('feminino')) {
    return 'Feminino';
  }
  if (nomeNormalizado.includes('masculino')) {
    return 'Masculino';
  }

  return 'Masculino';
}

function inferirTipoConfronto(nome, tipoConfrontoInformado = '') {
  const tipoInformado = String(tipoConfrontoInformado || '').trim();
  if (tipoInformado) {
    return tipoInformado;
  }

  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  if (/(atletismo|natação|natacao|corrida|salto|lançamento|lancamento|esgrima|xadrez|tênis de mesa|tenis de mesa)/i.test(nomeNormalizado)) {
    return 'Individual';
  }
  return 'Coletivo';
}

function inferirFormatoDisputa(nome, formatoInformado = '') {
  const formatoValor = String(formatoInformado || '').trim();
  if (formatoValor) {
    return formatoValor;
  }

  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  if (/(atletismo|natação|natacao|corrida|salto|lançamento|lancamento|esgrima|xadrez|tênis de mesa|tenis de mesa)/i.test(nomeNormalizado)) {
    return 'Baterias por Tempo';
  }
  return 'Grupos + Mata-Mata';
}

async function adicionarModalidade({ nome, tipoConfronto = '', formatoDisputa = '', genero = '', icone = null }) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) {
    throw new Error('Informe o nome da modalidade esportiva.');
  }

  const generoInformado = String(genero || '').trim();
  if (generoInformado && !['Masculino', 'Feminino'].includes(generoInformado)) {
    throw new Error('Gênero inválido. Utilize Masculino ou Feminino.');
  }

  const nomeNormalizado = nomeLimpo
    .replace(/^Tênis$/i, 'Tênis de Mesa')
    .replace(/^Basquetebol$/i, 'Basquete')
    .replace(/^Voleibol$/i, 'Vôlei')
    .trim();

  const generoFinal = inferirGeneroModalidade(nomeNormalizado, generoInformado);
  const tipo = inferirTipoConfronto(nomeNormalizado, tipoConfronto);
  const formato = inferirFormatoDisputa(nomeNormalizado, formatoDisputa);

  const [existente] = await db.query('SELECT id FROM modalidades WHERE nome = ? AND genero = ?', [nomeNormalizado, generoFinal]);
  if (!existente.length) {
    const temIcone = await verificarColunaIconeModalidades();
    const [resultado] = await db.query(
      temIcone
        ? 'INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa, icone) VALUES (?, ?, ?, ?, ?)'
        : 'INSERT INTO modalidades (nome, genero, tipo_confronto, formato_disputa) VALUES (?, ?, ?, ?)',
      temIcone
        ? [nomeNormalizado, generoFinal, tipo, formato, icone || null]
        : [nomeNormalizado, generoFinal, tipo, formato]
    );

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


function obterNumeroSistema(participante = {}) {
  const valores = [
    participante?.numeroSistema,
    participante?.numero,
    participante?.numeroCampus,
    participante?.campusNumero,
    participante?.campusId,
    participante?.campus_id,
    participante?.id
  ];

  for (const valor of valores) {
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) {
      return numero;
    }
  }

  return 0;
}

function embaralharArray(lista) {
  const copia = Array.isArray(lista) ? [...lista] : [];
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const indiceAleatorio = Math.floor(Math.random() * (indice + 1));
    [copia[indice], copia[indiceAleatorio]] = [copia[indiceAleatorio], copia[indice]];
  }
  return copia;
}

function ordenarPorNumeroESorteio(lista) {
  const itens = Array.isArray(lista) ? lista : [];
  if (!itens.length) {
    return [];
  }

  return itens
    .map((item, index) => {
      const numero = obterNumeroSistema(item);
      const numeroBase = Number.isFinite(numero) && numero > 0 ? numero : index + 1;
      const randomico = Math.floor(Math.random() * 1_000_000);
      return {
        item,
        prioridade: `${String(randomico).padStart(6, '0')}${String(numeroBase).padStart(8, '0')}`
      };
    })
    .sort((a, b) => a.prioridade.localeCompare(b.prioridade))
    .map(({ item }) => item);
}

function calcularDistribuicaoTamanhoChaves(totalParticipantes, maxTamanho = 3) {
  const total = Number(totalParticipantes || 0);
  const limite = Number(maxTamanho || 3);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(limite) || limite <= 0) {
    return [];
  }

  if (total <= limite) {
    return [total];
  }

  let quantidadeGrupos = Math.max(1, Math.ceil(total / limite));
  while (quantidadeGrupos > 1 && Math.floor(total / quantidadeGrupos) < 2) {
    quantidadeGrupos -= 1;
  }

  const base = Math.floor(total / quantidadeGrupos);
  const resto = total % quantidadeGrupos;
  const tamanhos = Array.from({ length: quantidadeGrupos }, (_, index) => base + (index < resto ? 1 : 0));
  return tamanhos;
}

function obterCampusDoParticipante(participante) {
  return String(
    participante?.nomeCampus
    || participante?.campusNome
    || participante?.campus
    || participante?.nome
    || ''
  ).trim().toLowerCase();
}

function obterFaseParaBanco(rodadaNumero = 1) {
  const rodada = Number(rodadaNumero || 1);
  if (rodada <= 1) return 'Fase de Grupos';
  if (rodada === 2) return 'Oitavas';
  if (rodada === 3) return 'Quartas';
  if (rodada === 4) return 'Semifinal';
  return 'Final';
}

function criarParId(participante, tipoParticipante = 'campus') {
  const primeiroId = tipoParticipante === 'atleta'
    ? Number(participante?.atleta1Id || participante?.atleta_id || participante?.id || 0)
    : Number(participante?.campus1Id || participante?.campus_id || participante?.id || 0);
  const segundoId = tipoParticipante === 'atleta'
    ? Number(participante?.atleta2Id || participante?.id || 0)
    : Number(participante?.campus2Id || participante?.id || 0);

  if (!primeiroId || !segundoId) {
    return null;
  }

  return `${Math.min(primeiroId, segundoId)}-${Math.max(primeiroId, segundoId)}`;
}

function gerarRodadasRoundRobin(participantes, { tipoParticipante = 'campus' } = {}) {
  const lista = Array.isArray(participantes) ? participantes.filter(Boolean) : [];
  if (lista.length < 2) {
    return [];
  }

  const paresParaRodada = (size) => {
    if (size === 2) {
      return [
        [[0, 1]]
      ];
    }
    if (size === 3) {
      return [
        [[0, 1]],
        [[0, 2]],
        [[1, 2]]
      ];
    }
    if (size === 4) {
      return [
        [[0, 2], [1, 3]],
        [[0, 1], [2, 3]],
        [[0, 3], [1, 2]]
      ];
    }
    // Para 5 ou mais, usamos o round robin padrão com bye quando necessário.
    const players = [...lista];
    const evenSize = players.length % 2 === 0 ? players.length : players.length + 1;
    const extended = players.length % 2 === 1 ? [...players, null] : [...players];
    const rounds = [];
    const rotacao = [...extended];
    for (let rodada = 0; rodada < extended.length - 1; rodada += 1) {
      const pares = [];
      for (let i = 0; i < extended.length / 2; i += 1) {
        const primeiro = rotacao[i];
        const segundo = rotacao[extended.length - 1 - i];
        if (!primeiro || !segundo) continue;
        pares.push([i, extended.length - 1 - i]);
      }
      rounds.push(pares);
      const ultimo = rotacao.pop();
      rotacao.splice(1, 0, ultimo);
    }
    return rounds;
  };

  const pairsByRound = paresParaRodada(lista.length);
  const partidas = [];

  pairsByRound.forEach((pairs, rodadaIndex) => {
    const rodada = rodadaIndex + 1;
    pairs.forEach(([primeiroIndex, segundoIndex]) => {
      const primeiro = lista[primeiroIndex];
      const segundo = lista[segundoIndex];
      if (!primeiro || !segundo) return;

      if (tipoParticipante === 'atleta') {
        partidas.push({
          rodada,
          atleta1Id: primeiro?.id || null,
          atleta2Id: segundo?.id || null,
          atleta1Nome: primeiro?.nomeAtleta || primeiro?.nome || null,
          atleta2Nome: segundo?.nomeAtleta || segundo?.nome || null,
          chaveNome: null
        });
      } else {
        partidas.push({
          rodada,
          campus1Id: primeiro?.id || null,
          campus2Id: segundo?.id || null,
          campus1Nome: primeiro?.nomeCampus || primeiro?.nome || null,
          campus2Nome: segundo?.nomeCampus || segundo?.nome || null,
          chaveNome: null
        });
      }
    });
  });

  return partidas;
}

function montarConfrontosDaChave(participantes, { tipoParticipante = 'campus' } = {}) {
  const lista = Array.isArray(participantes) ? participantes.filter(Boolean) : [];
  if (lista.length < 2) {
    return [];
  }

  return gerarRodadasRoundRobin(lista, { tipoParticipante });
}

async function buscarParticipantesModalidade(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return [];
  }

  const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();

  try {
    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0];
    if (!modalidade) {
      return [];
    }

    const nomeModalidade = String(modalidade.nome || '');
    const tipoConfronto = String(modalidade.tipo_confronto || '').trim();
    const modalidadeIndividual = tipoConfronto === 'Individual' || /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade) || isModalidadeTenisMesa(nomeModalidade) || subCategoriaNormalizada === 'individual' || subCategoriaNormalizada === 'dupla';

    if (!modalidadeIndividual) {
      const [linhas] = await db.query(
        `SELECT c.id, c.nome, c.nome_exibicao, c.slug
         FROM campus_modalidade cm
         JOIN campus c ON c.id = cm.campus_id
         WHERE cm.modalidade_id = ?
         ORDER BY c.id ASC, c.nome ASC`,
        [id]
      );

      return linhas.map((campus) => ({
        id: campus.id,
        nome: campus.nome_exibicao || campus.nome,
        nomeCampus: campus.nome_exibicao || campus.nome,
        nomeAtleta: campus.nome_exibicao || campus.nome,
        numeroSistema: Number(campus.id || 0),
        subCategoria: String(subCategoria || '').trim() || 'geral'
      }));
    }

    const [linhas] = await db.query(
      `SELECT a.id, a.nome AS nome_atleta, a.campus_id, c.nome AS campus_nome, c.nome_exibicao, c.slug
       FROM atletas a
       JOIN campus c ON c.id = a.campus_id
       JOIN atleta_modalidade am ON am.atleta_id = a.id
       WHERE am.modalidade_id = ?
       ORDER BY c.id ASC, a.id ASC`,
      [id]
    );

    const participantesPorCampus = new Map();
    linhas.forEach((linha) => {
      const campusId = Number(linha.campus_id || 0);
      if (!participantesPorCampus.has(campusId)) {
        participantesPorCampus.set(campusId, {
          campusId,
          campusNome: String(linha.nome_exibicao || linha.campus_nome || 'Campus').trim(),
          atletas: []
        });
      }

      participantesPorCampus.get(campusId).atletas.push({
        id: linha.id,
        nome: String(linha.nome_atleta || '').trim(),
        campusId,
        campusNome: String(linha.nome_exibicao || linha.campus_nome || 'Campus').trim()
      });
    });

    const participantes = [];
    participantesPorCampus.forEach((grupo) => {
      const atletas = (grupo.atletas || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));

      if (subCategoriaNormalizada === 'dupla' && isModalidadeTenisMesa(nomeModalidade)) {
        for (let indice = 0; indice + 1 < atletas.length; indice += 2) {
          const primeiro = atletas[indice];
          const segundo = atletas[indice + 1];
          participantes.push({
            id: `${primeiro.id}-${segundo.id}`,
            nome: `${primeiro.nome} e ${segundo.nome} ${grupo.campusNome}`,
            nomeAtleta: `${primeiro.nome} e ${segundo.nome} ${grupo.campusNome}`,
            nomeCampus: grupo.campusNome,
            numeroInscrito: Math.floor(indice / 2) + 1,
            campusId: grupo.campusId,
            numeroSistema: Number(grupo.campusId || 0),
            subCategoria: 'dupla'
          });
        }

        if (atletas.length % 2 === 1) {
          const unico = atletas[atletas.length - 1];
          participantes.push({
            id: unico.id,
            nome: `${unico.nome} ${grupo.campusNome}`,
            nomeAtleta: `${unico.nome} ${grupo.campusNome}`,
            nomeCampus: grupo.campusNome,
            numeroInscrito: Math.ceil(atletas.length / 2),
            campusId: grupo.campusId,
            numeroSistema: Number(grupo.campusId || 0),
            subCategoria: 'dupla'
          });
        }
        return;
      }

      atletas.forEach((atleta, indice) => {
        const numeroInscrito = indice + 1;
        const etiqueta = /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade)
          ? atleta.nome
          : isModalidadeTenisMesa(nomeModalidade)
            ? `${atleta.nome} ${grupo.campusNome} ${numeroInscrito}`
            : `${atleta.nome} ${grupo.campusNome} ${numeroInscrito}`;

        participantes.push({
          id: atleta.id,
          nome: etiqueta,
          nomeAtleta: etiqueta,
          nomeCampus: grupo.campusNome,
          numeroInscrito,
          campusId: grupo.campusId,
          numeroSistema: Number(grupo.campusId || 0),
          subCategoria: subCategoriaNormalizada || 'individual'
        });
      });
    });

    return participantes;
  } catch (error) {
    console.error('Erro ao buscar participantes da modalidade:', error);
    return [];
  }
}

function agruparParticipantesEmChaves(participantes, tamanhoChave = 4, opcoes = {}) {
  const lista = Array.isArray(participantes) ? [...participantes] : [];
  if (!lista.length) {
    return [];
  }

  const nomeModalidade = String(opcoes?.modalidadeNome || '').trim();
  const subCategoria = String(opcoes?.subCategoria || '').trim().toLowerCase();
  const usarRegraTenisIndividual = isModalidadeTenisMesa(nomeModalidade) && subCategoria === 'individual';

  const listaOrdenada = ordenarPorNumeroESorteio(lista);

  if (!usarRegraTenisIndividual) {
    const tamanhosDesejados = calcularDistribuicaoTamanhoChaves(listaOrdenada.length, tamanhoChave);
    const grupos = Array.from({ length: tamanhosDesejados.length }, () => []);

    listaOrdenada.forEach((participante) => {
      let grupoEscolhido = -1;
      for (let indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
        const grupo = grupos[indiceGrupo];
        const restante = (tamanhosDesejados[indiceGrupo] || 0) - grupo.length;
        if (restante > 0) {
          grupoEscolhido = indiceGrupo;
          break;
        }
      }

      if (grupoEscolhido === -1) {
        grupos.push([participante]);
      } else {
        grupos[grupoEscolhido].push(participante);
      }
    });

    return grupos.map((grupo) => grupo.slice());
  }

  const tamanhosDesejados = calcularDistribuicaoTamanhoChaves(listaOrdenada.length);
  const grupos = Array.from({ length: tamanhosDesejados.length }, () => []);
  const frequenciaCampus = new Map();

  listaOrdenada.forEach((participante) => {
    const campus = obterCampusDoParticipante(participante);
    frequenciaCampus.set(campus, (frequenciaCampus.get(campus) || 0) + 1);
  });

  const participantesOrdenados = ordenarPorNumeroESorteio(listaOrdenada.slice());

  participantesOrdenados.forEach((participante) => {
    const campus = obterCampusDoParticipante(participante);
    let grupoEscolhido = -1;

    for (let indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
      const grupo = grupos[indiceGrupo];
      const restante = (tamanhosDesejados[indiceGrupo] || 0) - grupo.length;
      if (restante <= 0) {
        continue;
      }

      const possuiMesmoCampus = grupo.some((item) => obterCampusDoParticipante(item) === campus);
      if (!possuiMesmoCampus) {
        grupoEscolhido = indiceGrupo;
        break;
      }
    }

    if (grupoEscolhido === -1) {
      for (let indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
        const grupo = grupos[indiceGrupo];
        const restante = (tamanhosDesejados[indiceGrupo] || 0) - grupo.length;
        if (restante > 0) {
          grupoEscolhido = indiceGrupo;
          break;
        }
      }
    }

    if (grupoEscolhido === -1) {
      grupos.push([participante]);
    } else {
      grupos[grupoEscolhido].push(participante);
    }
  });

  return grupos.map((grupo) => grupo.slice());
}

async function efetuarChaveamentoMatematico(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    throw new Error('Modalidade inválida para sorteio.');
  }

  try {
    try {
      await db.query(`
        ALTER TABLE campus_modalidade
        ADD COLUMN ordem_sorteio INT DEFAULT NULL
      `);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }

    await db.query('UPDATE campus_modalidade SET chave_id = NULL, ordem_sorteio = NULL WHERE modalidade_id = ?', [id]);
    await db.query('DELETE FROM jogos WHERE modalidade_id = ?', [id]);
    await db.query('DELETE FROM chaves WHERE modalidade_id = ?', [id]);

    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0];
    const nomeModalidade = String(modalidade?.nome || '');
    const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();
    const usarRegraTenisIndividual = isModalidadeTenisMesa(nomeModalidade) && subCategoriaNormalizada === 'individual';

    if (usarRegraTenisIndividual) {
      const [participantes] = await db.query(
        `SELECT a.id, a.nome AS nome_atleta, c.id AS campus_id, c.nome AS campus_nome, c.nome_exibicao, c.slug
         FROM atletas a
         JOIN campus c ON c.id = a.campus_id
         JOIN atleta_modalidade am ON am.atleta_id = a.id
         WHERE am.modalidade_id = ?
         ORDER BY c.nome ASC, a.nome ASC`,
        [id]
      );

      if (!participantes.length) {
        return { chaves: [], jogos: [] };
      }

      const grupos = agruparParticipantesEmChaves(participantes, 3, {
        modalidadeNome: nomeModalidade,
        subCategoria: subCategoriaNormalizada
      });

      const chavesCriadas = [];
      const jogosGerados = [];

      for (let index = 0; index < grupos.length; index += 1) {
        const grupo = grupos[index];
        const [resultadoChave] = await db.query(
          'INSERT INTO chaves (modalidade_id, numero_chave) VALUES (?, ?)',
          [id, index + 1]
        );
        const chaveId = resultadoChave.insertId;
        chavesCriadas.push({ id: chaveId, numero_chave: index + 1 });

        const confrontos = montarConfrontosDaChave(grupo, { tipoParticipante: 'atleta' });
        for (const confronto of confrontos) {
          const faseJogo = obterFaseParaBanco(confronto?.rodada || 1);
          const [resultadoJogo] = await db.query(
            `INSERT INTO jogos (
               modalidade_id, chave_id, fase, rodada, atleta_1_id, atleta_2_id,
               data_hora, local_jogo, status
             ) VALUES (?, ?, ?, ?, ?, ?, NOW(), 'A definir', 'Agendado')`,
            [id, chaveId, faseJogo, confronto.rodada || 1, confronto.atleta1Id, confronto.atleta2Id]
          );
          jogosGerados.push({ id: resultadoJogo.insertId, chaveId });
        }
      }

      return { chaves: chavesCriadas, jogos: jogosGerados };
    }

    const [inscritos] = await db.query(
      `SELECT c.id, c.nome, c.nome_exibicao, c.slug
       FROM campus_modalidade cm
       JOIN campus c ON c.id = cm.campus_id
       WHERE cm.modalidade_id = ?
       ORDER BY c.id ASC, c.nome ASC`,
      [id]
    );

    if (!inscritos.length) {
      return { chaves: [], jogos: [] };
    }

    const tamanhoChave = 3;
    const grupos = agruparParticipantesEmChaves(inscritos.map((inscrito) => ({ ...inscrito, numeroSistema: Number(inscrito.id || 0) })), tamanhoChave);

    for (let index = 0; index < grupos.length; index += 1) {
      const grupo = grupos[index];
      const [resultadoChave] = await db.query(
        'INSERT INTO chaves (modalidade_id, numero_chave) VALUES (?, ?)',
        [id, index + 1]
      );
      const chaveId = resultadoChave.insertId;

      for (const [index, inscrito] of grupo.entries()) {
        await db.query(
          'UPDATE campus_modalidade SET chave_id = ?, ordem_sorteio = ? WHERE campus_id = ? AND modalidade_id = ?',
          [chaveId, index + 1, inscrito.id, id]
        );
      }
    }

    const [chavesCriadas] = await db.query('SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? ORDER BY numero_chave ASC', [id]);
    const jogosGerados = [];
    for (const chave of chavesCriadas) {
      const [participantes] = await db.query(
        `SELECT cm.campus_id AS id, c.nome AS nome, c.nome_exibicao, c.slug, cm.ordem_sorteio
         FROM campus_modalidade cm
         JOIN campus c ON c.id = cm.campus_id
         WHERE cm.modalidade_id = ? AND cm.chave_id = ?
         ORDER BY cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC, c.nome ASC`,
        [id, chave.id]
      );

      const confrontos = montarConfrontosDaChave(participantes, { tipoParticipante: 'campus' });
      for (const [index, confronto] of confrontos.entries()) {
        const inicioDoDia = new Date();
        inicioDoDia.setHours(8, 0, 0, 0);
        const dataHoraJogo = new Date(inicioDoDia.getTime() + index * 60 * 60 * 1000);
        const dataHoraSql = dataHoraJogo.toISOString().slice(0, 19).replace('T', ' ');

        const faseJogo = obterFaseParaBanco(confronto?.rodada || 1);
        const [resultadoJogo] = await db.query(
          `INSERT INTO jogos (
             modalidade_id, chave_id, fase, rodada, campus_1_id, campus_2_id,
             data_hora, local_jogo, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'A definir', 'Agendado')`,
          [id, chave.id, faseJogo, confronto.rodada || 1, confronto.campus1Id, confronto.campus2Id, dataHoraSql]
        );
        jogosGerados.push({ id: resultadoJogo.insertId, chaveId: chave.id });
      }
    }

    return { chaves: chavesCriadas, jogos: jogosGerados };
  } catch (error) {
    console.error('Erro ao efetuar chaveamento matemático:', error);
    throw error;
  }
}

async function atualizarJogoChaveamento(jogoId, dados = {}) {
  const id = Number(jogoId || 0);
  if (!id) {
    throw new Error('ID do jogo inválido.');
  }

  const dataInformada = String(dados.dataJogo || dados.data || '').trim();
  const horarioInformado = String(dados.horarioJogo || dados.horario || '').trim();
  const localInformado = String(dados.localJogo || dados.local || '').trim();
  const statusInformado = String(dados.status || 'Agendado').trim();

  let dataHoraSql = null;
  if (dataInformada) {
    const [dia, mes, ano] = dataInformada.split(/[/-]/).map((item) => Number(item));
    if (Number.isFinite(dia) && Number.isFinite(mes) && Number.isFinite(ano)) {
      const hora = horarioInformado ? Number(horarioInformado.split(':')[0]) : 0;
      const minuto = horarioInformado ? Number(horarioInformado.split(':')[1]) : 0;
      dataHoraSql = new Date(ano, mes - 1, dia, hora || 0, minuto || 0, 0);
    }
  }

  const campos = [];
  const valores = [];

  if (statusInformado) {
    campos.push('status = ?');
    valores.push(statusInformado);
  }

  if (localInformado) {
    campos.push('local_jogo = ?');
    valores.push(localInformado);
  }

  if (dataHoraSql) {
    campos.push('data_hora = ?');
    valores.push(dataHoraSql.toISOString().slice(0, 19).replace('T', ' '));
  }

  if (!campos.length) {
    return null;
  }

  valores.push(id);
  await db.query(`UPDATE jogos SET ${campos.join(', ')} WHERE id = ?`, valores);
  return { id };
}

async function getInscritosModalidade(modalidadeId, subCategoria = '') {
  const participantes = await buscarParticipantesModalidade(modalidadeId, subCategoria);
  return participantes.map((participante) => ({
    ...participante,
    subCategoria: String(subCategoria || '').trim() || 'geral'
  }));
}

async function getChavesModalidade(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return [];
  }

  try {
    try {
      await db.query(`
        ALTER TABLE campus_modalidade
        ADD COLUMN ordem_sorteio INT DEFAULT NULL
      `);
    } catch (error) {
      if (!/Duplicate column|already exists/i.test(error.message || '')) {
        throw error;
      }
    }

    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0];
    if (!modalidade) {
      return [];
    }

    const nomeModalidade = String(modalidade?.nome || '');
    const tipoConfronto = String(modalidade?.tipo_confronto || '').trim();
    const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();
    const modalidadeIndividual = tipoConfronto === 'Individual' || /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade) || isModalidadeTenisMesa(nomeModalidade) || subCategoriaNormalizada === 'individual' || subCategoriaNormalizada === 'dupla';

    const [chavesRows] = await db.query('SELECT id, numero_chave FROM chaves WHERE modalidade_id = ? ORDER BY numero_chave ASC', [id]);
    if (!chavesRows.length) {
      return [];
    }

    const grupos = [];
    for (const chave of chavesRows) {
      const [participantes] = modalidadeIndividual
        ? await db.query(
            `SELECT DISTINCT a.id AS id, a.nome AS nome_atleta, c.nome AS campus_nome, c.nome_exibicao
             FROM jogos j
             JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
             JOIN campus c ON c.id = a.campus_id
             WHERE j.modalidade_id = ? AND j.chave_id = ?
             ORDER BY a.nome ASC`,
            [id, chave.id]
          )
        : await db.query(
            `SELECT cm.campus_id AS id, c.nome AS nome, c.nome_exibicao, c.slug, cm.ordem_sorteio
             FROM campus_modalidade cm
             JOIN campus c ON c.id = cm.campus_id
             WHERE cm.modalidade_id = ? AND cm.chave_id = ?
             ORDER BY cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC, c.nome ASC`,
            [id, chave.id]
          );

      grupos.push({
        id: chave.id,
        modalidade_id: Number(id || 0),
        numero_chave: chave.numero_chave || grupos.length + 1,
        nome_chave: `Chave ${chave.numero_chave || grupos.length + 1}`,
        letra: String.fromCharCode(64 + (chave.numero_chave || grupos.length + 1)),
        subCategoria: String(subCategoria || '').trim() || 'geral',
        integrantes: participantes.map((participante) => ({
          id: participante.id,
          nomeCampus: participante.nome_exibicao || participante.nome || participante.nome_atleta || 'Campus sem nome',
          nome: participante.nome_exibicao || participante.nome || participante.nome_atleta || 'Campus sem nome',
          nomeAtleta: participante.nome_atleta || participante.nome_exibicao || participante.nome || 'Campus sem nome',
          numeroInscrito: 0,
          pontosFaseDeGrupos: 0
        }))
      });
    }

    return grupos;
  } catch (error) {
    console.error('Erro ao buscar chaves persistidas da modalidade:', error);
    return [];
  }
}

async function getJogosModalidade(modalidadeId, subCategoria = '') {
  const id = Number(modalidadeId || 0);
  if (!id) {
    return [];
  }

  try {
    const [modalidadeRows] = await db.query('SELECT id, nome, tipo_confronto FROM modalidades WHERE id = ?', [id]);
    const modalidade = modalidadeRows[0] || {};
    const nomeModalidade = String(modalidade.nome || '');
    const tipoConfronto = String(modalidade.tipo_confronto || '').trim();
    const subCategoriaNormalizada = String(subCategoria || '').trim().toLowerCase();
    const modalidadeIndividual = tipoConfronto === 'Individual' || /atletismo/i.test(nomeModalidade) || /xadrez/i.test(nomeModalidade) || isModalidadeTenisMesa(nomeModalidade) || subCategoriaNormalizada === 'individual' || subCategoriaNormalizada === 'dupla';

    const [participantesPorChaveDados] = await db.query(
      modalidadeIndividual
        ? `SELECT j.chave_id, a.id AS atleta_id, a.nome AS nome_atleta, c.id AS campus_id, c.nome AS campus_nome, c.nome_exibicao
           FROM jogos j
           JOIN atletas a ON a.id = j.atleta_1_id OR a.id = j.atleta_2_id
           JOIN campus c ON c.id = a.campus_id
           WHERE j.modalidade_id = ?
           ORDER BY j.chave_id ASC, c.id ASC, a.nome ASC`
        : `SELECT cm.chave_id, c.id AS campus_id, c.nome AS nome, c.nome_exibicao, c.slug, cm.ordem_sorteio
           FROM campus_modalidade cm
           JOIN campus c ON c.id = cm.campus_id
           WHERE cm.modalidade_id = ? AND cm.chave_id IS NOT NULL
           ORDER BY cm.chave_id ASC, cm.ordem_sorteio IS NULL, cm.ordem_sorteio ASC, c.id ASC`,
      [id]
    );

    const participantesPorChave = new Map();
    participantesPorChaveDados.forEach((linha) => {
      const chaveId = Number(linha.chave_id || 0);
      if (!chaveId) return;
      if (!participantesPorChave.has(chaveId)) {
        participantesPorChave.set(chaveId, []);
      }

      if (modalidadeIndividual) {
        const atletaId = Number(linha.atleta_id || 0);
        if (!atletaId) return;
        const chaveParticipantes = participantesPorChave.get(chaveId);
        if (chaveParticipantes.some((p) => Number(p.id) === atletaId)) {
          return;
        }
        participantesPorChave.get(chaveId).push({
          id: atletaId,
          nome: linha.nome_atleta || '',
          nomeAtleta: linha.nome_atleta || '',
          nomeCampus: linha.nome_exibicao || linha.campus_nome || ''
        });
      } else {
        participantesPorChave.get(chaveId).push({
          id: linha.campus_id,
          nome: String(linha.nome_exibicao || linha.nome || ''),
          nomeCampus: String(linha.nome_exibicao || linha.nome || ''),
          numeroSistema: Number(linha.campus_id || 0)
        });
      }
    });

    const rodadasPorChave = new Map();
    participantesPorChave.forEach((participantesLista, chaveId) => {
      if (!Array.isArray(participantesLista) || participantesLista.length < 2) {
        return;
      }

      const tipoParticipante = modalidadeIndividual ? 'atleta' : 'campus';
      const partidas = gerarRodadasRoundRobin(participantesLista, { tipoParticipante });
      const mapaRodadas = new Map();
      partidas.forEach((partida) => {
        const parId = criarParId(partida, tipoParticipante);
        if (parId) {
          mapaRodadas.set(parId, Number(partida.rodada || 1));
        }
      });
      rodadasPorChave.set(chaveId, mapaRodadas);
    });

    const [linhas] = await db.query(
      `SELECT j.id, j.modalidade_id, j.chave_id, j.fase, j.rodada, j.status, j.data_hora, j.local_jogo,
              j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
              chv.numero_chave AS chave_numero,
              c1.nome AS campus_1_nome,
              c2.nome AS campus_2_nome,
              a1.nome AS atleta_1_nome,
              a2.nome AS atleta_2_nome
       FROM jogos j
       LEFT JOIN campus c1 ON c1.id = j.campus_1_id
       LEFT JOIN campus c2 ON c2.id = j.campus_2_id
       LEFT JOIN atletas a1 ON a1.id = j.atleta_1_id
       LEFT JOIN atletas a2 ON a2.id = j.atleta_2_id
       LEFT JOIN chaves chv ON chv.id = j.chave_id
       WHERE j.modalidade_id = ?
       ORDER BY j.data_hora ASC, j.id ASC`,
      [id]
    );

    return linhas.map((jogo) => {
      const chaveId = Number(jogo.chave_id || 0);
      const parId = modalidadeIndividual
        ? criarParId({ atleta1Id: jogo.atleta_1_id, atleta2Id: jogo.atleta_2_id }, 'atleta')
        : criarParId({ campus1Id: jogo.campus_1_id, campus2Id: jogo.campus_2_id }, 'campus');
      const rodadaNumero = Number(jogo.rodada || 1);
      const dataHora = jogo.data_hora ? new Date(jogo.data_hora) : null;
      const dataInput = dataHora ? `${String(dataHora.getFullYear()).padStart(4, '0')}-${String(dataHora.getMonth() + 1).padStart(2, '0')}-${String(dataHora.getDate()).padStart(2, '0')}` : '';
      const horarioInput = dataHora ? `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}` : '';
      return {
        ...jogo,
        subCategoria: String(subCategoria || '').trim() || 'geral',
        data: dataHora ? `${String(dataHora.getDate()).padStart(2, '0')}/${String(dataHora.getMonth() + 1).padStart(2, '0')}` : '—',
        horario: dataHora ? `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}` : '—',
        dataInput,
        horarioInput,
        localJogo: jogo.local_jogo || 'A definir',
        casa: jogo.campus_1_nome || jogo.atleta_1_nome || '—',
        fora: jogo.campus_2_nome || jogo.atleta_2_nome || '—',
        atletaCasa: jogo.atleta_1_nome || '—',
        atletaFora: jogo.atleta_2_nome || '—',
        tipoIndividual: Boolean(jogo.atleta_1_id || jogo.atleta_2_id),
        placar: jogo.placar || 'vs',
        chaveNumero: jogo.chave_numero || null,
        rodadaNumero,
        status: jogo.status || 'Agendado'
      };
    });
  } catch (error) {
    console.error('Erro ao buscar jogos da modalidade:', error);
    return [];
  }
}

async function getResumoInscricoes() {
  try {
    const [campiLinhas] = await db.query(
      `SELECT id, nome
       FROM campus
       ORDER BY nome ASC`
    );

    const [linksModalidades] = await db.query(
      `SELECT cm.campus_id, m.id AS modalidade_id, m.nome AS modalidade_nome, m.genero AS modalidade_genero
       FROM campus_modalidade cm
       JOIN modalidades m ON m.id = cm.modalidade_id
       ORDER BY cm.campus_id, m.nome ASC`
    );

    const [atletasLinhas] = await db.query(
      `SELECT a.id, a.nome, a.matricula, a.data_nascimento, a.cpf, a.genero, a.campus_id, am.modalidade_id
       FROM atletas a
       LEFT JOIN atleta_modalidade am ON am.atleta_id = a.id
       ORDER BY a.campus_id, a.nome ASC`
    );

    const campi = campiLinhas.map((campus) => ({
      id: campus.id,
      nome: campus.nome,
      slug: '',
      modalidades: []
    }));

    const campusPorId = new Map(campi.map((campus) => [campus.id, campus]));

    linksModalidades.forEach((link) => {
      const campus = campusPorId.get(link.campus_id);
      if (!campus) {
        return;
      }

      const existente = campus.modalidades.find((modalidade) => Number(modalidade.id) === Number(link.modalidade_id));
      if (existente) {
        return;
      }

      campus.modalidades.push({
        id: link.modalidade_id,
        nome: link.modalidade_nome,
        genero: link.modalidade_genero || 'Masculino',
        atletasMasculino: [],
        atletasFeminino: [],
        atletas: []
      });
    });

    atletasLinhas.forEach((atleta) => {
      const campus = campusPorId.get(atleta.campus_id);
      if (!campus || !atleta.modalidade_id) {
        return;
      }

      const modalidade = campus.modalidades.find((item) => Number(item.id) === Number(atleta.modalidade_id));
      if (!modalidade) {
        return;
      }

      const atletaResumo = {
        id: atleta.id,
        nome: atleta.nome,
        matricula: atleta.matricula,
        dataNascimento: atleta.data_nascimento,
        cpf: atleta.cpf,
        status: 'Analise',
        genero: atleta.genero || 'Masculino'
      };

      modalidade.atletas.push(atletaResumo);
      if (String(atleta.genero || '').toLowerCase() === 'feminino') {
        modalidade.atletasFeminino.push(atletaResumo);
      } else {
        modalidade.atletasMasculino.push(atletaResumo);
      }
    });

    return { campi };
  } catch (error) {
    console.error('Erro ao montar resumo de inscrições:', error);
    return { campi: [] };
  }
}

module.exports = {
  getConfiguracoes,
  salvarConfiguracoes,
  getAnoJifc,
  getAtletasPendentes,
  validarAtleta,
  getJogos,
  getJogoPorId,
  getConfiguracoesBanco,
  gerarDatasEventoDisponiveis,
  agruparJogosPorRodadas,
  getModalidadesBanco,
  listarModalidadesConfiguracao,
  inferirGeneroModalidade,
  inferirTipoConfronto,
  inferirFormatoDisputa,
  adicionarModalidade,
  removerModalidadePorId,
  isModalidadeSorteavel,
  isModalidadeTenisMesa,
  agruparParticipantesEmChaves,
  efetuarChaveamentoMatematico,
  atualizarJogoChaveamento,
  getInscritosModalidade,
  getChavesModalidade,
  getJogosModalidade,
  getResumoInscricoes,
  montarConfrontosDaChave
};
