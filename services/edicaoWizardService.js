const { obterRegras } = require('../utils/sportClassificationRules');
const { ordenarGrupoComDesempate, compararComDesempate } = require('./classificacaoService');
const { obterImagemPadraoModalidade } = require('./modalidadeService');
const { montarConfrontosDaChave } = require('./chaveamentoService');
const { montarEstruturaEliminatoria } = require('./mataMataService');

const FORMATO_VERSAO = 1;
const ETAPAS = ['dados', 'campi', 'modalidades', 'modalidade', 'revisao'];
const ETAPAS_MODALIDADE = ['participantes', 'grupos', 'confrontos', 'resultados', 'eliminatorias'];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ID_INICIAL_MODALIDADE = 10001;
const MODALIDADES_PADRAO_BASE = ['Atletismo', 'Futsal', 'Handebol', 'Tênis de Mesa', 'Voleibol', 'Vôlei de Praia', 'Xadrez'];
const PROVAS_ATLETISMO_WIZARD = [
  { nome: '100m rasos', tipo: 'tempo', final: true },
  { nome: '200m', tipo: 'tempo' },
  { nome: '400m', tipo: 'tempo' },
  { nome: '800m', tipo: 'tempo' },
  { nome: '1500m', tipo: 'tempo' },
  { nome: '3000m', tipo: 'tempo' },
  { nome: '5000m', tipo: 'tempo' },
  { nome: 'Peso', tipo: 'medida' },
  { nome: 'Dardo', tipo: 'medida' },
  { nome: 'Disco', tipo: 'medida' },
  { nome: 'Salto em Altura', tipo: 'medida' },
  { nome: 'Salto em Distância', tipo: 'medida' },
  { nome: 'Salto Triplo', tipo: 'medida' }
];

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

/* Regra do projeto: atletismo e xadrez não passam por sorteio/chaves (ver modalidadeService.isModalidadeSorteavel). */
function ehModalidadeIndividual(nome) {
  return /atletismo|xadrez/i.test(String(nome || ''));
}

function ehTenisDeMesa(nome) {
  return /t[êe]nis de mesa/i.test(String(nome || ''));
}

/* Tênis de mesa tem duas sub-etapas sequenciais: Individual e Em dupla. Cada uma percorre grupos/confrontos/resultados/eliminatórias próprios. */
function criarSubEtapasTenis() {
  return {
    individual: { grupos: [], jogos: [], tabela: [], campeao: null, vice: null, terceiro: null, finalizada: false, eliminatoria: null, etapaModalidade: 'participantes' },
    dupla: { grupos: [], jogos: [], tabela: [], campeao: null, vice: null, terceiro: null, finalizada: false, eliminatoria: null, etapaModalidade: 'participantes' }
  };
}

function criarProvasAtletismoWizard() {
  return PROVAS_ATLETISMO_WIZARD.map((prova, indice) => ({
    id: indice + 1,
    nome: prova.nome,
    tipo: prova.tipo,
    final: Boolean(prova.final),
    selecionada: false,
    resultados: [],
    finalistas: []
  }));
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

function calcularResultadosAtletismoWizard(mod) {
  const provas = Array.isArray(mod.provas) ? mod.provas : [];
  const pontosPorPosicao = [13, 8, 6, 5, 4, 3, 2, 1];
  for (const prova of provas) {
    const resultados = (Array.isArray(prova.resultados) ? prova.resultados : [])
      .filter((resultado) => resultado.atleta
        && String(resultado.valor ?? '').trim() !== ''
        && Number.isFinite(Number(resultado.valor)))
      .map((resultado) => ({ ...resultado, valor: Number(resultado.valor), bateria: Number(resultado.bateria) || 1 }));
    const ordenar = prova.tipo === 'tempo'
      ? (a, b) => a.valor - b.valor
      : (a, b) => b.valor - a.valor;
    resultados.sort(ordenar);
    resultados.forEach((resultado, index) => {
      resultado.posicao = index + 1;
      resultado.pontos = pontosPorPosicao[index] || 0;
    });
    if (prova.final) {
      const porBateria = new Map();
      for (const resultado of resultados) {
        if (!porBateria.has(resultado.bateria)) porBateria.set(resultado.bateria, []);
        porBateria.get(resultado.bateria).push(resultado);
      }
      for (const grupo of porBateria.values()) {
        grupo.sort(ordenar).forEach((resultado, index) => {
          resultado.posicao = index + 1;
          resultado.pontos = 0;
        });
      }
      prova.finalistas = [...porBateria.values()]
        .flatMap((grupo) => grupo.slice(0, 4))
        .sort(ordenar)
        .slice(0, 8)
        .map((resultado) => ({ ...resultado, pontos: 0, posicao: null, final: true }));
      const finaisComTempo = prova.finalistas.filter((resultado) =>
        resultado.valorFinal != null
        && String(resultado.valorFinal).trim() !== ''
        && Number.isFinite(Number(resultado.valorFinal))
      );
      finaisComTempo.sort((a, b) => Number(a.valorFinal) - Number(b.valorFinal));
      finaisComTempo.forEach((resultado, index) => {
        resultado.posicao = index + 1;
        resultado.pontos = pontosPorPosicao[index] || 0;
      });
    }
    prova.resultados = resultados;
  }
  return provas;
}

function calcularClassificacaoAtletismoWizard(mod) {
  const mapa = new Map();
  const atletas = new Map((mod.atletas || []).map((atleta) => [Number(atleta.id), atleta]));
  for (const prova of mod.provas || []) {
    if (!prova.selecionada) continue;
    const resultados = prova.final
      ? (prova.finalistas || [])
      : (prova.resultados || []);
    for (const resultado of resultados) {
      const pontos = Number(resultado.pontos || 0);
      if (!pontos) continue;
      const atleta = atletas.get(Number(resultado.atletaId)) || resultado;
      const campusId = Number(atleta.campusId || resultado.campusId || 0);
      if (!campusId) continue;
      const atual = mapa.get(campusId) || {
        campusId,
        campus: String(atleta.campus || '').trim(),
        pontos: 0,
        provas: 0
      };
      atual.pontos += pontos;
      atual.provas += 1;
      mapa.set(campusId, atual);
    }
  }
  return [...mapa.values()]
    .sort((a, b) => b.pontos - a.pontos || a.campus.localeCompare(b.campus))
    .map((linha, indice) => ({ ...linha, posicao: indice + 1 }));
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

/* ---------- Eliminatória (mata-mata) ---------- */

const SEEDING_16 = [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];

function obterCriteriosEntreChaves(regras) {
  const criteriosPrioritarios = ['pontos', 'saldo_gols', 'maior_gols_feitos'];
  const criteriosPosteriores = (regras.criteriosDesempate || [])
    .filter((criterio) => !criteriosPrioritarios.includes(criterio)
      && criterio !== 'confronto_direto'
      && criterio !== 'saldo_gols_empatadas'
      && criterio !== 'sorteio');
  return [...criteriosPrioritarios, ...criteriosPosteriores];
}

function ranquearEntreChaves(itens, regras) {
  if (!Array.isArray(itens) || itens.length < 2) return (itens || []).slice();
  const criterios = obterCriteriosEntreChaves(regras);
  return itens.slice().sort((a, b) => {
    const resultado = compararComDesempate(a, b, regras, new Map(), [], criterios, [a, b]);
    return resultado || Number(a.campus_id || a.atleta_id || 0) - Number(b.campus_id || b.atleta_id || 0);
  });
}

function obterColocadosPorPosicao(tabela, regras) {
  const porChave = new Map();
  for (const linha of tabela || []) {
    const ci = Number(linha.chaveIndice || 0);
    if (!porChave.has(ci)) porChave.set(ci, []);
    porChave.get(ci).push(linha);
  }
  const chaves = [...porChave.keys()].sort((a, b) => a - b);
  for (const lista of porChave.values()) {
    lista.sort((a, b) => Number(a.posicao || 0) - Number(b.posicao || 0));
  }
  const colocados = [];
  let posicao = 0;
  while (true) {
    const nivel = chaves.map((ci) => porChave.get(ci)[posicao]).filter(Boolean);
    if (!nivel.length) break;
    colocados.push(ranquearEntreChaves(nivel, regras));
    posicao += 1;
  }
  return { porChave, chaves, colocados };
}

function montarEstruturaEliminatoriaEstendida(quantidadeChaves) {
  const total = Number(quantidadeChaves);
  if (![5, 6, 7].includes(total)) {
    throw new Error(`Quantidade de chaves não suportada (${total}). Formatos disponíveis: 2, 3 ou 4 chaves.`);
  }
  const jogos = [];
  let rodadaAtual = 0;
  const criarJogo = (fase, rotuloCasa, rotuloFora) => {
    const numero = jogos.length + 1;
    jogos.push({ numero, fase, rodada: rodadaAtual, rotuloCasa, rotuloFora });
    return numero;
  };
  rodadaAtual += 1;
  const oitavas = [];
  for (let i = 0; i < SEEDING_16.length; i += 2) {
    oitavas.push(criarJogo('Oitavas', `S${SEEDING_16[i]}`, `S${SEEDING_16[i + 1]}`));
  }
  let atual = oitavas;
  while (atual.length > 2) {
    rodadaAtual += 1;
    const faseProxima = atual.length === 8 ? 'Quartas' : 'Semifinal';
    const proxima = [];
    for (let i = 0; i < atual.length; i += 2) {
      proxima.push(criarJogo(faseProxima, `V${atual[i]}`, `V${atual[i + 1]}`));
    }
    atual = proxima;
  }
  rodadaAtual += 1;
  criarJogo('Terceiro Lugar', `D${atual[0]}`, `D${atual[1]}`);
  criarJogo('Final', `V${atual[0]}`, `V${atual[1]}`);
  return { jogos };
}

function idParticipanteLinha(linha) {
  return linha ? Number(linha.campus_id || linha.atleta_id) || null : null;
}

function gerarEliminatoriaWizard(mod, regras, padrao) {
  const { porChave, chaves, colocados } = obterColocadosPorPosicao(mod.tabela || [], regras);
  const quantidadeChaves = chaves.length;
  if (quantidadeChaves < 2) {
    throw new Error('A eliminatória requer pelo menos 2 chaves definidas pelos confrontos.');
  }
  const suportadas = [2, 3, 4, 8];
  const estrutura = suportadas.includes(quantidadeChaves)
    ? montarEstruturaEliminatoria(padrao, quantidadeChaves)
    : montarEstruturaEliminatoriaEstendida(quantidadeChaves);

  let P = 4;
  while (P < quantidadeChaves * 2) P *= 2;
  const ranqueados = colocados.flat();
  const qualificados = ranqueados.slice(0, P).map(idParticipanteLinha);
  const qualificadoPorSeed = new Map();
  for (let i = 0; i < P && i < ranqueados.length; i += 1) {
    qualificadoPorSeed.set(i + 1, idParticipanteLinha(ranqueados[i]));
  }

  const origemDeNumero = new Map();
  for (const jg of estrutura.jogos) {
    if (!origemDeNumero.has(jg.rodada)) origemDeNumero.set(jg.rodada, []);
    const lista = origemDeNumero.get(jg.rodada);
    lista.push({ numero: jg.numero, rodada: jg.rodada, gi: lista.length });
  }
  const numeroOrigem = new Map();
  for (const [, lista] of origemDeNumero) {
    for (const item of lista) numeroOrigem.set(item.numero, item);
  }

  const resolverDireto = (rotulo) => {
    const texto = String(rotulo || '').trim().toUpperCase();
    let m = texto.match(/^([12])([A-Z])$/);
    if (m) {
      const ci = m[2].charCodeAt(0) - 65;
      return idParticipanteLinha((porChave.get(ci) || [])[Number(m[1]) - 1]);
    }
    m = texto.match(/^P([1-3])$/);
    if (m) return idParticipanteLinha((colocados[0] || [])[Number(m[1]) - 1]);
    m = texto.match(/^T([12])$/);
    if (m) return idParticipanteLinha((colocados[2] || [])[Number(m[1]) - 1]);
    m = texto.match(/^S(\d+)$/);
    if (m) return qualificadoPorSeed.get(Number(m[1])) || null;
    return undefined;
  };

  const resolverLado = (rotulo) => {
    const texto = String(rotulo || '').trim().toUpperCase();
    const direto = resolverDireto(texto);
    if (direto !== undefined) return { participante: direto, origem: null };
    const m = texto.match(/^([VD])(\d+)$/);
    if (m) {
      const fonte = numeroOrigem.get(Number(m[2]));
      if (fonte) return { participante: null, origem: { r: fonte.rodada, gi: fonte.gi, perdedor: m[1] === 'D' } };
    }
    return { participante: null, origem: null };
  };

  const elim = {
    avancantes: qualificados.filter((id) => id != null),
    jogos: [],
    fases: [],
    jogoTerceiro: null,
    campeao: null,
    vice: null,
    terceiro: null,
    finalizada: false
  };

  for (const s of estrutura.jogos) {
    const casa = resolverLado(s.rotuloCasa);
    const fora = resolverLado(s.rotuloFora);
    elim.jogos.push({
      id: Number(s.numero),
      fase: String(s.fase),
      rodada: Number(s.rodada),
      faseOrdem: Number(s.rodada),
      participanteAId: casa.participante,
      participanteBId: fora.participante,
      origemCasa: casa.origem,
      origemFora: fora.origem,
      data: '',
      horario: '',
      local: '',
      placarA: null,
      placarB: null,
      sets: [],
      wo: false,
      vencedorId: null,
      status: 'Agendado'
    });
  }

  const fasesMap = new Map();
  for (const jogo of elim.jogos) {
    if (jogo.fase === 'Terceiro Lugar') {
      elim.jogoTerceiro = jogo;
      continue;
    }
    if (!fasesMap.has(jogo.rodada)) fasesMap.set(jogo.rodada, { nome: jogo.fase, rodada: jogo.rodada, jogos: [] });
    fasesMap.get(jogo.rodada).jogos.push(jogo);
  }
  elim.fases = [...fasesMap.values()].sort((a, b) => a.rodada - b.rodada);

  return elim;
}

function jogoComParticipantes(jogo) {
  return Boolean(jogo && Number(jogo.participanteAId) && Number(jogo.participanteBId));
}

/* Propaga vencedores para as rodadas seguintes e monta a disputa do 3º lugar. */
function avancarEliminatoria(elim, regras) {
  if (!elim) return;
  const fases = Array.isArray(elim.fases) ? elim.fases : [];
  for (let r = 0; r < fases.length - 1; r += 1) {
    const jogos = fases[r].jogos || [];
    for (let gi = 0; gi < jogos.length; gi += 1) {
      const jogo = jogos[gi];
      if (!jogoComParticipantes(jogo)) continue;
      const vencedor = obterVencedorIndice(jogo, regras);
      if (vencedor == null) continue;
      const pai = (fases[r + 1].jogos || [])[Math.floor(gi / 2)];
      if (!pai) continue;
      if (gi % 2 === 0) {
        pai.participanteAId = vencedor;
        pai.origemCasa = null;
      } else {
        pai.participanteBId = vencedor;
        pai.origemFora = null;
      }
    }
  }

  if (elim.jogoTerceiro && fases.length >= 2) {
    const semis = (fases[fases.length - 2].jogos || []);
    if (semis.length === 2) {
      const w1 = obterVencedorIndice(semis[0], regras);
      const w2 = obterVencedorIndice(semis[1], regras);
      if (w1 != null && w2 != null) {
        elim.jogoTerceiro.participanteAId = Number(semis[0].participanteAId) === w1 ? semis[0].participanteBId : semis[0].participanteAId;
        elim.jogoTerceiro.participanteBId = Number(semis[1].participanteAId) === w2 ? semis[1].participanteBId : semis[1].participanteAId;
        elim.jogoTerceiro.origemCasa = null;
        elim.jogoTerceiro.origemFora = null;
      }
    }
  }
}

/* Pódio final da eliminatória: campeão e vice saem da final; terceiro da disputa do 3º lugar. */
function obterPodioEliminatoria(elim, regras) {
  const resposta = { campeao: null, vice: null, terceiro: null, completa: false };
  if (!elim || !Array.isArray(elim.fases) || !elim.fases.length) return resposta;
  const final = ((elim.fases[elim.fases.length - 1].jogos || [])[0]) || null;
  const vencedorFinal = final ? obterVencedorIndice(final, regras) : null;
  if (vencedorFinal == null) return resposta;
  resposta.campeao = vencedorFinal;
  resposta.vice = Number(final.participanteAId) === vencedorFinal ? final.participanteBId : final.participanteAId;
  if (elim.jogoTerceiro) {
    const vencedorTerceiro = obterVencedorIndice(elim.jogoTerceiro, regras);
    if (vencedorTerceiro == null) return resposta;
    resposta.terceiro = vencedorTerceiro;
  }
  resposta.completa = true;
  return resposta;
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
  if (!dataInicio || !dataFim) {
    throw new Error('Defina o período do evento (data de início e fim).');
  }
  if (dataInicio > dataFim) {
    throw new Error('A data de início não pode ser posterior à data de fim.');
  }
  return { ano, dataInicio, dataFim };
}

function gerarListaDatas(dataInicio, dataFim) {
  const lista = [];
  const start = String(dataInicio || '').slice(0, 10);
  const end = String(dataFim || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return lista;
  const inicio = new Date(`${start}T00:00:00`);
  const fim = new Date(`${end}T00:00:00`);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || inicio > fim) return lista;
  const formatar = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dia = new Date(inicio);
  while (dia <= fim) {
    lista.push(formatar(dia));
    dia.setDate(dia.getDate() + 1);
  }
  return lista;
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
      atletas: [],
      provas: /atletismo/i.test(nome) ? criarProvasAtletismoWizard() : [],
      resultadosXadrez: [],
      subEtapa: 'individual',
      subEtapasTenis: ehTenisDeMesa(nome) ? criarSubEtapasTenis() : null,
      eliminatoria: null,
      campeao: null,
      vice: null,
      terceiro: null
    });
  }
  return { modalidades, proximoId: id };
}

function montarModalidadesPadrao() {
  let id = ID_INICIAL_MODALIDADE;
  const modalidades = [];
  for (const base of MODALIDADES_PADRAO_BASE) {
    for (const genero of ['Masculino', 'Feminino']) {
      const nome = gerarNomeCompleto(base, genero);
      modalidades.push({
        id: id++,
        nome,
        base,
        genero,
        tipoConfronto: 'Coletivo',
        icone: obterImagemPadraoModalidade(nome),
        formatoDisputa: 'grupos',
        etapaModalidade: 'participantes',
        finalizada: false,
        participantes: [],
        grupos: [],
        jogos: [],
        tabela: [],
        atletas: [],
        provas: /atletismo/i.test(nome) ? criarProvasAtletismoWizard() : [],
        resultadosXadrez: [],
        subEtapa: 'individual',
        subEtapasTenis: ehTenisDeMesa(nome) ? criarSubEtapasTenis() : null,
        eliminatoria: null,
        campeao: null,
        vice: null,
        terceiro: null
      });
    }
  }
  return modalidades;
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

/* Importa na mesma regra de montarConfrontosDaChave (rodadas dentro de cada chave). */
function gerarJogosDasChaves(grupos) {
  const jogos = [];
  let id = 1;
  for (const grupo of grupos || []) {
    const ids = (grupo.participantes || []).map((p) => Number(p)).filter(Boolean);
    const confrontos = montarConfrontosDaChave(
      ids.map((pid) => ({ id: pid })),
      { tipoParticipante: 'campus' }
    );
    for (const conf of confrontos) {
      jogos.push({
        id: id++,
        chaveIndice: Number(grupo.indice),
        rodada: Number(conf.rodada || 1),
        participanteAId: conf.campus1Id || null,
        participanteBId: conf.campus2Id || null,
        data: '',
        horario: '',
        local: '',
        placarA: null,
        placarB: null,
        sets: [],
        wo: false,
        vencedorId: null,
        status: 'Agendado'
      });
    }
  }
  return jogos;
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
    const blocos = ehTenisDeMesa(mod.nome)
      ? ['individual', 'dupla']
          .map((subEtapa) => ({ subEtapa, bag: (mod.subEtapasTenis || {})[subEtapa] || {} }))
      : [{ subEtapa: 'geral', bag: mod }];

    for (const bloco of blocos) {
      const gruposMod = Array.isArray(bloco.bag.grupos) ? bloco.bag.grupos : [];
      for (let i = 0; i < gruposMod.length; i += 1) {
        chaves.push({
          id: i + 1,
          modalidadeId: Number(mod.id),
          numeroChave: i + 1,
          nomeChave: gruposMod[i].letra,
          subCategoria: bloco.subEtapa
        });
      }

      for (const linha of Array.isArray(bloco.bag.tabela) ? bloco.bag.tabela : []) {
        const chaveIndice = Number.isFinite(Number(linha.chaveIndice)) ? Number(linha.chaveIndice) : 0;
        const letraGrupo = (gruposMod[chaveIndice] && gruposMod[chaveIndice].letra) || 'Grande';
        grupos.push({
          modalidadeId: Number(mod.id),
          chaveId: chaveIndice + 1,
          grupo: letraGrupo,
          subCategoria: bloco.subEtapa,
          campusId: linha.campus_id || null,
          campus: linha.campus || null,
          atletaId: linha.atleta_id != null ? Number(linha.atleta_id) : (linha.campus_id != null && bloco.subEtapa === 'individual' ? Number(linha.campus_id) : null),
          atleta: linha.atleta || null,
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
      for (const jg of Array.isArray(bloco.bag.jogos) ? bloco.bag.jogos : []) {
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
          subCategoria: bloco.subEtapa,
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
          atletaCasa: jg.atletaCasa || null,
          atletaFora: jg.atletaFora || null,
          placarCasa: Number(jg.placarA || 0),
          placarFora: Number(jg.placarB || 0),
          sets: (jg.sets || []).map((s) => ({
            numero: s.numero,
            pontosCasa: Number(s.pontosA || s.pontos_1 || 0),
            pontosFora: Number(s.pontosB || s.pontos_2 || 0)
          })),
          vencedorCampus: obterVencedorIndice(jg, regras),
          rotuloCasa: jg.rotuloCasa || null,
          rotuloFora: jg.rotuloFora || null,
          disputaPontos1: null,
          disputaPontos2: null,
          cancelado: false
        });
      }

      const eliminatoria = bloco.bag.eliminatoria || {};
      for (const jg of Array.isArray(eliminatoria.jogos) ? eliminatoria.jogos : []) {
        const casa = mapaCampusId.get(Number(jg.participanteAId));
        const fora = mapaCampusId.get(Number(jg.participanteBId));
        jogos.push({
          id: contadorJogo++,
          modalidadeId: Number(mod.id),
          modalidade: mod.nome,
          genero: mod.genero,
          tipoConfronto: 'Coletivo',
          tipoIndividual: false,
          fase: String(jg.fase || 'Eliminatória'),
          rodada: Number(jg.rodada || 1),
          chaveId: null,
          chave: null,
          subCategoria: bloco.subEtapa,
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
          atletaCasa: jg.atletaCasa || null,
          atletaFora: jg.atletaFora || null,
          placarCasa: Number(jg.placarA || 0),
          placarFora: Number(jg.placarB || 0),
          sets: (jg.sets || []).map((s) => ({
            numero: s.numero,
            pontosCasa: Number(s.pontosA || s.pontos_1 || 0),
            pontosFora: Number(s.pontosB || s.pontos_2 || 0)
          })),
          vencedorCampus: obterVencedorIndice(jg, regras),
          rotuloCasa: jg.rotuloCasa || null,
          rotuloFora: jg.rotuloFora || null,
          disputaPontos1: null,
          disputaPontos2: null,
          cancelado: false
        });
      }
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

  const atletismo = modalidades
    .filter((mod) => /atletismo/i.test(mod.nome || ''))
    .map((mod) => ({
      modalidadeId: Number(mod.id),
      modalidadeGenero: mod.genero,
      provas: (mod.provas || [])
        .filter((prova) => Boolean(prova.selecionada))
        .map((prova) => {
          const base = prova.final ? (prova.finalistas || []) : (prova.resultados || []);
          return {
            id: Number(prova.id),
            nome: String(prova.nome || '').trim(),
            genero: mod.genero,
            final: Boolean(prova.final),
            resultados: (Array.isArray(base) ? base : []).map((r) => {
              const resultado = (prova.final && r.final)
                ? (r.valorFinal != null ? r.valorFinal : r.valor)
                : r.valor;
              return {
                atletaId: r.atletaId != null ? Number(r.atletaId) : (r.id != null ? Number(r.id) : null),
                atleta: String(r.atleta || '').trim(),
                campusId: r.campusId != null ? Number(r.campusId) : null,
                campus: String(r.campus || '').trim(),
                resultado: resultado != null && resultado !== '' ? String(resultado) : '',
                bateria: r.bateria != null ? Number(r.bateria) : null,
                posicao: r.posicao != null ? Number(r.posicao) : null,
                posicaoFinal: r.posicao != null ? Number(r.posicao) : null,
                pontos: Number(r.pontos || 0)
              };
            })
          };
        }),
      tabela: mod.tabelaAtletismo || []
    }))
    .filter((mod) => mod.provas.some((prova) => (prova.resultados || []).length));
  const xadrez = modalidades
    .filter((mod) => /xadrez/i.test(mod.nome || ''))
    .map((mod) => ({ modalidadeId: Number(mod.id), modalidadeGenero: mod.genero, classificacao: mod.resultadosXadrez || [] }))
    .filter((mod) => mod.classificacao.length);

  const dadosEdicao = {
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

  if (atletismo.length) dadosEdicao.atletismo = atletismo;
  if (xadrez.length) dadosEdicao.xadrez = xadrez;
  return dadosEdicao;
}

/* Dados prontos para a revisão: por modalidade, tabelas, TODOS os jogos e o pódio.
   Atletismo/xadrez não geram jogos, apenas provas/classificação + pódio. */
function construirRevisaoDasModalidades(dados) {
  const mapCampusId = new Map((dados.campi || []).map((c) => [Number(c.id), c]));
  const nomeCampus = (id) => {
    if (id === null || id === undefined || id === '') return null;
    const campus = mapCampusId.get(Number(id));
    return (campus && (campus.nomeExibicao || campus.nome)) || `Campus ${id}`;
  };

  const linhaDeTabela = (l) => ({
    posicao: l.posicao,
    campus: l.campus,
    pontos: l.pontos,
    pj: l.jogos_jogados,
    v: l.vitorias,
    e: l.empates,
    d: l.derrotas,
    gp: l.pontos_pro,
    gc: l.pontos_contra,
    sg: l.saldo_pontuacao,
    setsGanhos: l.sets_ganhos,
    setsPerdidos: l.sets_perdidos
  });

  const jogoDe = (j, fase) => ({
    fase: fase || null,
    rodada: j.rodada || 1,
    data: j.data || null,
    horario: j.horario || null,
    local: j.local || null,
    casa: nomeCampus(j.participanteAId),
    fora: nomeCampus(j.participanteBId),
    placarA: j.placarA,
    placarB: j.placarB,
    sets: (Array.isArray(j.sets) ? j.sets : []).map((s) => ({ pontosA: s.pontosA, pontosB: s.pontosB })),
    wo: Boolean(j.wo),
    status: j.status || 'Agendado'
  });

  const montarBlocoRevisao = (rotulo, bag, temSets) => {
    const tabelasPorChave = new Map();
    for (const l of Array.isArray(bag.tabela) ? bag.tabela : []) {
      const chave = String(l.chaveIndice || 0);
      if (!tabelasPorChave.has(chave)) tabelasPorChave.set(chave, []);
      tabelasPorChave.get(chave).push(linhaDeTabela(l));
    }
    const tabelas = [...tabelasPorChave.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([chave, linhas]) => ({
        rotuloChave: `Chave ${Number(chave) + 1}`,
        linhas: linhas.sort((a, b) => Number(a.posicao || 0) - Number(b.posicao || 0))
      }));

    const jogos = [];
    for (const j of Array.isArray(bag.jogos) ? bag.jogos : []) jogos.push(jogoDe(j, null));
    const elim = bag.eliminatoria || null;
    if (elim) {
      for (const fase of Array.isArray(elim.fases) ? elim.fases : []) {
        for (const j of Array.isArray(fase.jogos) ? fase.jogos : []) jogos.push(jogoDe(j, fase.nome));
      }
      if (elim.jogoTerceiro) jogos.push(jogoDe(elim.jogoTerceiro, 'Terceiro Lugar'));
    }

    return {
      rotulo: rotulo || null,
      temSets: Boolean(temSets),
      tabelas,
      jogos,
      podio: { campeao: bag.campeao || null, vice: bag.vice || null, terceiro: bag.terceiro || null },
      finalizada: Boolean(bag.finalizada)
    };
  };

  const montarRevisaoAtletismo = (mod) => {
    const provas = (Array.isArray(mod.provas) ? mod.provas : [])
      .filter((p) => p.selecionada)
      .map((p) => {
        const linhas = p.final ? (Array.isArray(p.finalistas) ? p.finalistas : []) : (Array.isArray(p.resultados) ? p.resultados : []);
        return {
          nome: p.nome,
          tipo: p.tipo,
          final: Boolean(p.final),
          resultados: linhas.map((r) => ({
            atleta: r.atleta || null,
            campus: nomeCampus(r.campusId) || r.campus || null,
            bateria: r.bateria,
            valor: r.valor,
            valorFinal: r.valorFinal,
            posicao: r.posicao,
            pontos: r.pontos
          }))
        };
      });
    const tabela = (Array.isArray(mod.tabelaAtletismo) ? mod.tabelaAtletismo : []).map((l) => ({
      posicao: l.posicao,
      campus: l.campus,
      pontos: l.pontos,
      provas: l.provas
    }));
    return { provas, tabela };
  };

  const montarRevisaoXadrez = (mod) => {
    const lista = (Array.isArray(mod.resultadosXadrez) ? mod.resultadosXadrez : [])
      .map((a) => ({
        atleta: a.nome,
        campus: a.campus || nomeCampus(a.campusId),
        vitorias: a.vitorias,
        derrotas: a.derrotas,
        empates: a.empates,
        pontuacao: a.pontuacao
      }))
      .sort((a, b) =>
        (Number(b.pontuacao || 0) - Number(a.pontuacao || 0)) ||
        (Number(b.vitorias || 0) - Number(a.vitorias || 0))
      );
    return lista.map((linha, indice) => ({ ...linha, posicao: indice + 1 }));
  };

  const porMod = [];
  for (const mod of Array.isArray(dados.modalidades) ? dados.modalidades : []) {
    const regras = obterRegras(mod.nome);
    const temSets = Boolean(regras && regras.temSets);
    const ehTenis = Boolean(mod.subEtapasTenis);
    const ehAtletismo = /atletismo/i.test(mod.nome || '');
    const ehXadrez = /xadrez/i.test(mod.nome || '');
    const base = {
      nome: mod.nome,
      genero: mod.genero || null,
      campeao: mod.campeao || null,
      vice: mod.vice || null,
      terceiro: mod.terceiro || null,
      finalizada: Boolean(mod.finalizada),
      ehTenis,
      ehAtletismo,
      ehXadrez,
      temSets,
      blocos: []
    };
    if (ehTenis) {
      const bags = mod.subEtapasTenis || {};
      base.blocos = [
        montarBlocoRevisao('Individual', bags.individual || {}, temSets),
        montarBlocoRevisao('Em dupla', bags.dupla || {}, temSets)
      ];
    } else if (ehAtletismo) {
      Object.assign(base, montarRevisaoAtletismo(mod));
    } else if (ehXadrez) {
      base.xadrez = montarRevisaoXadrez(mod);
    } else {
      base.blocos = [montarBlocoRevisao(null, mod, temSets)];
    }
    porMod.push(base);
  }
  return porMod;
}

module.exports = {
  FORMATO_VERSAO,
  ETAPAS,
  ETAPAS_MODALIDADE,
  LETRAS,
  ID_INICIAL_MODALIDADE,
  MODALIDADES_PADRAO_BASE,
  PROVAS_ATLETISMO_WIZARD,
  normalizarNome,
  extrairBase,
  gerarNomeCompleto,
  ehModalidadeIndividual,
  ehTenisDeMesa,
  criarSubEtapasTenis,
  criarProvasAtletismoWizard,
  calcularResultadosAtletismoWizard,
  calcularClassificacaoAtletismoWizard,
  construirLinhaGrupo,
  jogoComResultado,
  obterVencedorIndice,
  aplicarResultadoJogoNoMapa,
  calcularTabelaDoGrupo,
  calcularClassificacaoGeral,
  obterPodioDaModalidade,
  gerarEliminatoriaWizard,
  avancarEliminatoria,
  obterPodioEliminatoria,
  validarDadosGerais,
  gerarListaDatas,
  montarCampiSelecionados,
  montarModalidadesDoForm,
  montarModalidadesPadrao,
  montarGruposDoForm,
  gerarJogosDasChaves,
  montarConfrontosDoForm,
  construirDadosEdicao,
  construirRevisaoDasModalidades
};