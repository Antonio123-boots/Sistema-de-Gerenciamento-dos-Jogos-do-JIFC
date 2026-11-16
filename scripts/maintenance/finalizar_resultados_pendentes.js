const db = require('../../config/db');
const juizService = require('../../services/juizService');
const mataMataService = require('../../services/mataMataService');
const { obterRegras } = require('../../utils/sportClassificationRules');

const FASE_ORDER = ['Fase de Grupos','Oitavas','Quartas','Semifinal','Terceiro Lugar','Final','Bateria Única','Eliminatória'];
function ordemFase(f){ const i = FASE_ORDER.indexOf(String(f||'').trim()); return i === -1 ? 99 : i; }

function resultadoPara(j){
  const regras = obterRegras(j.modalidade);
  if (regras.temSets) {
    if (j.id % 2 === 1) return { placar1: 2, placar2: 3, sets: [{numero:1,pontos_1:25,pontos_2:23},{numero:2,pontos_1:20,pontos_2:25},{numero:3,pontos_1:25,pontos_2:21},{numero:4,pontos_1:18,pontos_2:25},{numero:5,pontos_1:13,pontos_2:15}] };
    return { placar1: 3, placar2: 1, sets: [{numero:1,pontos_1:25,pontos_2:20},{numero:2,pontos_1:23,pontos_2:25},{numero:3,pontos_1:25,pontos_2:18},{numero:4,pontos_1:25,pontos_2:22}] };
  }
  const casaVence = j.id % 2 === 0;
  return { placar1: casaVence ? 3 : 1, placar2: casaVence ? 1 : 3, sets: [] };
}

(async()=>{
  try{
    for (let round = 0; round < 30; round++) {
      const [paresAll] = await db.query('SELECT DISTINCT modalidade_id, sub_categoria FROM jogos');
      for (const p of paresAll) { try { await mataMataService.resolverEliminatoria(p.modalidade_id, p.sub_categoria); } catch (_) {} }

      const [jogos] = await db.query(`SELECT j.id,j.fase,j.status,j.modalidade_id,j.sub_categoria,j.campus_1_id,j.campus_2_id,j.atleta_1_id,j.atleta_2_id,m.nome AS modalidade
        FROM jogos j JOIN modalidades m ON m.id=j.modalidade_id WHERE j.status <> 'Encerrado' ORDER BY j.id`);
      if (!jogos.length) break;
      jogos.sort((a,b)=>ordemFase(a.fase)-ordemFase(b.fase)||a.id-b.id);
      let prog = 0;
      for (const j of jogos) {
        const tem = (j.atleta_1_id && j.atleta_2_id) || (j.campus_1_id && j.campus_2_id);
        if (!tem) continue;
        const r = resultadoPara(j);
        await juizService.salvarPlacar(j.id, { placar1: r.placar1, placar2: r.placar2, sets: r.sets, status: 'Encerrado' });
        prog++;
      }
      console.log('round', round, 'preenchidos', prog);
      if (prog === 0) break;
    }
    const [rest] = await db.query("SELECT j.id,j.fase,j.status,j.campus_1_id,j.campus_2_id,j.atleta_1_id,j.atleta_2_id,m.nome modalidade FROM jogos j JOIN modalidades m ON m.id=j.modalidade_id WHERE j.status <> 'Encerrado' ORDER BY j.id");
    const [counts] = await db.query(`SELECT COUNT(*) total, SUM(status='Encerrado') enc, SUM(status='Agendado') ag FROM jogos`);
    const [ra] = await db.query('SELECT COUNT(*) c FROM resultados_atletismo');
    const [rx] = await db.query('SELECT COUNT(*) c FROM resultados_xadrez');
    const [rc] = await db.query('SELECT COUNT(*) c FROM resultados_coletivos');
    console.log('counts', JSON.stringify(counts[0]));
    console.log('resultados', JSON.stringify({atletismo: ra[0].c, xadrez: rx[0].c, coletivos: rc[0].c}));
    console.log('pendentes', rest.length, JSON.stringify(rest, null, 2));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
