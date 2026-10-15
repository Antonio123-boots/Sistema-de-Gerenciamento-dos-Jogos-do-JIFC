/**
 * Simulação completa do JIFC 2026 (24 a 26/06/2026).
 * Uso:  node scripts/simular_jifc.js [fase]
 * Fases: all (padrão) | config | campi | sorteio | agenda | resultados | publish
 * Cada fase é idempotente — pode ser executada isoladamente.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../config/db');
const configService = require('../services/configService');
const chaveamentoService = require('../services/chaveamentoService');
const juizService = require('../services/juizService');
const ras = require('../services/resultadosIndividuaisService');
const jogoService = require('../services/jogoService');
const classificacaoService = require('../services/classificacaoService');
const mataMataService = require('../services/mataMataService');
const boletimService = require('../services/boletimService');
const { obterRegras } = require('../utils/sportClassificationRules');

const FASE = process.argv[2] || 'all';

let seed = 20260624;
function rng() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function intEntre(min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}
function embaralhar(lista) {
  const copia = [...lista];
  for (let k = copia.length - 1; k > 0; k -= 1) {
    const j2 = Math.floor(rng() * (k + 1));
    [copia[k], copia[j2]] = [copia[j2], copia[k]];
  }
  return copia;
}

const TEMPO_BASE = [
  [/100\s*m/i, 13, 1.3],
  [/200\s*m/i, 27, 2.2],
  [/400\s*m/i, 66, 8],
  [/800\s*m/i, 185, 45],
  [/1500\s*m/i, 355, 70],
  [/3000\s*m/i, 790, 130],
  [/5000\s*m/i, 1480, 280],
  [/4\s*x\s*100/i, 56, 9],
  [/4\s*x\s*400/i, 345, 65]
];
const MEDIDA_BASE = [
  [/salto\s*(em\s*)?dist/i, 5.1, 1.1],
  [/salto\s*(em\s*)?triplo/i, 12.2, 1.6],
  [/salto\s*(em\s*)?altura/i, 1.62, 0.28],
  [/peso/i, 10.6, 2.6],
  [/disco/i, 29, 9],
  [/dardo/i, 38, 11]
];

function nomeBC(nome, re) {
  return re.test(nome);
}

function tempoParaSql(segundos) {
  const totalMs = Math.round(Number(segundos) * 1000);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

async function faseConfig() {
  await configService.salvarConfiguracoes({
    ano_evento: 2026,
    inicio_evento: '2026-06-24',
    fim_evento: '2026-06-26',
    inicio_inscricao_modalidades: '2026-04-06',
    fim_inscricao_modalidades: '2026-05-15',
    inicio_inscricao_atletas: '2026-05-18',
    fim_inscricao_atletas: '2026-06-12',
    inicio_sorteio_chaves: '2026-06-15',
    fim_sorteio_chaves: '2026-06-23',
    limite_atletas_total_campus: 0
  });
  console.log('[config] Evento JIFC 2026 ajustado para 24 a 26/06/2026.');
}

async function faseCampi() {
  const [mods] = await db.query('SELECT id, nome FROM modalidades ORDER BY id');
  for (const m of mods) {
    const nome = String(m.nome || '');
    if (/atletismo/i.test(nome) || /xadrez/i.test(nome)) continue;
    let minimo = 5;
    if (/v[oô]lei de praia|praia/i.test(nome)) { minimo = 2; }
    else if (/t[êe]nis de mesa/i.test(nome)) { minimo = 2; }

    await db.query(`
      INSERT IGNORE INTO campus_modalidade (campus_id, modalidade_id)
      SELECT a.campus_id, am.modalidade_id
      FROM atleta_modalidade am
      JOIN atletas a ON a.id = am.atleta_id
      JOIN modalidades m2 ON m2.id = am.modalidade_id
      WHERE am.modalidade_id = ?
        AND (m2.genero IS NULL OR m2.genero = '' OR a.genero = m2.genero)
      GROUP BY a.campus_id, am.modalidade_id, a.genero, m2.genero
      HAVING COUNT(*) >= ?
    `, [m.id, minimo]);
  }
  const [vinculados] = await db.query('SELECT modalidade_id, COUNT(*) qtd FROM campus_modalidade GROUP BY modalidade_id ORDER BY modalidade_id');
  console.log('[campi] campus_modalidade reajustados:', vinculados.map((v) => `${v.modalidade_id}=${v.qtd}`).join(', '));
}

async function limparDadosExistentes() {
  await db.query('DELETE FROM resultados_por_sets');
  await db.query('DELETE FROM resultados_coletivos');
  await db.query('DELETE FROM resultados_atletismo');
  await db.query('DELETE FROM resultados_xadrez');
  await db.query('DELETE FROM cartoes');
  await db.query('DELETE FROM classificacao_grupos');
  await db.query('UPDATE campus_modalidade SET chave_id = NULL, ordem_sorteio = NULL');
  await db.query('DELETE FROM jogos');
  await db.query('DELETE FROM chaves');
  console.log('[sorteio] Dados anteriores de chaves/jogos/resultados removidos (limpeza).');
}

async function faseSorteio() {
  await limparDadosExistentes();

  const [mods] = await db.query('SELECT id, nome, tipo_confronto, genero FROM modalidades ORDER BY id');
  for (const m of mods) {
    const nome = String(m.nome || '');
    if (/atletismo/i.test(nome) || /xadrez/i.test(nome)) {
      console.log(`[sorteio] ${m.id} ${nome} -> pulado (esporte individual sem chaveamento)`);
      continue;
    }
    if (/t[êe]nis de mesa/i.test(nome)) {
      await chaveamentoService.efetuarChaveamentoMatematico(m.id, 'individual');
      await chaveamentoService.efetuarChaveamentoMatematico(m.id, 'dupla');
      console.log(`[sorteio] ${m.id} ${nome} -> individual + dupla`);
    } else {
      await chaveamentoService.efetuarChaveamentoMatematico(m.id, '');
      console.log(`[sorteio] ${m.id} ${nome}`);
    }
  }

  const [totChaves] = await db.query('SELECT COUNT(*) qtd FROM chaves');
  const [totJogos] = await db.query('SELECT COUNT(*) qtd FROM jogos');
  const [ags] = await db.query(`SELECT m.nome, c.numero_chave, c.sub_categoria FROM chaves c JOIN modalidades m ON m.id = c.modalidade_id ORDER BY m.nome, c.sub_categoria, c.numero_chave`);
  console.log(`[sorteio] Total chaves=${totChaves[0].qtd}  jogos=${totJogos[0].qtd}`);
  const resumo = {};
  for (const a of ags) {
    const key = `${a.nome} (${a.sub_categoria})`;
    resumo[key] = (resumo[key] || 0) + 1;
  }
  for (const [k, v] of Object.entries(resumo)) console.log(`  - ${k}: ${v} chaves`);
}

async function faseAgenda() {
  const ORDEM_FASES = ['Oitavas', 'Quartas', 'Semifinal', 'Terceiro Lugar', 'Final'];
  const diaPorFase = { Oitavas: '2026-06-25', Quartas: '2026-06-25', Semifinal: '2026-06-26', 'Terceiro Lugar': '2026-06-26', Final: '2026-06-26' };
  const horaBasePorFase = { Oitavas: '08:00', Quartas: '08:30', Semifinal: '08:00', 'Terceiro Lugar': '15:00', Final: '17:00' };

  const [jogosElim] = await db.query(
    `SELECT j.id, j.modalidade_id, j.sub_categoria, j.fase, m.nome AS modalidade_nome
     FROM jogos j
     JOIN modalidades m ON m.id = j.modalidade_id
     WHERE j.fase IN (${ORDEM_FASES.map(() => '?').join(',')})
     ORDER BY m.nome, j.sub_categoria, FIELD(j.fase, 'Oitavas','Quartas','Semifinal','Terceiro Lugar','Final'), j.numero_jogo`,
    ORDEM_FASES
  );
  const contador = {};
  for (const j of jogosElim) {
    const chaveFase = `${j.fase}|${j.modalidade_id}|${j.sub_categoria}`;
    contador[chaveFase] = (contador[chaveFase] || 0) + 1;
    const indice = contador[chaveFase] - 1;
    const [hh, mm] = String(horaBasePorFase[j.fase] || '08:00').split(':').map(Number);
    const minutosTotal = hh * 60 + mm + indice * (j.fase === 'Quartas' ? 120 : 90);
    const hora = `${String(Math.floor(minutosTotal / 60)).padStart(2, '0')}:${String(minutosTotal % 60).padStart(2, '0')}:00`;
    await db.query(
      'UPDATE jogos SET data_hora = ? WHERE id = ?',
      [`${diaPorFase[j.fase]} ${hora}`, j.id]
    );
  }
  console.log(`[agenda] Eliminatórias agendadas: ${jogosElim.length} jogos (25-26/06/2026).`);
  await db.query('UPDATE jogos SET publicado = 1');
  console.log('[agenda] Jogos marcados como publicados (chaves visíveis na página principal).');
}

async function gerarPlacarParaJogo(jogo, { grupo }) {
  const id = Number(jogo.id);
  const casa = Number(jogo.casa);
  const fora = Number(jogo.fora);
  if (!casa || !fora) return null;
  const regras = obterRegras(jogo.modalidade_nome || '');
  const nome = String(jogo.modalidade_nome || '');

  if (regras && regras.temSets) {
    const basePts = /t[êe]nis/i.test(nome) ? 11 : 25;
    const apertado = grupo && rng() < 0.35;
    const vencedorCasa = (id % 2) === 0;
    const totalSets = apertado ? 5 : (rng() < 0.5 ? 3 : 4);
    const sets = [];
    let vitCasa = 0;
    let vitFora = 0;
    for (let i = 0; i < totalSets; i += 1) {
      const restanteCasa = 3 - vitCasa;
      const restanteFora = 3 - vitFora;
      const faltantes = totalSets - i;
      let casaLeva;
      if (restanteCasa === faltantes && restanteCasa > 0) casaLeva = true;
      else if (restanteFora === faltantes && restanteFora > 0) casaLeva = false;
      else if (i === totalSets - 1) casaLeva = restanteCasa > 0;
      else casaLeva = vencedorCasa ? rng() < 0.7 : rng() < 0.3;
      if (casaLeva) vitCasa += 1; else vitFora += 1;
      let p1;
      let p2;
      if (casaLeva) {
        p1 = basePts + intEntre(-2, 4);
        p2 = intEntre(3, Math.max(4, basePts - 6));
        if (p2 >= p1) p2 = p1 - 2;
      } else {
        p2 = basePts + intEntre(-2, 4);
        p1 = intEntre(3, Math.max(4, basePts - 6));
        if (p1 >= p2) p1 = p2 - 2;
      }
      sets.push({ numero: i + 1, pontos_1: p1, pontos_2: p2 });
    }
    const casaSets = sets.filter((s) => s.pontos_1 > s.pontos_2).length;
    const foraSets = sets.filter((s) => s.pontos_2 > s.pontos_1).length;
    return { placar1: casaSets, placar2: foraSets, sets };
  }

  const ehBasquete = /basquete/i.test(nome);
  const pontoMax = ehBasquete ? 90 : 6;
  if (grupo) {
    const perfil = (Number(jogo.chaveId || 0) + Number(jogo.modalidade_id)) % 3;
    const probEmpate = perfil === 0 ? 0.05 : perfil === 1 ? 0.55 : 0.25;
    if (rng() < probEmpate) {
      const base = intEntre(1, ehBasquete ? 45 : 2);
      return { placar1: base, placar2: base };
    }
  }
  const casaVence = (id % 2) === 0;
  let vencedorPts = intEntre(ehBasquete ? 55 : 2, pontoMax);
  let perdedorPts = vencedorPts - intEntre(1, ehBasquete ? 30 : 5);
  if (perdedorPts < 0) perdedorPts = 0;
  if (perdedorPts === vencedorPts) perdedorPts = Math.max(0, perdedorPts - 1);
  if (casaVence) return { placar1: vencedorPts, placar2: perdedorPts };
  return { placar1: perdedorPts, placar2: vencedorPts };
}

async function aplicarWOsFast(modalidadeId, sub, modalidadeNome) {
  const [grupos] = await db.query(
    `SELECT j.id, j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id
     FROM jogos j
     WHERE j.modalidade_id = ? AND j.sub_categoria = ? AND j.fase = 'Fase de Grupos'
       AND j.status <> 'Encerrado'
     ORDER BY j.id`,
    [modalidadeId, sub]
  );
  const elegiveis = grupos.filter((g) => {
    const c = Number(g.campus_1_id || g.atleta_1_id || 0);
    const f = Number(g.campus_2_id || g.atleta_2_id || 0);
    return c && f;
  });
  if (!elegiveis.length || (Number(modalidadeId) + String(sub).length) % 4 !== 0) return 0;
  const jogo = elegiveis[1] || elegiveis[0];
  const casa = Number(jogo.campus_1_id || jogo.atleta_1_id);
  const fora = Number(jogo.campus_2_id || jogo.atleta_2_id);
  const vencedor = (Number(jogo.id) % 2) === 0 ? casa : fora;
  const ehIndividual = Boolean(jogo.atleta_1_id && jogo.atleta_2_id);
  const p1 = vencedor === casa ? 1 : 0;
  const p2 = vencedor === casa ? 0 : 1;

  const [existe] = await db.query('SELECT jogo_id FROM resultados_coletivos WHERE jogo_id = ?', [jogo.id]);
  if (existe.length) {
    await db.query('UPDATE resultados_coletivos SET placar_1 = ?, placar_2 = ? WHERE jogo_id = ?', [p1, p2, jogo.id]);
  } else {
    await db.query('INSERT INTO resultados_coletivos (jogo_id, placar_1, placar_2) VALUES (?, ?, ?)', [jogo.id, p1, p2]);
  }
  if (ehIndividual) {
    await db.query("UPDATE jogos SET status = 'Encerrado', wo = 1, vencedor_atleta_id = ? WHERE id = ?", [vencedor, jogo.id]);
  } else {
    await db.query("UPDATE jogos SET status = 'Encerrado', wo = 1, vencedor_campus_id = ? WHERE id = ?", [vencedor, jogo.id]);
  }
  return 1;
}

async function salvarPlacarDireto(jogos, { grupo }) {
  for (const j of jogos) {
    const casa = Number(j.campus_1_id || j.atleta_1_id || 0);
    const fora = Number(j.campus_2_id || j.atleta_2_id || 0);
    if (!casa || !fora) continue;
    const dados = await gerarPlacarParaJogo({
      id: j.id,
      casa,
      fora,
      modalidade_id: j.modalidade_id,
      chaveId: j.chave_id,
      modalidade_nome: j.modalidade_nome
    }, { grupo });
    if (!dados) continue;

    const [existe] = await db.query('SELECT jogo_id FROM resultados_coletivos WHERE jogo_id = ?', [j.id]);
    if (existe.length) {
      await db.query('UPDATE resultados_coletivos SET placar_1 = ?, placar_2 = ? WHERE jogo_id = ?', [dados.placar1, dados.placar2, j.id]);
    } else {
      await db.query('INSERT INTO resultados_coletivos (jogo_id, placar_1, placar_2) VALUES (?, ?, ?)', [j.id, dados.placar1, dados.placar2]);
      await db.query('UPDATE jogos SET status = ? WHERE id = ?', ['Encerrado', j.id]);
    }
    if (Array.isArray(dados.sets) && dados.sets.length) {
      await db.query('DELETE FROM resultados_por_sets WHERE jogo_id = ?', [j.id]);
      for (const set of dados.sets) {
        await db.query(
          'INSERT INTO resultados_por_sets (jogo_id, numero_set, pontos_1, pontos_2) VALUES (?, ?, ?, ?)',
          [j.id, set.numero, set.pontos_1, set.pontos_2]
        );
      }
    }
  }
}

async function preencherModalidadeConfronto(modalidadeId) {
  const [modRows] = await db.query('SELECT nome FROM modalidades WHERE id = ?', [modalidadeId]);
  if (!modRows.length) return;
  const modalidadeNome = modRows[0].nome;
  if (/atletismo/i.test(modalidadeNome) || /xadrez/i.test(modalidadeNome)) return;

  const [subsRows] = await db.query(
    'SELECT DISTINCT sub_categoria FROM jogos WHERE modalidade_id = ? ORDER BY sub_categoria',
    [modalidadeId]
  );
  for (const subRow of subsRows) {
    const sub = String(subRow.sub_categoria || 'geral');
    await aplicarWOsFast(modalidadeId, sub, modalidadeNome);

    const [grupos] = await db.query(
      `SELECT j.*, m.nome AS modalidade_nome
       FROM jogos j
       JOIN modalidades m ON m.id = j.modalidade_id
       WHERE j.modalidade_id = ? AND j.sub_categoria = ? AND j.fase = 'Fase de Grupos'
         AND j.status <> 'Encerrado'
       ORDER BY j.numero_jogo`,
      [modalidadeId, sub]
    );
    await salvarPlacarDireto(grupos, { grupo: true });

    let salvos = await classificarEliminatoria(modalidadeId, sub);
    let rodadas = 1;
    while (salvos > 0 && rodadas < 10) {
      rodadas += 1;
      salvos = await classificarEliminatoria(modalidadeId, sub);
    }
  }
}

async function classificarEliminatoria(modalidadeId, sub) {
  await classificacaoService.recalcularClassificacaoModalidade(modalidadeId);
  await mataMataService.resolverEliminatoria(modalidadeId, sub);

  const [elim] = await db.query(
    `SELECT j.*, m.nome AS modalidade_nome
     FROM jogos j
     JOIN modalidades m ON m.id = j.modalidade_id
     WHERE j.modalidade_id = ? AND j.sub_categoria = ?
       AND j.fase IN ('Oitavas','Quartas','Semifinal','Terceiro Lugar','Final')
       AND j.status <> 'Encerrado'
     ORDER BY FIELD(j.fase,'Oitavas','Quartas','Semifinal','Terceiro Lugar','Final'), j.numero_jogo`,
    [modalidadeId, sub]
  );
  await salvarPlacarDireto(elim, { grupo: false });
  return elim.length;
}

async function preencherAtletismo(modalidadeId) {
  const provas = await ras.obterProvasPorModalidade(modalidadeId);
  const atletas = await ras.obterAtletasPorModalidade(modalidadeId);
  for (const prova of provas) {
    seed = seed ^ (Number(prova.id) * 7919);
    const formato = ras.normalizarFormato ? ras.normalizarFormato(prova.formato) : String(prova.formato || 'direta');
    const ehTempo = String(prova.tipo_resultado) === 'tempo';
    const nomeProva = String(prova.nome || '');

    let media = 60;
    let desvio = 30;
    if (ehTempo) {
      for (const [re, med, dev] of TEMPO_BASE) {
        if (nomeBC(nomeProva, re)) { media = med; desvio = dev; break; }
      }
    } else {
      media = 20;
      desvio = 10;
      for (const [re, med, dev] of MEDIDA_BASE) {
        if (nomeBC(nomeProva, re)) { media = med; desvio = dev; break; }
      }
    }

    let participantes = embaralhar(atletas).slice(0, Math.min(atletas.length, 24));
    const resultados = [];

    if (formato === 'baterias_com_final') {
      const numBaterias = participantes.length <= 9 ? 1 : 2;
      const chunk = Math.ceil(participantes.length / numBaterias);
      participantes = participantes.map((at, idx) => {
        const tempo = Math.max(media - desvio * 1.5, media + (rng() - 0.5) * 2 * desvio);
        return { atleta_id: at.id, tempo, numero_bateria: Math.floor(idx / chunk) + 1, numero_raia: (idx % chunk) + 1 };
      });
      const ordenados = [...participantes].sort((a, b) => a.tempo - b.tempo);
      const classificados = new Set(ordenados.slice(0, Math.min(8, ordenados.length)).map((p) => p.atleta_id));
      for (const at of participantes) {
        const isClassificado = classificados.has(at.atleta_id);
        resultados.push({
          atleta_id: at.atleta_id,
          numero_bateria: at.numero_bateria,
          numero_raia: at.numero_raia,
          resultado_tempo: tempoParaSql(at.tempo),
          classificado_final: isClassificado ? 'on' : '',
          resultado_tempo_final: isClassificado ? tempoParaSql(at.tempo * (0.97 + rng() * 0.02)) : ''
        });
      }
    } else {
      const ehDireta = formato === 'direta';
      const valores = participantes.map((at) => {
        const v = ehTempo
          ? Math.max(media - desvio * 1.5, media + (rng() - 0.5) * 2 * desvio)
          : Math.max(0.5, media + (rng() - 0.5) * 2 * desvio);
        return { atleta_id: at.id, valor: v };
      });
      const valoresOrdenados = [...valores].sort((a, b) => (ehTempo ? a.valor - b.valor : b.valor - a.valor));
      for (let idx = 0; idx < valoresOrdenados.length; idx += 1) {
        const item = valoresOrdenados[idx];
        const base = ehTempo
          ? { atleta_id: item.atleta_id, resultado_tempo: tempoParaSql(item.valor) }
          : { atleta_id: item.atleta_id, resultado_medida: Number(item.valor.toFixed(2)) };
        resultados.push(ehDireta ? { ...base, posicao_final: idx + 1 } : base);
      }
    }

    await ras.salvarResultadosProva(prova.id, resultados, formato);
  }
  await ras.publicarProvasModalidade(modalidadeId);
  console.log(`[resultados] Atletismo modalidade ${modalidadeId}: ${provas.length} provas preenchidas.`);
}

async function preencherXadrez(modalidadeId) {
  const atletas = await ras.obterAtletasPorModalidade(modalidadeId);
  const resultados = atletas.map((at) => {
    const forca = rng();
    let vitorias = 0;
    let empates = 0;
    let derrotas = 0;
    for (let r = 0; r < 5; r += 1) {
      const sorte = rng();
      if (sorte < forca * 0.75) vitorias += 1;
      else if (sorte < forca * 0.75 + 0.12) empates += 1;
      else derrotas += 1;
    }
    return {
      atleta_id: at.id,
      pontuacao: vitorias + empates * 0.5,
      vitorias,
      derrotas,
      empates
    };
  });
  await ras.salvarResultadosXadrez(modalidadeId, resultados);
  await ras.publicarResultadosXadrezModalidade(modalidadeId);
  console.log(`[resultados] Xadrez modalidade ${modalidadeId}: ${resultados.length} atletas pontuados.`);
}

async function faseResultados() {
  const [mods] = await db.query('SELECT id, nome FROM modalidades ORDER BY id');
  for (const m of mods) {
    const nome = String(m.nome || '');
    if (/atletismo/i.test(nome)) {
      await preencherAtletismo(m.id);
    } else if (/xadrez/i.test(nome)) {
      await preencherXadrez(m.id);
    } else {
      await preencherModalidadeConfronto(m.id);
    }
  }
  const [encerrados] = await db.query("SELECT COUNT(*) qtd FROM jogos WHERE status = 'Encerrado'");
  const [total] = await db.query('SELECT COUNT(*) qtd FROM jogos');
  console.log(`[resultados] Jogos encerrados: ${encerrados[0].qtd}/${total[0].qtd}.`);
}

async function fasePublish() {
  await jogoService.publicarTodosJogos();
  await classificacaoService.recalcularTodasClassificacoes();
  try {
    await boletimService.gerarBoletimFinal(2026);
    console.log('[publish] Boletim final 2026 gerado.');
  } catch (error) {
    console.warn('[publish] Boletim final: ', error.message);
  }
  const [publicados] = await db.query('SELECT COUNT(*) qtd FROM jogos WHERE publicado = 1');
  const [total] = await db.query('SELECT COUNT(*) qtd FROM jogos');
  const [chaves] = await db.query('SELECT COUNT(*) qtd FROM chaves');
  const [resultCos] = await db.query('SELECT COUNT(*) qtd FROM resultados_coletivos');
  const [xadrez] = await db.query('SELECT COUNT(*) qtd FROM resultados_xadrez');
  const [atletismo] = await db.query('SELECT COUNT(*) qtd FROM resultados_atletismo');
  console.log(`[publish] Jogos publicados ${publicados[0].qtd}/${total[0].qtd}; chaves=${chaves[0].qtd}; placares=${resultCos[0].qtd}; xadrez=${xadrez[0].qtd}; atletismo=${atletismo[0].qtd}.`);
}

(async () => {
  const rodar = async (nome, fn) => {
    if (FASE !== 'all' && FASE !== nome) return;
    console.log(`\n===== FASE ${nome} =====`);
    await fn();
  };

  await rodar('config', faseConfig);
  await rodar('campi', faseCampi);
  await rodar('sorteio', faseSorteio);
  await rodar('agenda', faseAgenda);
  await rodar('resultados', faseResultados);
  await rodar('publish', fasePublish);

  console.log('\nSimulação concluída.');
  await db.end();
  process.exit(0);
})().catch((error) => {
  console.error('ERRO na simulação:', error);
  process.exit(1);
});