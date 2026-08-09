const fs = require('fs');
const path = require('path');

const statePath = path.join(process.cwd(), 'data', 'jifc-state.json');
const backupPath = path.join(process.cwd(), 'data', 'jifc-state.json.bak');
fs.copyFileSync(statePath, backupPath);

const stateStore = require('../models/stateStore');
const pool = require('../config/db');
const campiCatalog = require('../models/campiCatalog');

const state = stateStore.readState();
state.campus = {
  inscricoesCampus: {
    'IFC Abelardo Luz': ['Futsal Masculino'],
    'IFC Blumenau': ['Voleibol Masculino']
  },
  atletasCampus: [{ id: 1, campus: 'IFC Abelardo Luz', campusSlug: 'abelardo-luz' }]
};
state.usuarios = { 'abelardo@ifc.edu.br': { nome: 'x' } };
state.campiCatalog = {
  defaultCampiSeeded: true,
  campi: [{ slug: 'abelardo-luz', nome: 'IFC Abelardo Luz', nomeExibicao: 'IFC Abelardo Luz', email: 'abelardo@ifc.edu.br' }]
};
stateStore.writeState(state);

pool.query = async (query) => {
  const q = String(query);
  if (q.includes('SELECT COUNT(*) AS total FROM campus')) return [[{ total: 1 }]];
  if (q.includes('SELECT id, nome, nome_exibicao, cidade, email, senha, slug, cor, foto_perfil, banned, ban_motivo FROM campus ORDER BY nome_exibicao ASC, nome ASC')) {
    return [[{ id: 1, nome: 'IFC Abelardo Luz', nome_exibicao: 'IFC Abelardo Luz', cidade: 'Abelardo Luz', email: 'abelardo@ifc.edu.br', senha: 'jifc2026', slug: 'abelardo-luz', cor: '#2980b9', foto_perfil: '/imagens/avatar.svg', banned: 0, ban_motivo: '' }]];
  }
  if (q.includes('SELECT id, nome, nome_exibicao, cidade, email, senha, slug, cor, foto_perfil, banned, ban_motivo FROM campus ORDER BY id ASC')) {
    return [[{ id: 1, nome: 'IFC Abelardo Luz', nome_exibicao: 'IFC Abelardo Luz', cidade: 'Abelardo Luz', email: 'abelardo@ifc.edu.br', senha: 'jifc2026', slug: 'abelardo-luz', cor: '#2980b9', foto_perfil: '/imagens/avatar.svg', banned: 0, ban_motivo: '' }]];
  }
  if (q.includes('SELECT COLUMN_NAME AS column_name')) return [[[]]];
  if (q.includes('SELECT id, nome, nome_exibicao, email, slug FROM campus WHERE')) return [[[]]];
  if (q.includes('DELETE FROM campus WHERE id = ?')) return [{ affectedRows: 1 }];
  if (q.includes('CREATE TABLE IF NOT EXISTS campus')) return [[]];
  return [[{}]];
};

(async () => {
  await campiCatalog.removerCampus('abelardo-luz');
  const updated = stateStore.readState();
  const ok = !updated.campus.inscricoesCampus['IFC Abelardo Luz'] && updated.campus.atletasCampus.length === 0 && !updated.usuarios['abelardo@ifc.edu.br'];
  console.log(JSON.stringify({ ok, campus: updated.campus, usuarios: updated.usuarios, campiCatalog: updated.campiCatalog }, null, 2));
  fs.copyFileSync(backupPath, statePath);
  fs.unlinkSync(backupPath);
})();
