const { listarCampi } = require('../models/campiCatalog');
const wizardService = require('./edicaoWizardService');
const { obterRegras, obterPadraoEliminatoria } = require('../utils/sportClassificationRules');

const ANO_EXEMPLO = 2025;
const DATA_INICIO = '2025-06-26';
const DATA_FIM = '2025-06-28';
const DIAS_SLOTS = 7;

const SLUGS_CLASSIFICADOS = ['sombrio', 'camboriu', 'concordia', 'fraiburgo', 'ibirama', 'luzerna', 'riodosul', 'videira'];

const NOMES_ATLETAS = [
  'Ana Paula Ramos',
  'Bruno Carvalho',
  'Carla Menezes',
  'Diego Ferreira',
  'Eliane Duarte',
  'Fábio Nogueira',
  'Gabriela Souza',
  'Hélio Martins'
];

const NOMES_MASCULINOS = [
  'João Pedro da Silva', 'Lucas Gabriel Lima', 'Pedro Henrique Costa', 'Gabriel Santos Rocha',
  'Matheus Augusto Mendes', 'Rafael Oliveira Campos', 'Felipe Carvalho Teixeira', 'Thiago Ramos Barbosa',
  'Bruno Moreira Farias', 'Vinícius Azevedo Sales', 'Diego Machado Freitas', 'André Nogueira Cavalcanti',
  'Henrique Correia Fontes', 'Caio Siqueira Moraes', 'Rodrigo Batista Peixoto', 'Eduardo Chaves Mattos'
];

const NOMES_FEMININOS = [
  'Maria Clara Souza', 'Ana Beatriz Oliveira', 'Larissa Fernanda Alves', 'Juliana Martins Pereira',
  'Camila Rodrigues Nunes', 'Beatriz Andrade Ribeiro', 'Isabela Ferreira Dias', 'Letícia Moura Cardoso',
  'Marina Tavares Pinto', 'Carolina Duarte Barros', 'Patrícia Rocha Monteiro', 'Sabrina Pires Antunes',
  'Talita Lopes Corrêa', 'Renata Guedes Viana', 'Priscila Noronha Bastos', 'Natália Rezende Parra'
];

function selecionarNomesAtletas(seed, genero, qtde) {
  const lista = /feminino/i.test(String(genero || '')) ? [...NOMES_FEMININOS] : [...NOMES_MASCULINOS];
  const rng = criarSorte(Number(seed) || 0);
  const escolhidos = [];
  const pilha = [...lista].sort((a, b) => a.localeCompare(b));
  while (escolhidos.length < Number(qtde) && pilha.length) {
    const idx = Math.floor(rng() * pilha.length);
    escolhidos.push(pilha.splice(idx, 1)[0]);
  }
  return escolhidos;
}

function criarSorte(seed) {
  let a = Number(seed) >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function somarDias(data, dias) {
  const d = new Date(`${String(data).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(dias || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasEntre(dataA, dataB) {
  const ini = new Date(`${String(dataA).slice(0, 10)}T00:00:00`);
  const fim = new Date(`${String(dataB).slice(0, 10)}T00:00:00`);
  return Math.max(0, Math.round((fim - ini) / 86400000));
}

function ondeDia(dataInicio, dataFim, seq, total) {
  const span = diasEntre(dataInicio, dataFim);
  if (span <= 0) return somarDias(dataInicio, 0);
  const passo = Math.min(total - 1, Math.max(0, Number(seq) || 0));
  const indice = total > 1 ? Math.round((passo / (total - 1)) * span) : 0;
  return somarDias(dataInicio, Math.min(span, Math.max(0, indice)));
}

function temParticipantes(jogo) {
  return Boolean(jogo && Number(jogo.participanteAId) && Number(jogo.participanteBId));
}

function nomeCampus(map, id) {
  const c = map.get(Number(id));
  return (c && (c.nomeExibicao || c.nome)) || `Campus ${id}`;
}

function montarCampiRascunho(campi) {
  return campi.map((c) => ({
    id: Number(c.id),
    nome: c.nome,
    nomeExibicao: c.nomeExibicao,
    slug: c.slug,
    cor: c.cor,
    cidade: c.cidade,
    foto: c.fotoPerfil || c.foto || '/imagens/avatar.svg'
  }));
}

function normalizarChave(valor) {
  return String(valor || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

function selecionarCampi(campiAtuais) {
  const alvoMap = new Map(SLUGS_CLASSIFICADOS.map((alvo) => [alvo, null]));
  for (const campus of campiAtuais || []) {
    const campos = [campus.nomeExibicao, campus.nome, campus.slug].map((v) => ` ${normalizarChave(v)} `);
    for (const alvo of SLUGS_CLASSIFICADOS) {
      if (campos.some((texto) => texto.includes(` ${alvo} `))) {
        if (!alvoMap.get(alvo)) alvoMap.set(alvo, campus);
      }
    }
  }
  if (!alvoMap.get('sombrio')) {
    throw new Error('O campus "Sombrio" não foi encontrado no catálogo de campi.');
  }
  const pool = [];
  for (const alvo of SLUGS_CLASSIFICADOS) {
    const campus = alvoMap.get(alvo);
    if (campus && !pool.includes(campus)) pool.push(campus);
  }
  if (pool.length < 4) {
    throw new Error('Não há campi suficientes para preencher o exemplo.');
  }
  return pool;
}

function ordenarComSombrioPrimeiro(campi) {
  const lista = [...(campi || [])];
  const indice = lista.findIndex((c) => /sombrio/i.test(normalizarChave(String(c.nomeExibicao || c.nome || c.slug))));
  if (indice > 0) {
    const [sombrio] = lista.splice(indice, 1);
    lista.unshift(sombrio);
  }
  return lista;
}

async function montarOrigemCampi(opcoesCampi, campiAtuais) {
  let origem;
  if (Array.isArray(opcoesCampi) && opcoesCampi.length) {
    const ids = new Set(opcoesCampi.map((c) => Number(c.id)));
    origem = campiAtuais.filter((c) => ids.has(Number(c.id)));
    if (origem.length < 4) {
      throw new Error('Não há campi suficientes para preencher o exemplo.');
    }
    if (!origem.some((c) => /sombrio/i.test(normalizarChave(String(c.nomeExibicao || c.nome || c.slug))))) {
      throw new Error('O campus "Sombrio" não está entre os campi selecionados para o exemplo.');
    }
  } else {
    origem = selecionarCampi(campiAtuais);
  }
  origem = completarPool(origem, campiAtuais);
  return { campi: montarCampiRascunho(origem), pool: ordenarComSombrioPrimeiro(origem) };
}

function completarPool(origem, campiAtuais) {
  const lista = [...(origem || [])];
  if (lista.length >= 12) return lista;
  const jaTem = new Set(lista.map((c) => Number(c.id)));
  for (const c of campiAtuais || []) {
    if (jaTem.has(Number(c.id))) continue;
    lista.push(c);
    jaTem.add(Number(c.id));
    if (lista.length >= 12) break;
  }
  return lista;
}

function gerarSetsComparados(alvo, aVence, rng) {
  const doisZero = rng() < 0.6;
  const pontosDoSet = (vencedor) => {
    const w = alvo + Math.floor(rng() * 5);
    const l = Math.max(0, w - 2 - Math.floor(rng() * 3));
    return vencedor ? { pontosA: w, pontosB: l } : { pontosA: l, pontosB: w };
  };
  const primeiro = pontosDoSet(true);
  const sets = [{ numero: 1, pontosA: primeiro.pontosA, pontosB: primeiro.pontosB }];
  if (doisZero) {
    const segundo = pontosDoSet(true);
    sets.push({ numero: 2, pontosA: segundo.pontosA, pontosB: segundo.pontosB });
  } else {
    const segundo = pontosDoSet(false);
    sets.push({ numero: 2, pontosA: segundo.pontosA, pontosB: segundo.pontosB });
    const terceiro = pontosDoSet(true);
    sets.push({ numero: 3, pontosA: terceiro.pontosA, pontosB: terceiro.pontosB });
  }
  return sets;
}

function aplicarResultado(jogo, regras, alvoSets, rng) {
  const aVence = rng() < 0.5;
  if (regras.temSets) {
    const sets = gerarSetsComparados(alvoSets, aVence, rng);
    jogo.sets = sets;
    jogo.placarA = sets.filter((s) => s.pontosA > s.pontosB).length;
    jogo.placarB = sets.length - jogo.placarA;
  } else {
    const base = Math.floor(rng() * 4);
    const dif = 1 + Math.floor(rng() * 4);
    jogo.placarA = aVence ? base + dif : base;
    jogo.placarB = aVence ? base : base + dif;
    jogo.sets = [];
  }
  jogo.wo = false;
  jogo.status = 'Encerrado';
  jogo.vencedorId = aVence ? Number(jogo.participanteAId) : Number(jogo.participanteBId);
}

function distribuirChaves(participantes, qtdChaves) {
  const mapa = {};
  participantes.forEach((id, i) => {
    mapa[String(id)] = i % qtdChaves;
  });
  const nomes = String(wizardService.LETRAS).slice(0, qtdChaves).split('');
  return wizardService.montarGruposDoForm(nomes, mapa, participantes);
}

function resolverEliminatoria(mod, regras, alvoSets, rng, mapCampusId, dataInicio, dataFim) {
  const elim = mod.eliminatoria;
  let guard = (elim.fases || []).length + 3;
  while (guard > 0) {
    guard -= 1;
    let fez = false;
    for (const fase of elim.fases || []) {
      for (const jg of fase.jogos || []) {
        if (temParticipantes(jg) && jg.status !== 'Encerrado') {
          jg.data = ondeDia(dataInicio, dataFim, 4 + (Number(jg.rodada) || 1), DIAS_SLOTS);
          jg.horario = horarioPara(Number(jg.rodada) || 1);
          jg.local = 'Ginásio Regional';
          aplicarResultado(jg, regras, alvoSets, rng);
          fez = true;
        }
      }
    }
    wizardService.avancarEliminatoria(elim, regras);
    if (elim.jogoTerceiro && temParticipantes(elim.jogoTerceiro) && elim.jogoTerceiro.status !== 'Encerrado') {
      elim.jogoTerceiro.data = ondeDia(dataInicio, dataFim, 4 + (Number(elim.jogoTerceiro.rodada) || 3), DIAS_SLOTS);
      elim.jogoTerceiro.horario = horarioPara(Number(elim.jogoTerceiro.rodada) || 3);
      elim.jogoTerceiro.local = 'Ginásio Regional';
      aplicarResultado(elim.jogoTerceiro, regras, alvoSets, rng);
      fez = true;
    }
    if (!fez) break;
  }
  const podio = wizardService.obterPodioEliminatoria(elim, regras);
  elim.campeao = podio.campeao;
  elim.vice = podio.vice;
  elim.terceiro = podio.terceiro;
  elim.finalizada = true;
  mod.campeao = podio.campeao != null ? nomeCampus(mapCampusId, podio.campeao) : null;
  mod.vice = podio.vice != null ? nomeCampus(mapCampusId, podio.vice) : null;
  mod.terceiro = podio.terceiro != null ? nomeCampus(mapCampusId, podio.terceiro) : null;
  mod.finalizada = true;
  mod.etapaModalidade = 'eliminatorias';
}

function horarioPara(rodada) {
  return `${String(8 + (rodada % 10)).padStart(2, '0')}:30`;
}

function preencherColetivoNoModulo(bag, nomeModalidade, pool, qtd, seed, dataInicio, dataFim, qtdChavesForcadas) {
  const rng = criarSorte(seed);
  const regras = obterRegras(nomeModalidade);
  const alvoSets = /t[êe]nis de mesa/i.test(nomeModalidade) ? 11 : (regras.temSets ? 21 : null);

  const participantes = pool.slice(0, qtd).map((c) => Number(c.id));
  bag.participantes = participantes;

  const quantidadeAlvo = Number(qtdChavesForcadas) >= 1 ? Number(qtdChavesForcadas) : null;
  const qtdChaves = quantidadeAlvo
    ? Math.max(1, Math.min(quantidadeAlvo, Math.floor(participantes.length / 3)))
    : (participantes.length <= 4 ? 1 : Math.max(1, Math.min(2, Math.floor(participantes.length / 3))));
  const grupos = distribuirChaves(participantes, qtdChaves);
  bag.grupos = grupos;
  bag.jogos = wizardService.gerarJogosDasChaves(grupos);

  const mapCampusId = new Map(pool.map((c) => [Number(c.id), c]));
  for (const jogo of bag.jogos) {
    jogo.data = ondeDia(dataInicio, dataFim, Math.max(0, (Number(jogo.rodada) || 1) - 1), DIAS_SLOTS);
    jogo.horario = horarioPara(Number(jogo.rodada) || 1);
    jogo.local = 'Ginásio Regional';
    aplicarResultado(jogo, regras, alvoSets, rng);
  }

  bag.tabela = [];
  for (const grupo of grupos) {
    const jogosDoGrupo = bag.jogos.filter((j) => Number(j.chaveIndice) === Number(grupo.indice));
    const linhas = wizardService.calcularTabelaDoGrupo(jogosDoGrupo, grupo.participantes, mapCampusId, regras, grupo.indice);
    bag.tabela.push(...linhas);
  }

  if (qtdChaves === 1) {
    const linhas = bag.tabela.slice().sort((a, b) => Number(a.posicao || 0) - Number(b.posicao || 0));
    bag.campeao = linhas[0] ? linhas[0].campus : null;
    bag.vice = linhas[1] ? linhas[1].campus : null;
    bag.terceiro = linhas[2] ? linhas[2].campus : null;
    bag.eliminatoria = null;
    bag.finalizada = true;
    bag.etapaModalidade = 'resultados';
    return bag;
  }

  let padrao = obterPadraoEliminatoria(nomeModalidade, '') || regras.padraoEliminatoria;
  if (/t[êe]nis de mesa/i.test(nomeModalidade) && bag.subEtapa === 'dupla') {
    padrao = 'alternado';
  }
  bag.eliminatoria = wizardService.gerarEliminatoriaWizard(bag, regras, padrao);
  resolverEliminatoria(bag, regras, alvoSets, rng, mapCampusId, dataInicio, dataFim);
  return bag;
}

function preencherTenisDeMesa(mod, pool, dataInicio, dataFim, chavesIndividual, chavesDupla) {
  const cap = Math.min(pool.length, 12);
  mod.participantes = pool.slice(0, cap).map((c) => Number(c.id));
  const bags = mod.subEtapasTenis || wizardService.criarSubEtapasTenis();
  bags.individual.subEtapa = 'individual';
  bags.dupla.subEtapa = 'dupla';
  const individual = preencherColetivoNoModulo(bags.individual, mod.nome, pool, cap, 201, dataInicio, dataFim, chavesIndividual || 2);
  const dupla = preencherColetivoNoModulo(bags.dupla, mod.nome, pool, cap, 202, dataInicio, dataFim, chavesDupla || 2);

  const nomesInd = selecionarNomesAtletas(201, mod.genero, cap);
  const mapaAtletaInd = new Map(pool.slice(0, cap).map((c, i) => [Number(c.id), nomesInd[i]]));
  for (const linha of individual.tabela || []) {
    const nome = mapaAtletaInd.get(Number(linha.campus_id));
    if (nome) {
      linha.atleta_id = Number(linha.campus_id);
      linha.atleta = nome;
    }
  }
  for (const jg of individual.jogos || []) {
    const nomeCasa = mapaAtletaInd.get(Number(jg.participanteAId));
    const nomeFora = mapaAtletaInd.get(Number(jg.participanteBId));
    if (nomeCasa) jg.atletaCasa = nomeCasa;
    if (nomeFora) jg.atletaFora = nomeFora;
    jg.rotuloCasa = null;
    jg.rotuloFora = null;
  }

  mod.subEtapasTenis = bags;
  mod.subEtapa = 'individual';
  mod.grupos = individual.grupos;
  mod.jogos = individual.jogos;
  mod.tabela = individual.tabela;
  mod.eliminatoria = individual.eliminatoria;
  mod.campeao = individual.campeao;
  mod.vice = individual.vice;
  mod.terceiro = individual.terceiro;
  mod.finalizada = individual.finalizada;
  mod.etapaModalidade = 'eliminatorias';
}

function valorDaProva(prova, rng) {
  if (prova.tipo === 'tempo') {
    const valor = rng() < 0.5 ? 11.4 + rng() * 2.6 : 12.6 + rng() * 4.5;
    return Math.round(valor * 100) / 100;
  }
  if (/salto em altura/i.test(prova.nome)) {
    return Math.round((1.35 + rng() * 0.7) * 100) / 100;
  }
  if (/dist[âa]ncia/i.test(prova.nome)) {
    return Math.round((4.4 + rng() * 2.2) * 100) / 100;
  }
  if (/triplo/i.test(prova.nome)) {
    return Math.round((9 + rng() * 2.5) * 100) / 100;
  }
  return Math.round((7.5 + rng() * 8) * 100) / 100;
}

function preencherAtletismo(mod, pool, seed) {
  const rng = criarSorte(seed);
  const provasEscolhidas = mod.genero === 'Masculino'
    ? wizardService.criarProvasAtletismoWizard().map((p) => p.id)
    : [1, 2, 3, 8, 11, 12];
  const atletasUso = pool.slice(0, 6);
  const nomes = selecionarNomesAtletas(seed, mod.genero, atletasUso.length);

  const provas = wizardService.criarProvasAtletismoWizard().map((prova) => {
    const selecionada = provasEscolhidas.includes(prova.id);
    return {
      ...prova,
      selecionada,
      resultados: selecionada
        ? atletasUso.map((campus, ai) => ({
            id: ai + 1,
            atleta: nomes[ai] || NOMES_ATLETAS[ai % NOMES_ATLETAS.length],
            campusId: Number(campus.id),
            campus: campus.nomeExibicao,
            bateria: prova.final ? (ai < 4 ? 1 : 2) : 1,
            valor: valorDaProva(prova, rng),
            valorFinal: null,
            posicao: null,
            pontos: 0
          }))
        : []
    };
  });

  let resultado = wizardService.calcularResultadosAtletismoWizard({ ...mod, provas: provas });
  resultado.forEach((prova) => {
    if (!prova.final) return;
    (prova.finalistas || []).forEach((finalista) => {
      finalista.valorFinal = Math.round((Number(finalista.valor) + 0.05 + rng() * 0.4) * 100) / 100;
    });
  });
  resultado = wizardService.calcularResultadosAtletismoWizard({ ...mod, provas: resultado });

  mod.provas = resultado;
  mod.atletas = [];
  let seq = 0;
  for (const prova of resultado) {
    if (!prova.selecionada) continue;
    const fila = prova.final ? (prova.finalistas || []) : (prova.resultados || []);
    for (const linha of fila) {
      if (!linha.atleta || linha.campusId == null) continue;
      const existente = mod.atletas.find((a) => a.nome === linha.atleta && Number(a.campusId) === Number(linha.campusId));
      if (existente) {
        linha.atletaId = existente.id;
      } else {
        seq += 1;
        linha.atletaId = seq;
        mod.atletas.push({ id: seq, nome: linha.atleta, campusId: Number(linha.campusId), campus: linha.campus || '' });
      }
    }
  }
  mod.tabelaAtletismo = wizardService.calcularClassificacaoAtletismoWizard(mod);
  const topo = mod.tabelaAtletismo[0] || null;
  const segundo = mod.tabelaAtletismo[1] || null;
  const terceiro = mod.tabelaAtletismo[2] || null;
  mod.campeao = topo ? topo.campus : null;
  mod.vice = segundo ? segundo.campus : null;
  mod.terceiro = terceiro ? terceiro.campus : null;
  mod.participantes = atletasUso.map((c) => Number(c.id));
  mod.etapaModalidade = 'participantes';
  mod.finalizada = mod.atletas.length > 0;
}

function preencherXadrez(mod, pool, seed) {
  const rng = criarSorte(seed);
  const atletasUso = pool.slice(0, 6);
  const nomes = selecionarNomesAtletas(seed, mod.genero, atletasUso.length);
  const lista = atletasUso.map((campus, ai) => ({
    id: ai + 1,
    nome: nomes[ai] || NOMES_MASCULINOS[ai % NOMES_MASCULINOS.length],
    campusId: Number(campus.id),
    campus: campus.nomeExibicao,
    vitorias: Math.floor(rng() * 5),
    derrotas: Math.floor(rng() * 4),
    empates: Math.floor(rng() * 3),
    pontuacao: 0
  }));
  lista.forEach((atleta) => {
    atleta.pontuacao = atleta.vitorias * 1 + atleta.empates * 0.5;
  });
  mod.resultadosXadrez = lista;
  mod.atletas = lista.map((a) => ({ id: a.id, nome: a.nome, campusId: a.campusId, campus: a.campus }));
  mod.participantes = atletasUso.map((c) => Number(c.id));
  const rank = [...lista].sort((a, b) => b.pontuacao - a.pontuacao || b.vitorias - a.vitorias);
  mod.campeao = rank[0] ? rank[0].campus : null;
  mod.vice = rank[1] ? rank[1].campus : null;
  mod.terceiro = rank[2] ? rank[2].campus : null;
  mod.etapaModalidade = 'participantes';
  mod.finalizada = lista.length > 0;
}

async function montarExemplo(opcoes) {
  opcoes = opcoes || {};
  const ano = Number(opcoes.ano) || ANO_EXEMPLO;
  const dataInicio = String(opcoes.dataInicio || '').slice(0, 10) || DATA_INICIO;
  const dataFim = String(opcoes.dataFim || '').slice(0, 10) || DATA_FIM;

  const campiAtuais = await listarCampi();
  const { campi, pool } = await montarOrigemCampi(opcoes.campi, campiAtuais);

  const modalidades = wizardService.montarModalidadesPadrao();
  const idBase = wizardService.ID_INICIAL_MODALIDADE + modalidades.length;
  for (const genero of ['Masculino', 'Feminino']) {
    modalidades.push({
      id: idBase + (genero === 'Masculino' ? 0 : 1),
      nome: `Basquete ${genero}`,
      base: 'Basquete',
      genero,
      tipoConfronto: 'Coletivo',
      icone: '/imagens/basquete1.svg',
      formatoDisputa: 'grupos',
      etapaModalidade: 'participantes',
      finalizada: false,
      participantes: [],
      grupos: [],
      jogos: [],
      tabela: [],
      atletas: [],
      provas: [],
      resultadosXadrez: [],
      subEtapa: 'individual',
      subEtapasTenis: null,
      eliminatoria: null,
      campeao: null,
      vice: null,
      terceiro: null
    });
  }

  const coletivas = [
    ['Futsal Masculino', 12, 101, 4],
    ['Futsal Feminino', 12, 102, 3],
    ['Handebol Masculino', 8, 103, 2],
    ['Handebol Feminino', 8, 104, 2],
    ['Basquete Masculino', 12, 105, 4],
    ['Basquete Feminino', 9, 106, 3],
    ['Voleibol Masculino', 8, 107, 2],
    ['Voleibol Feminino', 8, 108, 1],
    ['Vôlei de Praia Masculino', 8, 109, 1],
    ['Vôlei de Praia Feminino', 8, 110, 1]
  ];

  for (const [nome, qtd, seed, chavesConfig] of coletivas) {
    const mod = modalidades.find((m) => m.nome === nome);
    if (mod) preencherColetivoNoModulo(mod, mod.nome, pool, qtd, seed, dataInicio, dataFim, chavesConfig);
  }

  for (const mod of modalidades) {
    if (wizardService.ehTenisDeMesa(mod.nome)) {
      preencherTenisDeMesa(mod, pool, dataInicio, dataFim, 4, 2);
    } else if (/atletismo/i.test(mod.nome)) {
      preencherAtletismo(mod, pool, 301 + (mod.genero === 'Feminino' ? 1 : 0));
    } else if (/xadrez/i.test(mod.nome)) {
      preencherXadrez(mod, pool, 401 + (mod.genero === 'Feminino' ? 1 : 0));
    }
  }

  const foco = Math.max(0, modalidades.length - 1);
  return {
    formatoVersao: 1,
    etapa: 'revisao',
    status: 'rascunho',
    ano,
    titulo: `JIFC ${ano}`,
    dataInicio,
    dataFim,
    campi,
    modalidades,
    atletismo: [],
    xadrez: [],
    modalidadeFoco: foco,
    _proximoIdModalidade: wizardService.ID_INICIAL_MODALIDADE + modalidades.length
  };
}

module.exports = { montarExemplo, preencherAtletismo };