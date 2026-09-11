const { obterRegras } = require('../utils/sportClassificationRules');
const { ordenarGrupoComDesempate } = require('./classificacaoService');

const FORMATO_VERSAO = 1;
const ETAPAS = ['dados', 'campi', 'modalidades', 'modalidade', 'revisao'];
const ETAPAS_MODALIDADE = ['participantes', 'grupos', 'confrontos', 'resultados'];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ID_INICIAL_MODALIDADE = 10001;

function normalizarNome(valor) {
  return String(valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extrairBase(nomeCompleto) {
  return String(nomeCompleto || '')
    .trim()
    .replace(/\s+(masculino|feminino|misto)$/i, '')
    .trim();
}

function gerarNomeCompleto(nome, genero) {
  const nomeBase = String(nome || '').trim();
  const generoBase = String(genero || '').trim();
  if (!nomeBase) return '';
  if (!generoBase) return nomeBase;
  if (nomeBase.toLowerCase().endsWith(generoBase.toLowerCase())) return nomeBase;
  return `${nomeBase} ${generoBase}`;
}

function construirLinhaGrupo(participanteId, campusNome, chaveIndice) {
  return {
    campus_id: Number(participanteId) || null,
    atleta_id: null,
    campus: String(campusNome || '').trim() || `Campus ${participanteId}`,
    chaveIndice,
    pontos: 0,
    jogos_jogados: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    pontos_pro: 0,
    pontos_contra: 0,
    saldo_pontuacao: 0,
    cartoes_amarelos: 0,
    cartoes_vermelhos: 0,
    sets_ganhos: 0,
    sets_perdidos: 0,
    excluicoes_2min: 0
  };
}

function jogoComResultado(jogo) {
  if (!jogo) return false;
  const statusTexto = String(jogo.status || '').trim();
  if (statusTexto === 'Agendado' || statusTexto === 'Cancelado') return false;
  if (Boolean(jogo.wo) && Number(jogo.vencedorId || 0)) return true;
  return Number(jogo.placarA) > 0 || Number(jogo.placarB) > 0;
}

function obterVencedorIndice(jogo, regras) {
  const idA = Number(jogo.participanteAId || 0);
  const idB = Number(jogo.participanteBId || 0);
  if (!idA || !idB) return null;
  if (String(jogo.status || '').trim() === 'Cancelado') return null;

  const vencedorWo = Number(jogo.vencedorId || 0);
  if (Boolean(jogo.wo)) {
    return vencedorWo === idA || vencedorWo === idB ? vencedorWo : null;
  }

  let pA = Number(jogo.placarA || 0);
  let pB = Number(jogo.placarB || 0);
  if (regras && regras.temSets) {
    let setsA = 0;
    let setsB = 0;
    for (const set of jogo.sets || []) {
      const p1 = Number(set.pontosA || set.pontos_1 || 0);
      const p2 = Number(set.pontosB || set.pontos_2 || 0);
      if (p1 > p2) setsA += 1;
      else if (p2 > p1) setsB += 1;
    }
    pA = setsA;
    pB = setsB;
  }
  if (pA > pB) return idA;
  if (pB > pA) return idB;
  return null;
}

/* Espelha a lógica de _aplicarClassificacaoJogo do projeto para um jogo isolado. */
function aplicarResultadoJogoNoMapa(mapa, jogo, regras) {
  const idA = Number(jogo.participanteAId || 0);
  const idB = Number(jogo.participanteBId || 0);
  const regraA = mapa.get(idA);
  const regraB = mapa.get(idB);
  if (!idA || !idB || !regraA || !regraB) return;
  if (!jogoComResultado(jogo)) return;

  const placar1 = Number(jogo.placarA || 0);
  const placar2 = Number(jogo.placarB || 0);

  let sets1 = 0;
  let sets2 = 0;
  if (regras.temSets) {
    for (const set of jogo.sets || []) {
      const p1 = Number(set.pontosA || set.pontos_1 || 0);
      const p2 = Number(set.pontosB || set.pontos_2 || 0);
      if (p1 > p2) sets1 += 1;
      else if (p2 > p1) sets2 += 1;
    }
  }

  const ehWO = Boolean(jogo.wo);
  const vencedorId = Number(jogo.vencedorId || 0);
  const id1Venceu = Boolean(vencedorId) && vencedorId === idA;

  function calcularPontosVolei(setsVencidos, setsPerdidos, isVencedor) {
    if (isVencedor) {
      if (setsPerdidos <= 1) return regras.pontuacaoVitoria3_0_3_1 || 3;
      if (setsPerdidos === 2) return regras.pontuacaoVitoria3_2 || 2;
      return regras.pontuacaoVitoria3_0_3_1 || 3;
    }
    if (setsVencidos >= 1 && setsPerdidos === 2) return regras.pontuacaoDerrota2_3 || 1;
    return regras.pontuacaoDerrota0_3_1_3 || 0;
  }

  let res1;
  let res2;

  if (regras.tipo === 'sets') {
    if (ehWO && vencedorId) {
      res1 = id1Venceu
        ? { pontos: regras.pontuacaoVitoria3_0_3_1 || 3, vitorias: 1, empates: 0, derrotas: 0 }
        : { pontos: regras.pontuacaoDerrota0_3_1_3 || 0, vitorias: 0, empates: 0, derrotas: 1 };
      res2 = id1Venceu
        ? { pontos: regras.pontuacaoDerrota0_3_1_3 || 0, vitorias: 0, empates: 0, derrotas: 1 }
        : { pontos: regras.pontuacaoVitoria3_0_3_1 || 3, vitorias: 1, empates: 0, derrotas: 0 };
    } else if (sets1 > sets2) {
      res1 = { pontos: calcularPontosVolei(sets1, sets2, true), vitorias: 1, empates: 0, derrotas: 0 };
      res2 = { pontos: calcularPontosVolei(sets2, sets1, false), vitorias: 0, empates: 0, derrotas: 1 };
    } else if (sets1 < sets2) {
      res1 = { pontos: calcularPontosVolei(sets1, sets2, false), vitorias: 0, empates: 0, derrotas: 1 };
      res2 = { pontos: calcularPontosVolei(sets2, sets1, true), vitorias: 1, empates: 0, derrotas: 0 };
    } else {
      res1 = { pontos: regras.pontuacaoEmpate || 0, vitorias: 0, empates: 1, derrotas: 0 };
      res2 = { pontos: regras.pontuacaoEmpate || 0, vitorias: 0, empates: 1, derrotas: 0 };
    }
  } else if (ehWO && vencedorId) {
    res1 = id1Venceu
      ? { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 }
      : { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
    res2 = id1Venceu
      ? { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 }
      : { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
  } else if (placar1 > placar2) {
    res1 = { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
    res2 = { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
  } else if (placar1 < placar2) {
    res1 = { pontos: regras.pontuacaoDerrota, vitorias: 0, empates: 0, derrotas: 1 };
    res2 = { pontos: regras.pontuacaoVitoria, vitorias: 1, empates: 0, derrotas: 0 };
  } else {
    res1 = { pontos: regras.pontuacaoEmpate, vitorias: 0, empates: 1, derrotas: 0 };
    res2 = { pontos: regras.pontuacaoEmpate, vitorias: 0, empates: 1, derrotas: 0 };
  }

  const atualizar = (linha, resultado, placarPro, placarContra, setsGanhos, setsPerdidos) => {
    linha.pontos += resultado.pontos;
    linha.jogos_jogados += 1;
    linha.vitorias += resultado.vitorias;
    linha.empates += resultado.empates;
    linha.derrotas += resultado.derrotas;
    linha.pontos_pro += placarPro;
    linha.pontos_contra += placarContra;
    linha.saldo_pontuacao = (linha.pontos_pro || 0) - (linha.pontos_contra || 0);
    linha.sets_ganhos += setsGanhos;
    linha.sets_perdidos += setsPerdidos;
  };

  atualizar(regraA, res1, placar1, placar2, sets1, sets2);
  atualizar(regraB, res2, placar2, placar1, sets2, sets1);
}

function calcularTabelaDoGrupo(jogosDoGrupo, participantesIds, campiMap, regras, chaveIndice) {
  const mapa = new Map();
  const linhas = (participantesIds || []).map((id) => {
    const campus = (campiMap.get(Number(id)) || {});
    const linha = construirLinhaGrupo(id, campus.nomeExibicao, chaveIndice);
    mapa.set(Number(id), linha);
    return linha;
  });

  for (const jogo of jogosDoGrupo || []) {
    aplicarResultadoJogoNoMapa(mapa, jogo, regras);
  }

  const jogosDb = (jogosDoGrupo || []).map((j) => ({
    campus_1_id: Number(j.participanteAId || 0),
    campus_2_id: Number(j.participanteBId || 0),
    placar_1: Number(j.placarA || 0),
    placar_2: Number(j.placarB || 0)
  }));

  ordenarGrupoComDesempate(linhas, regras, jogosDb);
  const listaOrdenada = [...linhas];
  listaOrdenada.forEach((linha, posicao) => {
    linha.posicao = posicao + 1;
  });
  return listaOrdenada;
}

/* Soma os pontos de todas as chaves para montar a classificação final da modalidade. */
function calcularClassificacaoGeral(mod) {
  const mapa = new Map();
  for (const linha of mod.tabela || []) {
    const chave = String(linha.campus || '').trim();
    if (!chave) continue;
    const atual = mapa.get(chave) || {
      campus: linha.campus,
      pontos: 0, jogos_jogados: 0, vitorias: 0, empates: 0, derrotas: 0,
      pontos_pro: 0, pontos_contra: 0, sets_ganhos: 0, sets_perdidos: 0
    };
    atual.pontos += Number(linha.pontos || 0);
    atual.jogos_jogados += Number(linha.jogos_jogados || 0);
    atual.vitorias += Number(linha.vitorias || 0);
    atual.empates += Number(linha.empates || 0);
    atual.derrotas += Number(linha.derrotas || 0);
    atual.pontos_pro += Number(linha.pontos_pro || 0);
    atual.pontos_contra += Number(linha.pontos_contra || 0);
    atual.sets_ganhos += Number(linha.sets_ganhos || 0);
    atual.sets_perdidos += Number(linha.sets_perdidos || 0);
    mapa.set(chave, atual);
  }
  return [...mapa.values()]
    .sort((a, b) =>
      (b.pontos - a.pontos) ||
      (b.vitorias - a.vitorias) ||
      ((b.pontos_pro - b.pontos_contra) - (a.pontos_pro - a.pontos_contra)) ||
      String(a.campus).localeCompare(String(b.campus))
    )
    .map((linha, index) => ({ ...linha, posicao: index + 1 }));
}

function obterPodioDaModalidade(mod, regras) {
  const jogos = mod.jogos || [];
  if (!jogos.length || !jogos.every((j) => jogoComResultado(j))) {
    return { campeao: null, vice: null, terceiro: null, completa: false };
  }
  const geral = calcularClassificacaoGeral(mod);
  return {
    campeao: (geral[0] && geral[0].campus) || null,
    vice: (geral[1] && geral[1].campus) || null,
    terceiro: (geral[2] && geral[2].campus) || null,
    completa: true
  };
}

function validarDadosGerais(campos) {
  const ano = Number(campos.ano);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error('Informe um ano válido entre 2000 e 2100.');
  }
  let dataInicio = String(campos.dataInicio || '').trim() || null;
  let dataFim = String(campos.dataFim || '').trim() || null;
  if (dataInicio && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) dataInicio = null;
  if (dataFim && !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) dataFim = null;
  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new Error('A data de início não pode ser posterior à data de fim.');
  }
  return { ano, dataInicio, dataFim };
}

function montarCampiSelecionados(campiAtuais, selecionadosIds, customForms) {
  const mapaCampus = new Map((campiAtuais || []).map((c) => [Number(c.id), c]));
  const resultado = [];
  const usados = new Set();

  for (const idRaw of selecionadosIds || []) {
    const id = Number(idRaw);
    if (!id || usados.has(id)) continue;
    const campus = mapaCampus.get(id);
    if (!campus) continue;
    usados.add(id);
    resultado.push({
      id,
      nome: campus.nome || campus.nomeExibicao,
      nomeExibicao: campus.nomeExibicao || campus.nome,
      slug: campus.slug || null,
      cor: campus.cor || null,
      cidade: campus.cidade || null,
      foto: campus.fotoPerfil || campus.foto_perfil || campus.foto || null
    });
  }

  const custom = (Array.isArray(customForms) ? customForms : []).map((form, index) => {
    const nomeExibicao = String(form.nome || '').trim();
    if (!nomeExibicao) return null;
    const id = 100000 + index + 1;
    return {
      id,
      nome: nomeExibicao,
      nomeExibicao,
      slug: String(form.slug || '').trim() || null,
      cor: String(form.cor || '#2980b9').trim(),
      cidade: String(form.cidade || '').trim() || null,
      foto: String(form.foto || form.fotoPerfil || '').trim() || null
    };
  }).filter(Boolean);

  return [...resultado, ...custom];
}

function montarModalidadesDoForm(linhas, proximoId) {
  let id = Number(proximoId || ID_INICIAL_MODALIDADE);
  const modalidades = [];
  for (const linha of linhas || []) {
    const nomeRaw = String(linha.nome || '').trim();
    if (!nomeRaw) continue;
    const genero = String(linha.genero || '').trim() || 'Masculino';
    const nome = gerarNomeCompleto(nomeRaw, genero);
    modalidades.push({
      id: id++,
      nome,
      base: extrairBase(nome),
      genero: genero.charAt(0).toUpperCase() + genero.slice(1).toLowerCase(),
      tipoConfronto: 'Coletivo',
      icone: String(linha.icone || '').trim() || null,
      formatoDisputa: 'grupos',
      etapaModalidade: 'participantes',
      finalizada: false,
      participantes: [],
      grupos: [],
      jogos: [],
      tabela: [],
      campeao: null,
      vice: null,
      terceiro: null
    });
  }
  return { modalidades, proximoId: id };
}

/* Chaves definidas pelo admin: nomes das chaves + qual chave cada campus participou. */
function montarGruposDoForm(nomesRaw, mapaCampusGrupo, participantesIds) {
  const participantes = (participantesIds || []).map((p) => Number(p)).filter(Boolean);
  const nomes = (Array.isArray(nomesRaw) ? nomesRaw : [])
    .map((n, i) => String(n || '').trim() || LETRAS[i] || `Chave ${i + 1}`);
  if (!nomes.length) nomes.push('A');

  const grupos = nomes.map((letra, indice) => ({ indice, letra, participantes: [] }));
  for (const id of participantes) {
    let gi = Number(mapaCampusGrupo[String(id)]);
    if (!Number.isInteger(gi) || gi < 0 || gi >= grupos.length) gi = 0;
    grupos[gi].participantes.push(id);
  }
  return grupos
    .filter((g) => g.participantes.length)
    .map((g, indice) => ({ indice, letra: g.letra, participantes: g.participantes }));
}

/* Confrontos definidos pelo admin. */
function montarConfrontosDoForm(body, grupos) {
  const casas = body['conf_casa'] || [];
  const foras = body['conf_fora'] || [];
  const gruposIdx = body['conf_grupo'] || [];
  const rodadas = body['conf_rodada'] || [];
  const datas = body['conf_data'] || [];
  const horarios = body['conf_horario'] || [];
  const locais = body['conf_local'] || [];

  const jogos = [];
  let id = 1;
  const total = Math.max(casas.length, foras.length, gruposIdx.length);
  for (let i = 0; i < total; i += 1) {
    const A = Number(casas[i] || 0);
    const B = Number(foras[i] || 0);
    if (!A && !B) continue;
    let gi = Number(gruposIdx[i] || 0);
    if (!Number.isInteger(gi) || gi < 0 || gi >= (grupos || []).length) gi = 0;
    jogos.push({
      id: id++,
      chaveIndice: gi,
      rodada: Math.max(1, Number(rodadas[i] || 1)),
      participanteAId: A || null,
      participanteBId: B || null,
      data: String(datas[i] || '').trim(),
      horario: String(horarios[i] || '').trim(),
      local: String(locais[i] || '').trim(),
      placarA: null,
      placarB: null,
      sets: [],
      wo: false,
      vencedorId: null,
      status: 'Agendado'
    });
  }
  return jogos;
}

function construirDadosEdicao(draft) {
  const campi = Array.isArray(draft.campi) ? draft.campi : [];
  const modalidades = Array.isArray(draft.modalidades) ? draft.modalidades : [];
  const mapaCampusId = new Map(campi.map((c) => [Number(c.id), c]));
  const ano = Number(draft.ano || 0);

  const modalidadesOut = modalidades.map((mod) => ({
    id: Number(mod.id),
    nome: mod.nome,
    base: mod.base || extrairBase(mod.nome),
    genero: mod.genero,
    tipoConfronto: 'Coletivo',
    formatoDisputa: 'grupos',
    icone: mod.icone || null
  }));

  const chaves = [];
  const grupos = [];
  const jogos = [];
  let contadorJogo = 1;

  for (const mod of modalidades) {
    const gruposMod = Array.isArray(mod.grupos) ? mod.grupos : [];
    for (let i = 0; i < gruposMod.length; i += 1) {
      chaves.push({
        id: i + 1,
        modalidadeId: Number(mod.id),
        numeroChave: i + 1,
        nomeChave: gruposMod[i].letra,
        subCategoria: 'geral'
      });
    }

    for (const linha of Array.isArray(mod.tabela) ? mod.tabela : []) {
      const chaveIndice = Number.isFinite(Number(linha.chaveIndice)) ? Number(linha.chaveIndice) : 0;
      const letraGrupo = (gruposMod[chaveIndice] && gruposMod[chaveIndice].letra) || 'Grande';
      grupos.push({
        modalidadeId: Number(mod.id),
        chaveId: chaveIndice + 1,
        grupo: letraGrupo,
        campusId: linha.campus_id || null,
        campus: linha.campus || null,
        atletaId: null,
        atleta: null,
        pontos: Number(linha.pontos || 0),
        jogosJogados: Number(linha.jogos_jogados || 0),
        vitorias: Number(linha.vitorias || 0),
        empates: Number(linha.empates || 0),
        derrotas: Number(linha.derrotas || 0),
        pontosPro: Number(linha.pontos_pro || 0),
        pontosContra: Number(linha.pontos_contra || 0),
        saldo: Number(linha.saldo_pontuacao || 0),
        cartoesAmarelos: Number(linha.cartoes_amarelos || 0),
        cartoesVermelhos: Number(linha.cartoes_vermelhos || 0),
        setsGanhos: Number(linha.sets_ganhos || 0),
        setsPerdidos: Number(linha.sets_perdidos || 0)
      });
    }

    const regras = obterRegras(mod.nome);
    for (const jg of Array.isArray(mod.jogos) ? mod.jogos : []) {
      const casa = mapaCampusId.get(Number(jg.participanteAId));
      const fora = mapaCampusId.get(Number(jg.participanteBId));
      const chaveIndice = Number.isFinite(Number(jg.chaveIndice)) ? Number(jg.chaveIndice) : 0;
      jogos.push({
        id: contadorJogo++,
        modalidadeId: Number(mod.id),
        modalidade: mod.nome,
        genero: mod.genero,
        tipoConfronto: 'Coletivo',
        tipoIndividual: false,
        fase: 'Fase de Grupos',
        rodada: Number(jg.rodada || 1),
        chaveId: (gruposMod[chaveIndice] ? chaveIndice + 1 : null),
        chave: (gruposMod[chaveIndice] && gruposMod[chaveIndice].letra) || null,
        subCategoria: 'geral',
        data: String(jg.data || '').trim(),
        horario: String(jg.horario || '').trim(),
        local: String(jg.local || '').trim(),
        status: String(jg.status || 'Agendado').trim(),
        publicado: 1,
        wo: Boolean(jg.wo),
        numeroJogo: null,
        casaId: jg.participanteAId || null,
        casa: (casa && casa.nomeExibicao) || null,
        foraId: jg.participanteBId || null,
        fora: (fora && fora.nomeExibicao) || null,
        atletaCasa: null,
        atletaFora: null,
        placarCasa: Number(jg.placarA || 0),
        placarFora: Number(jg.placarB || 0),
        sets: (jg.sets || []).map((s) => ({
          numero: s.numero,
          pontosCasa: Number(s.pontosA || s.pontos_1 || 0),
          pontosFora: Number(s.pontosB || s.pontos_2 || 0)
        })),
        vencedorCampus: obterVencedorIndice(jg, regras),
        rotuloCasa: null,
        rotuloFora: null,
        disputaPontos1: null,
        disputaPontos2: null,
        cancelado: false
      });
    }
  }

  const ranking = (() => {
    const porCampus = new Map();
    for (const g of grupos) {
      const campusNome = String(g.campus || '').trim();
      if (!campusNome) continue;
      const atual = porCampus.get(campusNome) || { campus: campusNome, pontos: 0 };
      atual.pontos += Number(g.pontos || 0);
      porCampus.set(campusNome, atual);
    }
    return [...porCampus.values()]
      .sort((a, b) => b.pontos - a.pontos || String(a.campus).localeCompare(String(b.campus)))
      .map((linha, index) => ({ posicao: index + 1, campus: linha.campus, pontos: linha.pontos }));
  })();

  const modalidadesBoletim = modalidadesOut.map((mod) => {
    const origem = modalidades.find((m) => Number(m.id) === Number(mod.id));
    const podio = (origem && (origem.campeao || origem.vice)) ? origem : null;
    return {
      nome: mod.nome,
      campeao: podio ? (origem.campeao || '—') : '—',
      vice: podio ? (origem.vice || '—') : '—'
    };
  });

  return {
    formatoVersao: FORMATO_VERSAO,
    ano,
    titulo: `JIFC ${ano}`,
    origem: 'importada',
    geradoEm: new Date().toISOString().slice(0, 10),
    campi,
    modalidades: modalidadesOut,
    chaves,
    grupos,
    jogos,
    boletim: {
      ranking,
      modalidades: modalidadesBoletim,
      dataGeracao: new Date().toISOString().slice(0, 10)
    }
  };
}

module.exports = {
  FORMATO_VERSAO,
  ETAPAS,
  ETAPAS_MODALIDADE,
  LETRAS,
  ID_INICIAL_MODALIDADE,
  normalizarNome,
  extrairBase,
  gerarNomeCompleto,
  construirLinhaGrupo,
  jogoComResultado,
  obterVencedorIndice,
  aplicarResultadoJogoNoMapa,
  calcularTabelaDoGrupo,
  calcularClassificacaoGeral,
  obterPodioDaModalidade,
  validarDadosGerais,
  montarCampiSelecionados,
  montarModalidadesDoForm,
  montarGruposDoForm,
  montarConfrontosDoForm,
  construirDadosEdicao
};