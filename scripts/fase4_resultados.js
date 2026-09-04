const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const dbPassword = process.env.DB_PASSWORD === '""' || process.env.DB_PASSWORD === "''" || !process.env.DB_PASSWORD ? '' : process.env.DB_PASSWORD;

const SETS_MODALIDADES = [5, 7, 8, 10, 12, 16]; // vôlei, vôlei de praia, tênis de mesa

// Gerador determinístico com seeds diferentes por chave (variação entre tabelas)
let seedGlobal = 987654321;
function rng() {
  seedGlobal = (seedGlobal * 1103515245 + 12345) & 0x7fffffff;
  return seedGlobal / 0x7fffffff;
}
function intEntre(min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

// Escolhe se um jogo da fase de grupos deve ser empate (origem de empate de pontos)
// Perfil por chave: alguns grupos "dominantes" (poucos empates), outros "equilibrados" (muitos empates).
function deveSerEmpateGrupo(grego, chaveId, modId) {
  if (!grego) return false;
  const perfil = (chaveId + modId) % 3; // 0=dominante, 1=equilibrado, 2=misto
  const prob = perfil === 0 ? 0.05 : perfil === 1 ? 0.55 : 0.25;
  return rng() < prob;
}

async function placarParaJogo(jogo, { grupo }) {
  const id = Number(jogo.id);
  const modId = Number(jogo.modalidade_id);
  const casa = Number(jogo.casa);
  const fora = Number(jogo.fora);
  if (!casa && !fora) return null;
  const usaSets = SETS_MODALIDADES.includes(modId);
  const ehEmpate = grupo && deveSerEmpateGrupo(grupo, jogo.chaveId || 0, modId);

  if (usaSets) {
    // melhor de 5 sets. Empate em sets não existe; para gerar empate de pontos
    // na tabela usamos jogos apertados 3x2 / 2x3 (2 pts e 1 pt).
    const apertado = grupo && rng() < 0.35;
    const vencedorCasa = (id % 2) === 0;
    const totalSets = apertado ? 5 : (rng() < 0.5 ? 3 : 4); // 3-0, 3-1 ou 3-2
    const sets = [];
    const basePts = modId >= 12 ? 11 : 21;
    // sequência de vencedores do set, garantindo 3 para o campeão do jogo
    const setVencedores = [];
    let vitCasa = 0, vitFora = 0;
    for (let i = 0; i < totalSets; i++) {
      const restanteCasaParaVencer = 3 - vitCasa;
      const restanteForaParaVencer = 3 - vitFora;
      let casaLeva;
      const faltantes = totalSets - i;
      if (restanteCasaParaVencer === faltantes && restanteCasaParaVencer > 0) casaLeva = true;
      else if (restanteForaParaVencer === faltantes && restanteForaParaVencer > 0) casaLeva = false;
      else if (i === totalSets - 1) {
        // último set decide: leva quem falta vencer
        casaLeva = restanteCasaParaVencer > 0;
      } else {
        casaLeva = vencedorCasa ? rng() < 0.7 : rng() < 0.3;
      }
      if (casaLeva) { vitCasa++; } else { vitFora++; }
      let p1, p2;
      if (casaLeva) { p1 = basePts + intEntre(-2, 4); p2 = intEntre(3, Math.max(4, basePts - 5)); if (p2 >= p1) p2 = p1 - 2; }
      else { p2 = basePts + intEntre(-2, 4); p1 = intEntre(3, Math.max(4, basePts - 5)); if (p1 >= p2) p1 = p2 - 2; }
      sets.push({ numero: i + 1, pontos_1: p1, pontos_2: p2 });
    }
    const casaSets = sets.filter((s) => s.pontos_1 > s.pontos_2).length;
    const foraSets = sets.filter((s) => s.pontos_2 > s.pontos_1).length;
    return { placar1: casaSets, placar2: foraSets, sets };
  }

  // gols / pontos (futsal, handebol, basquete)
  const pontoMax = modId === 2 || modId === 15 ? 90 : 6;
  if (ehEmpate) {
    const base = intEntre(1, modId === 2 || modId === 15 ? 50 : 2);
    return { placar1: base, placar2: base }; // empate -> 1 ponto cada
  }
  const casaVence = (id % 2) === 0;
  let vencedorPts = intEntre(modId === 2 || modId === 15 ? 60 : 2, pontoMax);
  let perdedorPts = Math.max(0, vencedorPts - intEntre(1, modId === 2 || modId === 15 ? 25 : 5));
  if (perdedorPts === vencedorPts) perdedorPts = Math.max(0, perdedorPts - 1);
  if (casaVence) return { placar1: vencedorPts, placar2: perdedorPts };
  return { placar1: perdedorPts, placar2: vencedorPts };
}

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'jifc',
    connectionLimit: 10
  });

  // Limpa resultados atuais e classificação (mantém jogos/chaves do sorteio)
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['resultados_xadrez', 'resultados_atletismo', 'resultados_por_sets', 'resultados_coletivos', 'cartoes', 'classificacao_grupos']) {
    try { await pool.query(`DELETE FROM ${t}`); } catch (e) {}
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  const juizService = require('../services/juizService');

  async function preencherModalidade(modalidadeId, subs) {
    for (const sub of subs) {
      // fase de grupos primeiro
      const [grupos] = await pool.query(
        `SELECT id, chave_id FROM jogos WHERE modalidade_id = ? AND sub_categoria = ? AND fase = 'Fase de Grupos' AND status <> 'Encerrado' ORDER BY numero_jogo`,
        [modalidadeId, sub]
      );
      for (const g of grupos) {
        const [j] = await pool.query('SELECT * FROM jogos WHERE id = ?', [g.id]);
        const dados = await placarParaJogo({
          id: j[0].id, casa: j[0].campus_1_id || j[0].atleta_1_id,
          fora: j[0].campus_2_id || j[0].atleta_2_id, modalidade_id: j[0].modalidade_id, chaveId: j[0].chave_id
        }, { grupo: true });
        if (dados) await juizService.salvarPlacar(j[0].id, { ...dados, status: 'Encerrado' });
      }
      // eliminatória (sempre decisiva, sem empate)
      const [elim] = await pool.query(
        `SELECT id FROM jogos WHERE modalidade_id = ? AND sub_categoria = ?
           AND fase NOT IN ('Fase de Grupos','A definir')
           AND status <> 'Encerrado'
         ORDER BY FIELD(fase,'Oitavas','Quartas','Semifinal','Terceiro Lugar','Final'), numero_jogo`,
        [modalidadeId, sub]
      );
      for (const e of elim) {
        const [j] = await pool.query('SELECT * FROM jogos WHERE id = ?', [e.id]);
        if (!Number(j[0].campus_1_id || j[0].atleta_1_id) || !Number(j[0].campus_2_id || j[0].atleta_2_id)) continue;
        const dados = await placarParaJogo({
          id: j[0].id, casa: j[0].campus_1_id || j[0].atleta_1_id,
          fora: j[0].campus_2_id || j[0].atleta_2_id, modalidade_id: j[0].modalidade_id
        }, { grupo: false });
        if (dados) await juizService.salvarPlacar(j[0].id, { ...dados, status: 'Encerrado' });
      }
    }
  }

  const mods = {
    '1': ['geral'], '2': ['geral'], '4': ['geral'], '5': ['geral'], '7': ['geral'],
    '8': ['geral'], '9': ['geral'], '10': ['geral'], '11': ['geral'], '15': ['geral'],
    '12': ['individual', 'dupla'], '16': ['individual', 'dupla']
  };
  for (const [modId, subs] of Object.entries(mods)) {
    await preencherModalidade(Number(modId), subs);
  }

  // ---- ATLETISMO dinâmico: vencedor varia por prova/campus ----
  const ras = require('../services/resultadosIndividuaisService');
  for (const atMod of [3, 6]) {
    const provas = await ras.obterProvasPorModalidade(atMod);
    const atletas = await ras.obterAtletasPorModalidade(atMod);
    provas.forEach((prova, pi) => {
      seedGlobal = seedGlobal ^ (pi * 7919);
    });
    let pi = 0;
    for (const prova of provas) {
      const formato = ras.normalizarFormato ? ras.normalizarFormato(prova.formato) : prova.formato;
      const isTempo = String(prova.tipo_resultado) === 'tempo';
      // embaralha a ordem dos atletas para essa prova (dinamismo)
      const embaralhado = [...atletas].slice();
      for (let k = embaralhado.length - 1; k > 0; k--) {
        const j2 = Math.floor(rng() * (k + 1));
        [embaralhado[k], embaralhado[j2]] = [embaralhado[j2], embaralhado[k]];
      }
      const participantes = embaralhado.slice(0, Math.min(embaralhado.length, 16 + intEntre(0, 4)));
      const resultados = participantes.map((at, idx) => {
        // varia o valor base por prova e por atleta para não favorecer sempre o mesmo campus
        const base = 9 + (pi % 4) * 1.5 + rng() * 6;
        return {
          atleta_id: at.id,
          ...(isTempo
            ? { resultado_tempo: (base + rng() * 2 + idx * 0.02).toFixed(2), posicao_final: idx + 1 }
            : { resultado_medida: Number((2.5 + rng() * 5).toFixed(2)), posicao_final: idx + 1 })
        };
      });
      await ras.salvarResultadosProva(prova.id, resultados, formato);
      pi += 1;
    }
    console.log('Atletismo modalidade', atMod, 'provas preenchidas (dinâmico)');
  }

  // ---- XADREZ variado (empates de pontuação) ----
  for (const [xMod, total] of [[13, 30], [14, 30]]) {
    const atletas = await ras.obterAtletasPorModalidade(xMod);
    const resultados = atletas.map((at, idx) => {
      const vitorias = Math.min(5, Math.max(0, 5 - Math.floor(rng() * 3)));
      const empates = intEntre(0, 2);
      const derrotas = Math.min(5, 5 - vitorias - empates >= 0 ? Math.max(0, 5 - vitorias - empates) : Math.floor(rng() * 3));
      return { atleta_id: at.id, pontuacao: vitorias + empates * 0.5, vitorias, derrotas, empates };
    });
    await ras.salvarResultadosXadrez(xMod, resultados);
    console.log('Xadrez modalidade', xMod, 'resultados preenchidos (variado)');
  }

  console.log('fase4-resultados-v2-ok');
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
