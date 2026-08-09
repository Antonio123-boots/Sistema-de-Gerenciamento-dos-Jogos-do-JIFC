const fs = require('fs');
const state = JSON.parse(fs.readFileSync('data/jifc-state.json', 'utf8'));
const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const obter = (mod, isInd) => {
  const campusState = state.campus || {};
  const inscricoesCampus = campusState.inscricoesCampus || campusState.inscricoes || {};
  const atletasCampus = Array.isArray(campusState.atletasCampus) ? campusState.atletasCampus : (Array.isArray(campusState.atletas) ? campusState.atletas : []);
  const modNorm = norm(mod);
  if (isInd) {
    const res = [];
    const vistos = new Set();
    for (const atleta of atletasCampus) {
      const modalidades = Array.isArray(atleta.modalidades)
        ? atleta.modalidades
        : (typeof atleta.modalidade === 'string' ? atleta.modalidade.split(',').map(i => i.trim()) : []);
      const esta = modalidades.some(m => norm(m) === modNorm);
      if (!esta) continue;
      const nomeAtleta = String(atleta.nome || atleta.nomeAtleta || 'Atleta não informado').trim();
      const nomeCampus = String(atleta.campus || '').trim() || 'Campus não informado';
      const chave = `${nomeAtleta}||${nomeCampus}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      res.push({ nomeAtleta, nomeCampus, numeroInscrito: null });
    }
    return res;
  }
  const res = [];
  const vistos = new Set();
  for (const [campusNome, modalidades] of Object.entries(inscricoesCampus)) {
    if (!Array.isArray(modalidades)) continue;
    const esta = modalidades.some(m => norm(m) === modNorm);
    if (!esta) continue;
    const nomeCampus = String(campusNome || '').trim();
    if (!nomeCampus || vistos.has(nomeCampus)) continue;
    vistos.add(nomeCampus);
    res.push({ nomeCampus });
  }
  return res;
};
const modalidades = ['Basquete Masculino','Futsal Masculino','Atletismo Masculino','Xadrez Masculino','Tênis de Mesa Masculino'];
for (const mod of modalidades) {
  const at = obter(mod, true);
  const ca = obter(mod, false);
  console.log(mod, 'ATLETAS', at.length, 'CAMPIS', ca.length);
  if (at.length < 10) console.log(at);
  if (ca.length < 10) console.log(ca);
}
