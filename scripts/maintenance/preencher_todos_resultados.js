const db = require('../../config/db');
const { gerarResultadoDemonstrativo } = require('../../utils/resultadoDemonstrativoJogo');
const juizService = require('../../services/juizService');
const mataMataService = require('../../services/mataMataService');
const ris = require('../../services/resultadosIndividuaisService');
const { obterRegras } = require('../../utils/sportClassificationRules');

const FASE_ORDER = ['Fase de Grupos','Oitavas','Quartas','Semifinal','Terceiro Lugar','Final','Bateria ?nica','Eliminat?ria'];

function ordemFase(f) {
  const i = FASE_ORDER.indexOf(String(f||'').trim());
  return i === -1 ? 99 : i;
}

async function preencherJogosModalidade(modalidadeId, subCategoria) {
  let progressoTotal = 0;
  for (let rodada = 0; rodada < 30; rodada++) {
    try { await mataMataService.resolverEliminatoria(modalidadeId, subCategoria); } catch (_) {}
    const [jogos] = await db.query(
      `SELECT j.id, j.fase, j.status, j.modalidade_id, j.sub_categoria,
              j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
              m.nome AS modalidade, m.tipo_confronto
       FROM jogos j JOIN modalidades m ON m.id = j.modalidade_id
       WHERE j.modalidade_id = ? AND j.sub_categoria = ? AND j.status <> 'Encerrado'
       ORDER BY j.id ASC`,
      [modalidadeId, subCategoria]
    );
    if (!jogos.length) break;

    jogos.sort((a,b)=> ordemFase(a.fase)-ordemFase(b.fase) || a.id-b.id);
    let progresso = 0;
    for (const j of jogos) {
      const temParticipantes = (j.atleta_1_id && j.atleta_2_id) || (j.campus_1_id && j.campus_2_id);
      if (!temParticipantes) continue;

      let resultado = gerarResultadoDemonstrativo({ id: j.id, modalidade_id: j.modalidade_id, modalidade: j.modalidade, fase: j.fase });
      // gerarResultadoDemonstrativo retorna null para Final/Terceiro Lugar; gerar manualmente
      if (!resultado) {
        const regras = obterRegras(j.modalidade);
        if (regras.temSets) {
          if (j.id % 2 === 1) {
            resultado = { placar1: 2, placar2: 3, sets: [{numero:1,pontos_1:25,pontos_2:23},{numero:2,pontos_1:20,pontos_2:25},{numero:3,pontos_1:25,pontos_2:21},{numero:4,pontos_1:18,pontos_2:25},{numero:5,pontos_1:13,pontos_2:15}], vencedorLado: 2 };
          } else {
            resultado = { placar1: 3, placar2: 1, sets: [{numero:1,pontos_1:25,pontos_2:20},{numero:2,pontos_1:23,pontos_2:25},{numero:3,pontos_1:25,pontos_2:18},{numero:4,pontos_1:25,pontos_2:22}], vencedorLado: 1 };
          }
        } else {
          const casaVence = j.id % 2 === 0;
          resultado = { placar1: casaVence ? 3 : 1, placar2: casaVence ? 1 : 3, sets: [], vencedorLado: casaVence ? 1 : 2 };
        }
      }

      await juizService.salvarPlacar(j.id, {
        placar1: resultado.placar1,
        placar2: resultado.placar2,
        sets: resultado.sets || [],
        status: 'Encerrado'
      });
      progresso++; progressoTotal++;
    }
    try { await mataMataService.resolverEliminatoria(modalidadeId, subCategoria); } catch (_) {}
    if (progresso === 0) break;
  }
  return progressoTotal;
}

async function preencherAtletismoEXadrez() {
  // Atletismo
  try {
    const [mods] = await db.query("SELECT id, nome FROM modalidades WHERE LOWER(nome) LIKE '%atletismo%'");
    for (const mod of mods) {
      const provas = await ris.obterProvasPorModalidade(mod.id);
      const atletas = await ris.obterAtletasPorModalidade(mod.id);
      let preenchidas = 0;
      for (const prova of provas) {
        const existentes = await ris.obterResultadosPorProva(prova.id);
        if (existentes && existentes.length) continue;
        const formato = ris.normalizarFormato ? ris.normalizarFormato(prova.formato) : (prova.formato || 'direta');
        const isTempo = String(prova.tipo_resultado) === 'tempo';
        const lista = [...atletas];
        for (let k = lista.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [lista[k], lista[j]] = [lista[j], lista[k]]; }
        const participantes = lista.slice(0, Math.min(lista.length, 16));
        let resultados;
        if (isTempo && (formato === 'final_por_tempo' || formato === 'baterias_com_final')) {
          resultados = participantes.map((at, idx) => ({
            atleta_id: at.id,
            resultado_tempo: (10 + idx * 0.35 + (Math.random()*0.3)).toFixed(2),
            numero_bateria: Math.floor(idx/8)+1,
            numero_raia: (idx%8)+1,
            ...(formato === 'baterias_com_final' && idx < 8 ? { classificado_final: idx < 8 ? '1':'0', resultado_tempo_final: (10 + idx*0.2 + Math.random()*0.2).toFixed(2) } : {})
          }));
        } else {
          resultados = participantes.map((at, idx) => ({
            atleta_id: at.id,
            ...(isTempo ? { resultado_tempo: (10 + idx*0.3).toFixed(2) } : { resultado_medida: Number((8 - idx*0.2).toFixed(2)) }),
            posicao_final: idx + 1
          }));
        }
        await ris.salvarResultadosProva(prova.id, resultados, formato);
        preenchidas++;
      }
      if (preenchidas) console.log('atletismo resultados preenchidos:', mod.nome, preenchidas);
    }
  } catch (e) { console.log('atletismo skip:', e.message); }

  // Xadrez
  try {
    const [mods] = await db.query("SELECT id, nome FROM modalidades WHERE LOWER(nome) LIKE '%xadrez%'");
    for (const mod of mods) {
      const [count] = await db.query('SELECT COUNT(*) c FROM resultados_xadrez WHERE modalidade_id = ?', [mod.id]);
      if (Number(count[0].c) > 0) { console.log('xadrez ja tem resultados:', mod.nome); continue; }
      const atletas = await ris.obterAtletasPorModalidade(mod.id);
      const resultados = atletas.map((at, idx) => {
        const v = Math.max(0, 5 - Math.floor(idx/Math.max(1, Math.ceil(atletas.length/6))));
        const e = idx % 3 === 0 ? 1 : 0; const d = Math.max(0, 5 - v - e);
        return { atleta_id: at.id, pontuacao: v + e*0.5, vitorias: v, derrotas: d, empates: e };
      });
      await ris.salvarResultadosXadrez(mod.id, resultados);
      console.log('xadrez preenchido:', mod.nome, resultados.length);
    }
  } catch (e) { console.log('xadrez skip:', e.message); }
}

(async () => {
  try {
    const [pares] = await db.query("SELECT DISTINCT modalidade_id, sub_categoria FROM jogos ORDER BY modalidade_id, sub_categoria");
    let total = 0;
    for (const p of pares) {
      const n = await preencherJogosModalidade(p.modalidade_id, p.sub_categoria);
      total += n;
      if (n) console.log('preenchidos', p.modalidade_id, p.sub_categoria, n);
    }
    await preencherAtletismoEXadrez();
    // garantir que nada ficou pra tr?s
    const [rest] = await db.query("SELECT COUNT(*) c FROM jogos WHERE status <> 'Encerrado'");
    console.log('total_preenchidos_jogos', total, 'restantes_nao_encerrados', rest[0].c);
    console.log('done');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
