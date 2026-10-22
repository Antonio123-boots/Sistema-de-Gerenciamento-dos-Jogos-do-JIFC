const db = require('../config/db');
const { ensureJogoPublicadoColumn } = require('../config/ensureSchema');
const { filtroAnoEvento, obterAnoEventoAtual } = require('../config/edicaoAtual');
const { statusEfetivo } = require('../utils/jogoStatus');

function normalizarSlugParaFiltro(valor = '') {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function ehTenisDeMesa(valor = '') {
  const slug = normalizarSlugParaFiltro(valor);
  return slug.includes('tenis');
}

function classificarSubCategoriaJogo(nomeModalidade, atleta1Id, atleta2Id) {
  if (!ehTenisDeMesa(nomeModalidade)) {
    return null;
  }
  return (atleta1Id || atleta2Id) ? 'individual' : 'dupla';
}

function normalizarSubCategoriaFiltro(valor = '') {
  const texto = String(valor || '').trim().toLowerCase();
  if (texto === 'individual' || texto === 'dupla') {
    return texto;
  }
  return '';
}

function filtrarJogosDoCampus(jogos = [], nomesCampus = []) {
  const nomes = [].concat(nomesCampus || [])
    .map((nome) => String(nome || '').trim())
    .filter(Boolean);
  if (!nomes.length) {
    return [];
  }
  return (Array.isArray(jogos) ? jogos : []).filter((jogo) =>
    nomes.includes(String(jogo.casa || '').trim()) ||
    nomes.includes(String(jogo.fora || '').trim())
  );
}

const SELECT_JOGOS = `
  SELECT j.id, j.fase, j.status, j.rodada, j.chave_id,
         COALESCE(rc.placar_1, 0) AS placar_casa,
         COALESCE(rc.placar_2, 0) AS placar_fora,
         DATE_FORMAT(j.data_hora, '%d/%m') AS data,
         DATE_FORMAT(j.data_hora, '%Y-%m-%d') AS dataInput,
         DATE_FORMAT(j.data_hora, '%H:%i') AS horario,
         j.campus_1_id, j.campus_2_id,
         j.atleta_1_id, j.atleta_2_id,
         j.rotulo_casa, j.rotulo_fora,
         c1.nome AS casa, c2.nome AS fora,
         c1.slug AS slug_casa, c2.slug AS slug_fora,
         c1.nome_exibicao AS casa_exibicao, c2.nome_exibicao AS fora_exibicao,
         c1.cidade AS cidade_casa, c2.cidade AS cidade_fora,
         c1.foto_perfil AS foto_casa,
         c2.foto_perfil AS foto_fora,
         c1.cor AS cor_casa,
         c2.cor AS cor_fora,
         a1.nome AS atletaCasa, a2.nome AS atletaFora,
         j.local_jogo AS local_jogo,
         m.nome AS modalidade,
         m.genero AS genero,
         m.tipo_confronto,
         j.publicado,
         j.wo,
         j.vencedor_campus_id,
         j.disputa_pontos_1, j.disputa_pontos_2
  FROM jogos j
  JOIN modalidades m ON j.modalidade_id = m.id
  LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id
  LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id
  LEFT JOIN campus c1 ON c1.id = COALESCE(j.campus_1_id, a1.campus_id)
  LEFT JOIN campus c2 ON c2.id = COALESCE(j.campus_2_id, a2.campus_id)
  LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id`;

async function montarJogos(linhas) {
  return Promise.all(linhas.map(async (linha) => {
    const nomeModalidade = String(linha.modalidade || '').trim();
    const generoModalidade = String(linha.genero || '').trim();
    const modalidadeBaseSlug = normalizarSlugParaFiltro(nomeModalidade);
    const modalidadeSlugCompleta = normalizarSlugParaFiltro(`${nomeModalidade} ${generoModalidade}`);

    let sets = [];
    try {
      const [setsRows] = await db.query(
        'SELECT numero_set, pontos_1, pontos_2 FROM resultados_por_sets WHERE jogo_id = ? ORDER BY numero_set ASC',
        [linha.id]
      );
      sets = setsRows.map(s => ({ numero: s.numero_set, pontos_1: s.pontos_1, pontos_2: s.pontos_2 }));
    } catch (_) { sets = []; }

    return {
      ...linha,
      status: statusEfetivo(linha.status, linha.data_hora),
      modalidadeSlug: modalidadeSlugCompleta,
      modalidadeBaseSlug: modalidadeBaseSlug,
      subCategoria: classificarSubCategoriaJogo(nomeModalidade, linha.atleta_1_id, linha.atleta_2_id),
      cidadeCasa: linha.cidade_casa || linha.casa_exibicao || linha.casa || null,
      cidadeFora: linha.cidade_fora || linha.fora_exibicao || linha.fora || null,
      casa: linha.casa_exibicao || linha.casa || linha.atletaCasa || null,
      fora: linha.fora_exibicao || linha.fora || linha.atletaFora || null,
      rotuloCasa: linha.rotulo_casa || null,
      rotuloFora: linha.rotulo_fora || null,
      disputa_pontos_1: linha.disputa_pontos_1,
      disputa_pontos_2: linha.disputa_pontos_2,
      fotoCasa: linha.foto_casa || '/imagens/avatar.svg',
      fotoFora: linha.foto_fora || '/imagens/avatar.svg',
      slugCasa: linha.slug_casa || null,
      slugFora: linha.slug_fora || null,
      corCasa: linha.cor_casa || null,
      corFora: linha.cor_fora || null,
      sets
    };
  }));
}

async function getJogos() {
  try {
    await ensureJogoPublicadoColumn();
    const [linhas] = await db.query(`${SELECT_JOGOS} WHERE ${await filtroAnoEvento('j')} ORDER BY j.id ASC`);
    return await montarJogos(linhas);
  } catch (error) {
    return [];
  }
}

async function getDiasDisponiveis() {
  await ensureJogoPublicadoColumn();
  try {
    const [linhas] = await db.query(
      `SELECT DISTINCT DATE_FORMAT(j.data_hora, '%d/%m') AS dia
       FROM jogos j
       WHERE j.publicado = 1
         AND ${await filtroAnoEvento('j')}
       ORDER BY j.data_hora ASC`
    );
    return (linhas || []).map((linha) => String(linha.dia || '').trim()).filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function getJogosPublicados(filters = {}) {
  await ensureJogoPublicadoColumn();

  const generoFiltro = String(filters.genero || '').trim().toLowerCase();
  const diaFiltro = String(filters.dia || '').trim();
  const modalidadeSlugFiltro = normalizarSlugParaFiltro(filters.modalidadeSlug || filters.modalidade || '');
  const modalidadeBaseFiltro = modalidadeSlugFiltro.replace(/-(masculino|feminino)$/i, '');
  const subCategoriaFiltro = normalizarSubCategoriaFiltro(filters.subCategoria);

  const query = `${SELECT_JOGOS} WHERE j.publicado = 1 AND ${await filtroAnoEvento('j')} ORDER BY j.data_hora ASC, j.id ASC`;

  try {
    const [linhas] = await db.query(query);
    const jogos = await montarJogos(linhas);

    return jogos.filter((jogo) => {
      const atendeDia = !diaFiltro || String(jogo.data || '') === diaFiltro;
      const atendeGenero = !generoFiltro || String(jogo.genero || '').trim().toLowerCase() === generoFiltro;
      const slugAtual = String(jogo.modalidadeSlug || '').trim();
      const slugBaseAtual = String(jogo.modalidadeBaseSlug || '').trim();
      const slugNomeModalidade = normalizarSlugParaFiltro(jogo.modalidade || '');
      const slugBaseJogo = slugNomeModalidade.replace(/-(masculino|feminino)$/i, '');
      const atendeModalidade = !modalidadeSlugFiltro ||
        slugAtual === modalidadeSlugFiltro ||
        slugBaseAtual === modalidadeSlugFiltro ||
        slugNomeModalidade === modalidadeSlugFiltro ||
        slugBaseJogo === modalidadeBaseFiltro;
      const atendeSubCategoria = !subCategoriaFiltro || jogo.subCategoria === subCategoriaFiltro;
      return atendeDia && atendeGenero && atendeModalidade && atendeSubCategoria;
    });
  } catch (error) {
    return [];
  }
}

async function getJogoPorId(jogoId) {
  try {
    const [linhas] = await db.query('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    return linhas[0] || null;
  } catch (error) {
    return null;
  }
}

async function publicarJogosModalidade(modalidadeId) {
  const id = Number(modalidadeId || 0);
  if (!id) {
    throw new Error('Modalidade inválida para confirmação do sorteio.');
  }

  await ensureJogoPublicadoColumn();
  await db.query(`UPDATE jogos SET publicado = 1 WHERE modalidade_id = ? AND ${await filtroAnoEvento()}`, [id]);

  const { publicarModalidadeIndividual } = require('./resultadosIndividuaisService');
  await publicarModalidadeIndividual(id);

  const { sincronizarClassificacaoGruposModalidade } = require('./classificacaoService');
  await sincronizarClassificacaoGruposModalidade(id);
}

async function publicarTodosJogos(modalidadeId) {
  await ensureJogoPublicadoColumn();
  await db.query(`UPDATE jogos SET publicado = 1 WHERE ${await filtroAnoEvento()}`);

  const { publicarTodasModalidadesIndividuais } = require('./resultadosIndividuaisService');
  await publicarTodasModalidadesIndividuais();

  const { sincronizarClassificacaoGruposModalidade } = require('./classificacaoService');
  const [modalidades] = await db.query('SELECT id FROM modalidades ORDER BY id ASC');
  for (const modalidade of modalidades) {
    await sincronizarClassificacaoGruposModalidade(modalidade.id);
  }
}

function agruparJogosPorRodadas(jogos = []) {
  const lista = Array.isArray(jogos) ? [...jogos] : [];
  if (!lista.length) {
    return [];
  }

  const rodadasMap = new Map();
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
  const rodadaMaxima = Math.max(1, ...Array.from(rodadasMap.keys()));

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

module.exports = {
  normalizarSlugParaFiltro,
  ehTenisDeMesa,
  classificarSubCategoriaJogo,
  normalizarSubCategoriaFiltro,
  filtrarJogosDoCampus,
  getJogos,
  getDiasDisponiveis,
  getJogosPublicados,
  getJogoPorId,
  publicarJogosModalidade,
  publicarTodosJogos,
  agruparJogosPorRodadas
};
