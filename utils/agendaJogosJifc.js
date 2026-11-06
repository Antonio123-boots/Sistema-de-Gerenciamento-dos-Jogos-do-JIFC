const DIAS_GRUPOS = ['2026-11-30', '2026-12-01'];
const DIA_ELIMINATORIAS = '2026-12-02';
const HORA_INICIAL = 8;
const HORA_FINAL = 21;
const MESAS_TENIS = 4;

const ORDEM_FASES = {
  Oitavas: 0,
  Quartas: 1,
  Semifinal: 2,
  'Terceiro Lugar': 3,
  Final: 4
};

function classificarModalidade(nome) {
  const normalizado = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalizado.includes('tenis de mesa')) return 'tenis-de-mesa';
  if (normalizado.includes('volei de praia')) return 'volei-de-praia';
  if (normalizado.includes('futsal')) return 'futsal';
  if (normalizado.includes('handebol')) return 'handebol';
  if (normalizado.includes('basquete')) return 'basquete';
  if (normalizado.includes('volei')) return 'volei';
  throw new Error(`Não há local genérico configurado para a modalidade "${nome}".`);
}

function nomeLocal(tipo, genero, mesa = null) {
  const generoLocal = String(genero || '').toLowerCase() === 'feminino' ? 'Feminino' : 'Masculino';
  if (tipo === 'tenis-de-mesa') return `Sala de Tênis de Mesa - Mesa ${mesa}`;
  if (tipo === 'volei-de-praia') return `Quadra de Areia - ${generoLocal}`;
  if (tipo === 'futsal') return `Ginásio - Futsal ${generoLocal}`;
  if (tipo === 'handebol') return `Ginásio - Handebol ${generoLocal}`;
  if (tipo === 'basquete') return `Ginásio - Basquete ${generoLocal}`;
  return `Ginásio - Vôlei ${generoLocal}`;
}

function formatarHorario(indiceSlot) {
  const hora = HORA_INICIAL + indiceSlot;
  if (hora > HORA_FINAL) {
    throw new Error(`A agenda excedeu ${HORA_FINAL}:00; revise a distribuição dos jogos existentes.`);
  }
  return `${String(hora).padStart(2, '0')}:00:00`;
}

function montarAgenda(jogos) {
  if (!Array.isArray(jogos) || jogos.length === 0) {
    throw new Error('Não há jogos existentes para agendar.');
  }
  if (new Set(jogos.map((jogo) => Number(jogo.id))).size !== jogos.length) {
    throw new Error('A lista de jogos contém IDs duplicados.');
  }

  const gruposPorModalidade = new Map();
  const eliminatoriasPorModalidade = new Map();
  const gruposTenisPorDia = new Map(DIAS_GRUPOS.map((dia) => [dia, []]));
  const eliminatoriasTenisPorFase = new Map();
  jogos.forEach((jogo) => {
    const modalidadeId = Number(jogo.modalidade_id);
    const modalidade = {
      modalidadeId,
      tipo: classificarModalidade(jogo.modalidade),
      genero: String(jogo.genero || '')
    };
    if (String(jogo.fase || '').trim() === 'Fase de Grupos') {
      if (!gruposPorModalidade.has(modalidadeId)) gruposPorModalidade.set(modalidadeId, []);
      gruposPorModalidade.get(modalidadeId).push({ ...jogo, ...modalidade });
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(ORDEM_FASES, String(jogo.fase || '').trim())) {
      throw new Error(`Fase não reconhecida no jogo ${jogo.id}: "${jogo.fase}".`);
    }
    if (!eliminatoriasPorModalidade.has(modalidadeId)) eliminatoriasPorModalidade.set(modalidadeId, []);
    eliminatoriasPorModalidade.get(modalidadeId).push({ ...jogo, ...modalidade });
  });

  const agenda = [];
  gruposPorModalidade.forEach((partidas) => {
    partidas.sort((a, b) => Number(a.rodada || 0) - Number(b.rodada || 0) || Number(a.id) - Number(b.id));
    const porDia = [[], []];
    partidas.forEach((partida, indice) => porDia[indice % DIAS_GRUPOS.length].push(partida));

    porDia.forEach((partidasDoDia, diaIndice) => {
    const data = DIAS_GRUPOS[diaIndice];
    if (partidasDoDia[0]?.tipo === 'tenis-de-mesa') {
      gruposTenisPorDia.get(data).push(...partidasDoDia);
      return;
    }
    partidasDoDia.forEach((partida, indice) => {
      const indiceSlot = indice;
      agenda.push({
        id: Number(partida.id),
        modalidadeId: partida.modalidadeId,
        fase: partida.fase,
        data,
        horario: formatarHorario(indiceSlot),
        local: nomeLocal(partida.tipo, partida.genero)
      });
    });
    });
  });

  gruposTenisPorDia.forEach((partidas, data) => {
    partidas.sort((a, b) => Number(a.rodada || 0) - Number(b.rodada || 0)
    || Number(a.modalidadeId) - Number(b.modalidadeId)
    || Number(a.id) - Number(b.id));
    partidas.forEach((partida, indice) => {
    agenda.push({
      id: Number(partida.id),
      modalidadeId: partida.modalidadeId,
      fase: partida.fase,
      data,
      horario: formatarHorario(Math.floor(indice / MESAS_TENIS)),
      local: nomeLocal(partida.tipo, partida.genero, (indice % MESAS_TENIS) + 1)
    });
    });
  });

  eliminatoriasPorModalidade.forEach((partidas) => {
    partidas.sort((a, b) => ORDEM_FASES[a.fase] - ORDEM_FASES[b.fase] || Number(a.id) - Number(b.id));
    let indiceNaFase = 0;
    let faseAtual = '';
    partidas.forEach((partida) => {
    if (partida.tipo === 'tenis-de-mesa') {
      if (!eliminatoriasTenisPorFase.has(partida.fase)) eliminatoriasTenisPorFase.set(partida.fase, []);
      eliminatoriasTenisPorFase.get(partida.fase).push(partida);
      return;
    }
    if (partida.fase !== faseAtual) {
      faseAtual = partida.fase;
      indiceNaFase = 0;
    }
    const deslocamentoFase = [0, 2, 7, 10, 12][ORDEM_FASES[partida.fase]];
    const indiceSlot = deslocamentoFase + indiceNaFase;
    agenda.push({
        id: Number(partida.id),
        modalidadeId: partida.modalidadeId,
        fase: partida.fase,
        data: DIA_ELIMINATORIAS,
        horario: formatarHorario(indiceSlot),
        local: nomeLocal(partida.tipo, partida.genero)
      });
      indiceNaFase += 1;
    });
  });

  eliminatoriasTenisPorFase.forEach((partidas, fase) => {
    partidas.sort((a, b) => Number(a.modalidadeId) - Number(b.modalidadeId) || Number(a.id) - Number(b.id));
    const deslocamentoFase = [0, 4, 6, 8, 9][ORDEM_FASES[fase]];
    partidas.forEach((partida, indice) => {
      agenda.push({
        id: Number(partida.id),
        modalidadeId: partida.modalidadeId,
        fase: partida.fase,
        data: DIA_ELIMINATORIAS,
        horario: formatarHorario(deslocamentoFase + Math.floor(indice / MESAS_TENIS)),
        local: nomeLocal(partida.tipo, partida.genero, (indice % MESAS_TENIS) + 1)
      });
    });
  });

  const jogoIds = new Set(jogos.map((jogo) => Number(jogo.id)));
  if (agenda.length !== jogos.length || new Set(agenda.map((jogo) => jogo.id)).size !== jogoIds.size
      || agenda.some((jogo) => !jogoIds.has(jogo.id))) {
    throw new Error('A agenda não corresponde exatamente aos jogos existentes; nenhuma alteração deve ser feita.');
  }

  return agenda.sort((a, b) => a.data.localeCompare(b.data)
    || a.horario.localeCompare(b.horario)
    || a.local.localeCompare(b.local)
    || a.id - b.id);
}

module.exports = {
  DIA_ELIMINATORIAS,
  DIAS_GRUPOS,
  HORA_FINAL,
  HORA_INICIAL,
  montarAgenda
};
