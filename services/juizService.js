const db = require('../config/db');
const mataMataService = require('./mataMataService');

const FASES_ELIMINATORIAS = new Set(['Oitavas', 'Quartas', 'Semifinal', 'Terceiro Lugar', 'Final']);
const FASES_PRECEDENTES = {
  'Oitavas': ['Fase de Grupos'],
  'Quartas': ['Oitavas', 'Fase de Grupos'],
  'Semifinal': ['Quartas', 'Oitavas', 'Fase de Grupos'],
  'Final': ['Semifinal', 'Quartas', 'Oitavas', 'Fase de Grupos'],
  'Terceiro Lugar': ['Semifinal', 'Quartas', 'Oitavas', 'Fase de Grupos']
};

async function resolverEliminatoriaDoJogo(jogoId) {
  try {
    const [rows] = await db.query('SELECT modalidade_id, sub_categoria FROM jogos WHERE id = ?', [Number(jogoId)]);
    if (rows.length) {
      await mataMataService.resolverEliminatoria(rows[0].modalidade_id, rows[0].sub_categoria);
    }
  } catch (error) {
    console.error('Erro ao resolver eliminatória:', error.message);
  }
}

async function faseAnteriorCompleta(modalidadeId, sub, faseAtual) {
  if (!FASES_ELIMINATORIAS.has(faseAtual)) return true;
  const precedentes = FASES_PRECEDENTES[faseAtual] || [];
  for (const faseAnterior of precedentes) {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'Encerrado' THEN 1 ELSE 0 END) AS encerrados
       FROM jogos WHERE modalidade_id = ? AND sub_categoria = ? AND fase = ?`,
      [modalidadeId, sub, faseAnterior]
    );
    if (rows[0].total > 0) {
      return Number(rows[0].total) === Number(rows[0].encerrados);
    }
  }
  return true;
}

const argon2 = require('argon2');
const { atualizarClassificacaoAposJogo } = require('./classificacaoService');
const { obterRegras, obterPlacarWo } = require('../utils/sportClassificationRules');
const { statusEfetivo } = require('../utils/jogoStatus');

function normalizarEsportes(esportes) {
  if (!esportes) return [];
  if (!Array.isArray(esportes)) esportes = [esportes];
  return [...new Set(esportes.map((e) => String(e || '').trim()).filter(Boolean))];
}

async function listarJuizes() {
  const [rows] = await db.query(
    'SELECT id, nome, email, foto_perfil, ativo, criado_em FROM juizes ORDER BY nome ASC'
  );

  for (const juiz of rows) {
    const [esportes] = await db.query(
      'SELECT esporte_nome FROM juiz_modalidade WHERE juiz_id = ? ORDER BY esporte_nome ASC',
      [juiz.id]
    );
    juiz.esportes = esportes.map((e) => e.esporte_nome);
  }

  return rows;
}

async function buscarJuizPorId(id) {
  const [rows] = await db.query(
    'SELECT id, nome, email, foto_perfil, ativo FROM juizes WHERE id = ?',
    [id]
  );
  const juiz = rows[0] || null;
  if (!juiz) return null;

  const [esportes] = await db.query(
    'SELECT esporte_nome FROM juiz_modalidade WHERE juiz_id = ?',
    [juiz.id]
  );
  juiz.esportes = esportes.map((e) => e.esporte_nome);
  return juiz;
}

async function cadastrarJuiz({ nome, email, senha, esportes = [] }) {
  const hash = await argon2.hash(senha);
  const [resultado] = await db.query(
    'INSERT INTO juizes (nome, email, senha) VALUES (?, ?, ?)',
    [nome, email, hash]
  );
  const juizId = resultado.insertId;

  const esportesNorm = normalizarEsportes(esportes);
  for (const esporte of esportesNorm) {
    await db.query(
      'INSERT INTO juiz_modalidade (juiz_id, esporte_nome) VALUES (?, ?)',
      [juizId, esporte]
    );
  }

  return juizId;
}

async function atualizarJuiz(id, { nome, email, senha, esportes = [] }) {
  const campos = [];
  const valores = [];

  if (nome) { campos.push('nome = ?'); valores.push(nome); }
  if (email) { campos.push('email = ?'); valores.push(email); }
  if (senha) {
    const hash = await argon2.hash(senha);
    campos.push('senha = ?'); valores.push(hash);
  }

  if (campos.length) {
    valores.push(id);
    await db.query(`UPDATE juizes SET ${campos.join(', ')} WHERE id = ?`, valores);
  }

  await db.query('DELETE FROM juiz_modalidade WHERE juiz_id = ?', [id]);
  const esportesNorm = normalizarEsportes(esportes);
  for (const esporte of esportesNorm) {
    await db.query(
      'INSERT INTO juiz_modalidade (juiz_id, esporte_nome) VALUES (?, ?)',
      [id, esporte]
    );
  }
}

async function excluirJuiz(id) {
  await db.query('DELETE FROM juiz_modalidade WHERE juiz_id = ?', [id]);
  await db.query('DELETE FROM juizes WHERE id = ?', [id]);
}

async function buscarJuizPorEmail(email) {
  const [rows] = await db.query(
    'SELECT id, nome, email, senha, foto_perfil, ativo FROM juizes WHERE email = ? AND ativo = TRUE',
    [email]
  );
  return rows[0] || null;
}

async function obterEsportesDoJuiz(juizId) {
  const [rows] = await db.query(
    'SELECT esporte_nome FROM juiz_modalidade WHERE juiz_id = ? ORDER BY esporte_nome ASC',
    [juizId]
  );
  return rows.map((r) => r.esporte_nome);
}

async function obterEsportesUnicos() {
  const [rows] = await db.query(
    `SELECT DISTINCT
       CASE
         WHEN nome LIKE '%Masculino%' THEN TRIM(REPLACE(nome, 'Masculino', ''))
         WHEN nome LIKE '%Feminino%' THEN TRIM(REPLACE(nome, 'Feminino', ''))
         ELSE nome
       END AS esporte
     FROM modalidades ORDER BY esporte ASC`
  );
  return rows.map((r) => r.esporte);
}

async function obterJogosPorEsporte(esporteNome, genero = null) {
  let whereClause = `(
       m.nome = ? OR
       m.nome = CONCAT(?, ' Masculino') OR
       m.nome = CONCAT(?, ' Feminino')
     )`;
  const params = [esporteNome, esporteNome, esporteNome];

  if (genero && genero !== 'Todos') {
    whereClause += ` AND m.genero = ?`;
    params.push(genero);
  }

  const [rows] = await db.query(
    `SELECT j.id, j.modalidade_id, j.sub_categoria, j.fase, j.rodada, j.status, j.data_hora, j.local_jogo,
            j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
            j.wo, j.vencedor_campus_id,
            j.rotulo_casa, j.rotulo_fora,
            j.disputa_pontos_1, j.disputa_pontos_2,
            m.nome AS modalidade, m.genero, m.tipo_confronto,
            c1.nome AS campus_1_nome, c1.nome_exibicao AS campus_1_exibicao, c1.foto_perfil AS foto_casa, c1.cor AS cor_casa,
            c2.nome AS campus_2_nome, c2.nome_exibicao AS campus_2_exibicao, c2.foto_perfil AS foto_fora, c2.cor AS cor_fora,
            a1.nome AS atleta_1_nome, a2.nome AS atleta_2_nome,
            rc.placar_1, rc.placar_2,
            chv.numero_chave AS chave_numero
     FROM jogos j
     JOIN modalidades m ON j.modalidade_id = m.id
     LEFT JOIN campus c1 ON j.campus_1_id = c1.id
     LEFT JOIN campus c2 ON j.campus_2_id = c2.id
     LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id
     LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id
     LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     LEFT JOIN chaves chv ON chv.id = j.chave_id
     WHERE ${whereClause}
     ORDER BY CASE WHEN j.fase IN ('Oitavas','Quartas','Semifinal','Final','Terceiro Lugar') THEN 1 ELSE 0 END,
              j.numero_jogo ASC, j.data_hora ASC, j.id ASC`,
    params
  );

  const jogosMapeados = await Promise.all(rows.map(async (j) => {
    const dataHora = j.data_hora ? new Date(j.data_hora) : null;
    const tipoIndividual = Boolean(j.atleta_1_id || j.atleta_2_id);
    const casaNome = tipoIndividual
      ? (j.atleta_1_nome || 'Atleta não informado')
      : (j.campus_1_exibicao || j.campus_1_nome || 'Campus não informado');
    const foraNome = tipoIndividual
      ? (j.atleta_2_nome || 'Atleta não informado')
      : (j.campus_2_exibicao || j.campus_2_nome || 'Campus não informado');

    let sets = [];
    try {
      const [setsRows] = await db.query(
        'SELECT numero_set, pontos_1, pontos_2 FROM resultados_por_sets WHERE jogo_id = ? ORDER BY numero_set ASC',
        [j.id]
      );
      sets = setsRows.map(s => ({ numero: s.numero_set, pontos_1: s.pontos_1, pontos_2: s.pontos_2 }));
    } catch (_) {
      sets = [];
    }

    const bloqueado = FASES_ELIMINATORIAS.has(j.fase) && j.status !== 'Encerrado'
      ? !(await faseAnteriorCompleta(j.modalidade_id, j.sub_categoria, j.fase))
      : false;

    return {
      id: j.id,
      fase: j.fase,
      rodada: j.rodada,
      status: statusEfetivo(j.status, j.data_hora),
      data: dataHora ? `${String(dataHora.getDate()).padStart(2, '0')}/${String(dataHora.getMonth() + 1).padStart(2, '0')}` : '—',
      horario: dataHora ? `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}` : '—',
      modalidade: j.modalidade,
      genero: j.genero,
      tipo_confronto: j.tipo_confronto,
      campus_1_id: j.campus_1_id || null,
      campus_2_id: j.campus_2_id || null,
      atleta_1_id: j.atleta_1_id || null,
      atleta_2_id: j.atleta_2_id || null,
      casa: casaNome,
      fora: foraNome,
      fotoCasa: j.foto_casa || '/imagens/avatar.svg',
      fotoFora: j.foto_fora || '/imagens/avatar.svg',
      corCasa: j.cor_casa || null,
      corFora: j.cor_fora || null,
      atletaCasa: j.atleta_1_nome || null,
      atletaFora: j.atleta_2_nome || null,
      tipoIndividual,
      rotuloCasa: j.rotulo_casa || null,
      rotuloFora: j.rotulo_fora || null,
      disputa_pontos_1: j.disputa_pontos_1,
      disputa_pontos_2: j.disputa_pontos_2,
      placar: (j.placar_1 != null && j.placar_2 != null) ? `${j.placar_1} x ${j.placar_2}` : null,
      placar_1: j.placar_1,
      placar_2: j.placar_2,
      localJogo: j.local_jogo || 'A definir',
      chaveNumero: j.chave_numero || null,
      wo: Boolean(j.wo),
      vencedor_campus_id: j.vencedor_campus_id || null,
      sets,
      temSets: obterRegras(j.modalidade).temSets,
      bloqueado
    };
  }));

  return jogosMapeados;
}

async function buscarJogoPorId(jogoId) {
  const [rows] = await db.query(
    `SELECT j.id, j.modalidade_id, j.sub_categoria, j.fase, j.rodada, j.status, j.data_hora, j.local_jogo,
            j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id,
            j.wo, j.vencedor_campus_id,
            j.rotulo_casa, j.rotulo_fora,
            j.disputa_pontos_1, j.disputa_pontos_2,
            m.nome AS modalidade, m.genero, m.tipo_confronto,
            c1.nome AS campus_1_nome, c1.nome_exibicao AS campus_1_exibicao, c1.foto_perfil AS foto_casa, c1.cor AS cor_casa,
            c2.nome AS campus_2_nome, c2.nome_exibicao AS campus_2_exibicao, c2.foto_perfil AS foto_fora, c2.cor AS cor_fora,
            a1.nome AS atleta_1_nome, a2.nome AS atleta_2_nome,
            rc.placar_1, rc.placar_2
     FROM jogos j
     JOIN modalidades m ON j.modalidade_id = m.id
     LEFT JOIN campus c1 ON j.campus_1_id = c1.id
     LEFT JOIN campus c2 ON j.campus_2_id = c2.id
     LEFT JOIN atletas a1 ON j.atleta_1_id = a1.id
     LEFT JOIN atletas a2 ON j.atleta_2_id = a2.id
     LEFT JOIN resultados_coletivos rc ON rc.jogo_id = j.id
     WHERE j.id = ?`,
    [jogoId]
  );
  const j = rows[0];
  if (!j) return null;

  const dataHora = j.data_hora ? new Date(j.data_hora) : null;
  const tipoIndividual = Boolean(j.atleta_1_id || j.atleta_2_id);
  const casaNome = tipoIndividual
    ? (j.atleta_1_nome || 'Atleta não informado')
    : (j.campus_1_exibicao || j.campus_1_nome || 'Campus não informado');
  const foraNome = tipoIndividual
    ? (j.atleta_2_nome || 'Atleta não informado')
    : (j.campus_2_exibicao || j.campus_2_nome || 'Campus não informado');

  let setsRows = [];
  try {
    const [rows] = await db.query(
      'SELECT numero_set, pontos_1, pontos_2 FROM resultados_por_sets WHERE jogo_id = ? ORDER BY numero_set ASC',
      [jogoId]
    );
    setsRows = rows;
  } catch (_) {
    setsRows = [];
  }

  const bloqueado = FASES_ELIMINATORIAS.has(j.fase) && j.status !== 'Encerrado'
    ? !(await faseAnteriorCompleta(j.modalidade_id, j.sub_categoria, j.fase))
    : false;

  return {
    id: j.id,
    fase: j.fase,
    rodada: j.rodada,
    status: statusEfetivo(j.status, j.data_hora),
    data: dataHora ? `${String(dataHora.getDate()).padStart(2, '0')}/${String(dataHora.getMonth() + 1).padStart(2, '0')}` : '—',
    horario: dataHora ? `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}` : '—',
    modalidade: j.modalidade,
    genero: j.genero,
    tipo_confronto: j.tipo_confronto,
    campus_1_id: j.campus_1_id || null,
    campus_2_id: j.campus_2_id || null,
    atleta_1_id: j.atleta_1_id || null,
    atleta_2_id: j.atleta_2_id || null,
    casa: casaNome,
    fora: foraNome,
    fotoCasa: j.foto_casa || '/imagens/avatar.svg',
    fotoFora: j.foto_fora || '/imagens/avatar.svg',
    corCasa: j.cor_casa || null,
    corFora: j.cor_fora || null,
    atletaCasa: j.atleta_1_nome || null,
    atletaFora: j.atleta_2_nome || null,
    tipoIndividual,
    rotuloCasa: j.rotulo_casa || null,
    rotuloFora: j.rotulo_fora || null,
    disputa_pontos_1: j.disputa_pontos_1,
    disputa_pontos_2: j.disputa_pontos_2,
    placar: (j.placar_1 != null && j.placar_2 != null) ? `${j.placar_1} x ${j.placar_2}` : null,
    placar_1: j.placar_1,
    placar_2: j.placar_2,
    localJogo: j.local_jogo || 'A definir',
    wo: Boolean(j.wo),
    vencedor_campus_id: j.vencedor_campus_id || null,
    sets: setsRows.map(s => ({ numero: s.numero_set, pontos_1: s.pontos_1, pontos_2: s.pontos_2 })),
    bloqueado
  };
}

async function salvarPlacar(jogoId, { placar1, placar2, status, sets, disputa1, disputa2 }) {
  const id = Number(jogoId || 0);
  if (!id) throw new Error('ID do jogo inválido.');

  const p1 = Number(placar1);
  const p2 = Number(placar2);

  const [existe] = await db.query('SELECT jogo_id FROM resultados_coletivos WHERE jogo_id = ?', [id]);
  if (existe.length) {
    await db.query(
      'UPDATE resultados_coletivos SET placar_1 = ?, placar_2 = ? WHERE jogo_id = ?',
      [p1, p2, id]
    );
  } else {
    await db.query(
      'INSERT INTO resultados_coletivos (jogo_id, placar_1, placar_2) VALUES (?, ?, ?)',
      [id, p1, p2]
    );
  }

  if (Array.isArray(sets) && sets.length > 0) {
    try {
      await db.query('DELETE FROM resultados_por_sets WHERE jogo_id = ?', [id]);
      for (const set of sets) {
        const num = Number(set.numero);
        const s1 = Number(set.pontos_1 || 0);
        const s2 = Number(set.pontos_2 || 0);
        if (num >= 1) {
          await db.query(
            'INSERT INTO resultados_por_sets (jogo_id, numero_set, pontos_1, pontos_2) VALUES (?, ?, ?, ?)',
            [id, num, s1, s2]
          );
        }
      }
    } catch (error) {
      throw new Error('Falha ao salvar o placar por sets: ' + error.message);
    }
  }

  if (status) {
    await db.query('UPDATE jogos SET status = ? WHERE id = ?', [status, id]);
  }

  const camposDisputa = [];
  const valoresDisputa = [];
  if (disputa1 !== undefined && disputa1 !== null && String(disputa1).trim() !== '') {
    camposDisputa.push('disputa_pontos_1 = ?');
    valoresDisputa.push(Number(disputa1));
  }
  if (disputa2 !== undefined && disputa2 !== null && String(disputa2).trim() !== '') {
    camposDisputa.push('disputa_pontos_2 = ?');
    valoresDisputa.push(Number(disputa2));
  }
  if (camposDisputa.length) {
    valoresDisputa.push(id);
    await db.query(`UPDATE jogos SET ${camposDisputa.join(', ')} WHERE id = ?`, valoresDisputa);
  }

  try {
    await atualizarClassificacaoAposJogo(id);
  } catch (error) {
    console.error('Erro ao atualizar classificação:', error.message);
  }

  if (status === 'Encerrado') {
    await resolverEliminatoriaDoJogo(id);
  }
}

async function atualizarStatusAutomatico() {
  await db.query(`
    UPDATE jogos
    SET status = 'Em Andamento'
    WHERE status = 'Agendado'
      AND data_hora <= NOW()
      AND publicado = 1
  `);
}

async function adiarJogo(jogoId, novaData, novaHora) {
  const id = Number(jogoId || 0);
  const data = String(novaData || '').trim();
  const hora = String(novaHora || '').trim();

  if (!id) throw new Error('ID do jogo inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida para o adiamento.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Horário inválido para o adiamento.');

  const [rows] = await db.query('SELECT status, wo FROM jogos WHERE id = ?', [id]);
  if (!rows.length) throw new Error('Jogo não encontrado.');
  if (rows[0].wo) throw new Error('Jogos finalizados por W.O. não podem ser adiados.');
  if (rows[0].status === 'Encerrado') throw new Error('Este jogo já foi encerrado e não pode ser adiado.');

  const dataHora = `${data} ${hora}:00`;
  await db.query('UPDATE jogos SET status = ?, data_hora = ? WHERE id = ?', ['Agendado', dataHora, id]);
}

async function aplicarWO(jogoId, vencedorSelecionado) {
  const id = Number(jogoId || 0);
  const vencedorId = Number(vencedorSelecionado || 0);
  if (!id) throw new Error('ID do jogo inválido.');
  if (!vencedorId) throw new Error('Selecione o vencedor do W.O.');

  const [rows] = await db.query(
    `SELECT j.id, j.campus_1_id, j.campus_2_id, j.atleta_1_id, j.atleta_2_id, j.status,
            m.nome AS modalidade_nome
     FROM jogos j
     JOIN modalidades m ON m.id = j.modalidade_id
     WHERE j.id = ?`,
    [id]
  );
  const jogo = rows[0];
  if (!jogo) throw new Error('Jogo não encontrado.');

  const confrontoIndividual = Boolean(jogo.atleta_1_id && jogo.atleta_2_id);
  if (confrontoIndividual) {
    if (vencedorId !== jogo.atleta_1_id && vencedorId !== jogo.atleta_2_id) {
      throw new Error('O participante selecionado não participa deste jogo.');
    }
  } else if (vencedorId !== jogo.campus_1_id && vencedorId !== jogo.campus_2_id) {
    throw new Error('O campus selecionado não participa deste jogo.');
  }

  const placarWo = obterPlacarWo(jogo.modalidade_nome);
  const vencedorEhCampus1 = confrontoIndividual
    ? vencedorId === jogo.atleta_1_id
    : vencedorId === jogo.campus_1_id;
  const placarFinal = {
    p1: vencedorEhCampus1 ? placarWo.p1 : placarWo.p2,
    p2: vencedorEhCampus1 ? placarWo.p2 : placarWo.p1
  };

  const [existe] = await db.query('SELECT jogo_id FROM resultados_coletivos WHERE jogo_id = ?', [id]);
  if (existe.length) {
    await db.query(
      'UPDATE resultados_coletivos SET placar_1 = ?, placar_2 = ? WHERE jogo_id = ?',
      [placarFinal.p1, placarFinal.p2, id]
    );
  } else {
    await db.query(
      'INSERT INTO resultados_coletivos (jogo_id, placar_1, placar_2) VALUES (?, ?, ?)',
      [id, placarFinal.p1, placarFinal.p2]
    );
  }

  if (Array.isArray(placarWo.sets) && placarWo.sets.length > 0) {
    try {
      await db.query('DELETE FROM resultados_por_sets WHERE jogo_id = ?', [id]);
      for (const set of placarWo.sets) {
        const pontos1 = vencedorEhCampus1 ? set.pontos_1 : set.pontos_2;
        const pontos2 = vencedorEhCampus1 ? set.pontos_2 : set.pontos_1;
        await db.query(
          'INSERT INTO resultados_por_sets (jogo_id, numero_set, pontos_1, pontos_2) VALUES (?, ?, ?, ?)',
          [id, set.numero || placarWo.sets.indexOf(set) + 1, pontos1, pontos2]
        );
      }
    } catch (_) {
      // tabela de sets pode não existir para esta modalidade
    }
  }

  if (confrontoIndividual) {
    await db.query(
      'UPDATE jogos SET status = ?, vencedor_atleta_id = ?, wo = 1 WHERE id = ?',
      ['Encerrado', vencedorId, id]
    );
  } else {
    await db.query(
      'UPDATE jogos SET status = ?, vencedor_campus_id = ?, wo = 1 WHERE id = ?',
      ['Encerrado', vencedorId, id]
    );
  }

  try {
    await atualizarClassificacaoAposJogo(id);
  } catch (error) {
    console.error('Erro ao atualizar classificação (W.O.):', error.message);
  }

  await resolverEliminatoriaDoJogo(id);
}

module.exports = {
  listarJuizes,
  buscarJuizPorId,
  cadastrarJuiz,
  atualizarJuiz,
  excluirJuiz,
  buscarJuizPorEmail,
  obterEsportesDoJuiz,
  obterEsportesUnicos,
  obterJogosPorEsporte,
  buscarJogoPorId,
  salvarPlacar,
  aplicarWO,
  adiarJogo,
  atualizarStatusAutomatico
};
