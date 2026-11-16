require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });
const db = require('../config/db');
const edicaoService = require('../services/edicaoService');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMES_ATLETAS = [
  'João Pedro da Silva', 'Maria Clara Souza', 'Lucas Gabriel Lima', 'Ana Beatriz Oliveira',
  'Pedro Henrique Costa', 'Larissa Fernanda Alves', 'Gabriel Santos Rocha', 'Juliana Martins Pereira',
  'Matheus Augusto Mendes', 'Camila Rodrigues Nunes', 'Rafael Oliveira Campos', 'Beatriz Andrade Ribeiro',
  'Felipe Carvalho Teixeira', 'Isabela Ferreira Dias', 'Thiago Ramos Barbosa', 'Letícia Moura Cardoso',
  'Bruno Moreira Farias', 'Marina Tavares Pinto', 'Vinícius Azevedo Sales', 'Carolina Duarte Barros',
  'Diego Machado Freitas', 'Patrícia Rocha Monteiro', 'André Nogueira Cavalcanti', 'Sabrina Pires Antunes',
  'Henrique Correia Fontes', 'Talita Lopes Corrêa', 'Caio Siqueira Moraes', 'Renata Guedes Viana',
  'Rodrigo Batista Peixoto', 'Priscila Noronha Bastos', 'Eduardo Chaves Mattos', 'Natália Rezende Parra'
];

function escolher(n, random) { return NOMES_ATLETAS[Math.floor(random() * NOMES_ATLETAS.length)]; }

function nomeBase(nome) {
  return String(nome || '').replace(/\s+(masculino|feminino|misto)$/i, '').trim();
}

function ehSet(esporte) {
  return /v.?olei|padel|t[\eê]nis/i.test(esporte);
}

function horariosPorFase() {
  const lista = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  let i = 0;
  return function proximo() {
    const h = lista[i % lista.length];
    i += 1;
    return h;
  };
}

function gerarPlacar(esporte, random) {
  if (/futsal/i.test(esporte)) {
    let c = 1 + Math.floor(random() * 6);
    let f = 0 + Math.floor(random() * 5);
    if (c === f) c += 1;
    return { placarCasa: c, placarFora: f, sets: [] };
  }
  if (/handebol/i.test(esporte)) {
    let c = 16 + Math.floor(random() * 19);
    let f = 12 + Math.floor(random() * 18);
    if (c === f) c += 1;
    return { placarCasa: c, placarFora: f, sets: [] };
  }
  if (/basquete/i.test(esporte)) {
    let c = 45 + Math.floor(random() * 45);
    let f = 38 + Math.floor(random() * 45);
    if (c === f) c += 1;
    return { placarCasa: c, placarFora: f, sets: [] };
  }
  if (/v.?olei de praia/i.test(esporte)) {
    const vencedorCasa = random() < 0.5;
    const sets = [];
    const set1 = vencedorCasa ? [21, 14 + Math.floor(random() * 7)] : [14 + Math.floor(random() * 7), 21];
    const set2 = vencedorCasa ? [21, 15 + Math.floor(random() * 6)] : [15 + Math.floor(random() * 6), 21];
    sets.push({ numero: 1, pontosCasa: set1[0], pontosFora: set1[1] }, { numero: 2, pontosCasa: set2[0], pontosFora: set2[1] });
    const placarCasa = sets.filter((s) => s.pontosCasa > s.pontosFora).length;
    const placarFora = sets.filter((s) => s.pontosFora > s.pontosCasa).length;
    return { placarCasa, placarFora, sets };
  }
  if (/v.?olei/i.test(esporte)) {
    const vencedorCasa = random() < 0.5;
    const padrão = vencedorCasa
      ? [[25, 18], [25, 20], [23, 25]]
      : [[18, 25], [20, 25], [25, 23]];
    const sets = padrão.map((p, i) => ({ numero: i + 1, pontosCasa: p[0], pontosFora: p[1] }));
    const placarCasa = sets.filter((s) => s.pontosCasa > s.pontosFora).length;
    const placarFora = sets.filter((s) => s.pontosFora > s.pontosCasa).length;
    return { placarCasa, placarFora, sets };
  }
  if (/padel/i.test(esporte)) {
    const vencedorCasa = random() < 0.5;
    const sets = [];
    for (let i = 0; i < 2; i += 1) {
      const casaVence = i === 0 ? vencedorCasa : !vencedorCasa;
      const p1 = 6, p2 = 3 + Math.floor(random() * 4);
      if (casaVence) sets.push({ numero: i + 1, pontosCasa: p1, pontosFora: p2 });
      else sets.push({ numero: i + 1, pontosCasa: p2, pontosFora: p1 });
    }
    return { placarCasa: sets.filter((s) => s.pontosCasa > s.pontosFora).length, placarFora: sets.filter((s) => s.pontosFora > s.pontosCasa).length, sets };
  }
  if (/tenis de mesa/i.test(esporte)) {
    const vencedorCasa = random() < 0.5;
    const sets = [];
    let c = 0, f = 0;
    while (c < 3 && f < 3) {
      const casaVence = c <= f ? vencedorCasa : !vencedorCasa;
      if (casaVence) { sets.push({ numero: sets.length + 1, pontosCasa: 11, pontosFora: 4 + Math.floor(random() * 7) }); c += 1; }
      else { sets.push({ numero: sets.length + 1, pontosCasa: 4 + Math.floor(random() * 7), pontosFora: 11 }); f += 1; }
    }
    return { placarCasa: c, placarFora: f, sets };
  }
  let c = 1 + Math.floor(random() * 4);
  let f = 0 + Math.floor(random() * 4);
  if (c === f) c += 1;
  return { placarCasa: c, placarFora: f, sets: [] };
}

function roundRobin(lista) {
  const times = [...lista];
  const n = times.length;
  const rodadas = [];
  const placeholders = n % 2 === 0 ? n : n + 1;
  const arr = [...times];
  if (placeholders > n) arr.push(null);
  const metade = placeholders / 2;
  for (let r = 0; r < placeholders - 1; r += 1) {
    const jogos = [];
    for (let i = 0; i < metade; i += 1) {
      const a = arr[i];
      const b = arr[placeholders - 1 - i];
      if (a && b) jogos.push([a, b]);
    }
    rodadas.push(jogos);
    const ultimo = arr[placeholders - 1];
    for (let i = placeholders - 1; i > 1; i -= 1) arr[i] = arr[i - 1];
    arr[1] = ultimo;
  }
  return rodadas;
}

function gerarColetivo(mod, equipes, random) {
  const esporte = nomeBase(mod.nome);
  const jogos = [];
  const gruposLinhas = [];
  const stats = new Map(equipes.map((e) => [e.id, {
    pontos: 0, jogosJogados: 0, vitorias: 0, empates: 0, derrotas: 0,
    pontosPro: 0, pontosContra: 0, setsGanhos: 0, setsPerdidos: 0
  }]));

  const tamanho = equipes.length;
  const duasChaves = tamanho >= 9;

  const chavesEq = duasChaves
    ? [equipes.slice(0, Math.ceil(tamanho / 2)), equipes.slice(Math.ceil(tamanho / 2))]
    : [equipes];
  const chaves = chavesEq.map((equipeLista, idx) => ({ nome: `Chave ${String.fromCharCode(65 + idx)}`, equipes: equipeLista }));

  const localCasa = (eq) => `Ginásio ${String(eq.cidade || eq.nome || 'IFC').replace(/^IFC\s+/i, '')}`;

  for (const chave of chaves) {
    const rodadas = roundRobin(chave.equipes);
    rodadas.forEach((jogosDaRodadaRaw, rodadaIndex) => {
      jogosDaRodadaRaw.forEach(([casa, fora]) => {
        const placar = gerarPlacar(esporte, random);
        const vencedor = placar.placarCasa === placar.placarFora ? null : (placar.placarCasa > placar.placarFora ? casa : fora);
        const data = rodadaIndex < 2 ? '30/06' : '01/07';
        jogos.push({
          id: jogos.length + 1,
          modalidadeId: mod.id,
          modalidade: mod.nome,
          genero: mod.genero,
          tipoConfronto: 'Coletivo',
          fase: 'Fase de Grupos',
          rodada: rodadaIndex + 1,
          subCategoria: 'geral',
          data,
          horario: horariosPorFase()(),
          local: localCasa(casa),
          status: 'Encerrado',
          publicado: 1,
          wo: false,
          casaId: casa.id,
          casa: casa.nome,
          foraId: fora.id,
          fora: fora.nome,
          atletaCasa: null,
          atletaFora: null,
          rotuloCasa: null,
          rotuloFora: null,
          ...placar,
          vencedorCampus: vencedor ? vencedor.id : null,
          disputaPontos1: null,
          disputaPontos2: null,
          cancelado: false
        });
        const sCasa = stats.get(casa.id);
        const sFora = stats.get(fora.id);
        sCasa.jogosJogados += 1;
        sFora.jogosJogados += 1;
        sCasa.pontosPro += placar.placarCasa;
        sCasa.pontosContra += placar.placarFora;
        sFora.pontosPro += placar.placarFora;
        sFora.pontosContra += placar.placarCasa;
        placar.sets.forEach((s) => {
          if (s.pontosCasa > s.pontosFora) { sCasa.setsGanhos += 1; sFora.setsPerdidos += 1; }
          else { sFora.setsGanhos += 1; sCasa.setsPerdidos += 1; }
        });
        if (placar.placarCasa > placar.placarFora) { sCasa.vitorias += 1; sFora.derrotas += 1; sCasa.pontos += 3; }
        else if (placar.placarFora > placar.placarCasa) { sFora.vitorias += 1; sCasa.derrotas += 1; sFora.pontos += 3; }
        else { sCasa.empates += 1; sFora.empates += 1; sCasa.pontos += 1; sFora.pontos += 1; }
      });
    });
  }

  const ranquear = (lista) => lista.slice().sort((a, b) => {
    const sa = stats.get(a.id), sb = stats.get(b.id);
    return (sb.pontos - sa.pontos) || (sb.vitorias - sa.vitorias) || ((sb.pontosPro - sb.pontosContra) - (sa.pontosPro - sa.pontosContra));
  });

  const porChave = chaves.map((chave) => ({ nome: chave.nome, rank: ranquear(chave.equipes) }));

  for (const chave of porChave) {
    chave.rank.forEach((eq) => {
      const s = stats.get(eq.id);
      gruposLinhas.push({
        modalidadeId: mod.id,
        chaveId: porChave.indexOf(chave) + 1,
        grupo: chave.nome,
        campusId: eq.id,
        campus: eq.nome,
        atletaId: null,
        atleta: null,
        pontos: s.pontos,
        jogosJogados: s.jogosJogados,
        vitorias: s.vitorias,
        empates: s.empates,
        derrotas: s.derrotas,
        pontosPro: s.pontosPro,
        pontosContra: s.pontosContra,
        saldo: s.pontosPro - s.pontosContra,
        setsGanhos: s.setsGanhos,
        setsPerdidos: s.setsPerdidos,
        subCategoria: 'geral'
      });
    });
  }

  let eliminJogos = [];
  const novoJogo = (casa, fora, fase, dia, numeroJogo) => {
    if (!casa || !fora) {
      throw new Error(`Confronto inválido em ${mod.nome}: casa=${casa && casa.nome} fora=${fora && fora.nome}`);
    }
    const placarBase = gerarPlacar(esporte, random);
    const placar = placarBase.placarCasa === placarBase.placarFora ? { ...placarBase, placarCasa: placarBase.placarCasa + 1 } : placarBase;
    const vencedor = placar.placarCasa > placar.placarFora ? casa : fora;
    eliminJogos.push({
      id: jogos.length + eliminJogos.length + 1,
      modalidadeId: mod.id,
      modalidade: mod.nome,
      genero: mod.genero,
      tipoConfronto: 'Coletivo',
      fase,
      rodada: fase === 'Final' || fase === 'Terceiro Lugar' ? 3 : 2,
      subCategoria: 'geral',
      data: dia,
      horario: horariosPorFase()(),
      local: localCasa(casa),
      status: 'Encerrado',
      publicado: 1,
      wo: false,
      casaId: casa.id, casa: casa.nome,
      foraId: fora.id, fora: fora.nome,
      atletaCasa: null, atletaFora: null,
      rotuloCasa: null, rotuloFora: null,
      ...placar,
      vencedorCampus: vencedor ? vencedor.id : null,
      disputaPontos1: null,
      disputaPontos2: null,
      cancelado: false
    });
    return vencedor;
  };

  if (porChave.length === 2) {
    const [a, b] = porChave.map((c) => c.rank);
    const quartas = [
      [a[0], b[3]], [a[1], b[2]], [a[2], b[1]], [a[3], b[0]]
    ];
    const vencedoresQuartas = [];
    const perdedoresQuartas = [];
    quartas.forEach(([casa, fora], i) => {
      const v = novoJogo(casa, fora, 'Quartas', '02/07', i + 1);
      vencedoresQuartas.push(v);
      perdedoresQuartas.push(v === casa ? fora : casa);
    });
    const semi1 = novoJogo(vencedoresQuartas[0], vencedoresQuartas[3], 'Semifinal', '03/07', 1);
    const semi2 = novoJogo(vencedoresQuartas[1], vencedoresQuartas[2], 'Semifinal', '03/07', 2);
    novoJogo(semi1 === vencedoresQuartas[0] ? vencedoresQuartas[1] : vencedoresQuartas[0], semi2 === vencedoresQuartas[2] ? vencedoresQuartas[3] : vencedoresQuartas[2], 'Terceiro Lugar', '03/07', 3);
    novoJogo(semi1, semi2, 'Final', '03/07', 4);
  } else {
    const rank = porChave[0].rank;
    const semis = [[rank[0], rank[3]], [rank[1], rank[2]]];
    const regressivos = [];
    const vencedoresSemi = [];
    semis.forEach(([casa, fora], i) => {
      const v = novoJogo(casa, fora, 'Semifinal', '03/07', i + 1);
      vencedoresSemi.push(v);
      regressivos.push(v === casa ? fora : casa);
    });
    novoJogo(regressivos[0], regressivos[1], 'Terceiro Lugar', '03/07', 3);
    novoJogo(vencedoresSemi[0], vencedoresSemi[1], 'Final', '03/07', 4);
  }

  jogos.push(...eliminJogos);
  return { jogos, grupos: gruposLinhas };
}

function gerarXadrez(mod, equipes, random) {
  const atletas = equipes.map((eq, i) => ({
    atletaId: i + 1,
    atletaNome: escolher(i, random),
    campusId: eq.id,
    campus: eq.nome,
    genero: mod.genero,
    pontuacao: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    publicado: true
  }));
  atletas.forEach((at, i) => {
    if (i === 0) { at.pontuacao = 5.5; at.vitorias = 5; at.empates = 1; at.derrotas = 0; }
    else if (i === 1) { at.pontuacao = 5; at.vitorias = 4; at.empates = 2; at.derrotas = 0; }
    else {
      const v = 6 - i + Math.floor(random() * 2);
      at.vitorias = Math.max(0, Math.min(5, v));
      at.empates = 1;
      at.derrotas = Math.max(0, 6 - at.vitorias - at.empates);
      at.pontuacao = at.vitorias + at.empates * 0.5;
    }
  });
  const classificacao = atletas.map((at) => ({ ...at, atleta: at.atletaNome }));
  return { modalidadeId: mod.id, classificacao };
}

function gerarTenisDeMesa(mod, equipes, random) {
  const jogos = [];
  const novaPartida = (id1, id2, fase, dia) => {
    const p = gerarPlacar('tenis de mesa', random);
    const venc = p.placarCasa > p.placarFora ? id1 : id2;
    jogos.push({
      id: jogos.length + 1,
      modalidadeId: mod.id,
      modalidade: mod.nome,
      genero: mod.genero,
      tipoConfronto: 'Individual',
      fase,
      rodada: fase === 'Final' || fase === 'Terceiro Lugar' ? 3 : 2,
      subCategoria: 'individual',
      data: dia,
      horario: horariosPorFase()(),
      local: 'Quadra de Tênis de Mesa',
      status: 'Encerrado',
      publicado: 1,
      wo: false,
      casaId: id1.campusId, casa: id1.campus,
      foraId: id2.campusId, fora: id2.campus,
      atletaCasa: id1.atletaNome, atletaFora: id2.atletaNome,
      rotuloCasa: null, rotuloFora: null,
      ...p,
      vencedorCampus: venc.campusId,
      disputaPontos1: null, disputaPontos2: null,
      cancelado: false
    });
    return venc;
  };
  const atletas = equipes.map((eq, i) => ({ campus: eq.nome, campusId: eq.id, atletaNome: escolher(i, random) }));
  const head = atletas.slice(0, atletas.length - 2);
  const quartas = [];
  for (let i = 0; i < head.length; i += 2) quartas.push([head[i], head[i + 1]]);
  const bye = atletas.slice(atletas.length - 2);
  const ganhadoresQ = quartas.map(([a, b]) => novaPartida(a, b, 'Quartas', '01/07'));
  const semi1 = novaPartida(bye[0], ganhadoresQ[0], 'Semifinal', '02/07');
  const semi2 = novaPartida(bye[1], ganhadoresQ[1], 'Semifinal', '02/07');
  const perdedorSemi1 = semi1 === bye[0] ? ganhadoresQ[0] : bye[0];
  const perdedorSemi2 = semi2 === bye[1] ? ganhadoresQ[1] : bye[1];
  novaPartida(perdedorSemi1, perdedorSemi2, 'Terceiro Lugar', '02/07');
  novaPartida(semi1, semi2, 'Final', '03/07');
  return { jogos };
}

async function main() {
  const random = mulberry32(2025);
  const campiBruto = await edicaoService.capturarCampi();
  const campi = campiBruto.map((c) => ({ ...c, cidade: c.cidade || c.nomeExibicao }));
  const mapaCampi = new Map(campi.map((c) => [c.id, c]));

  const [rowsModal] = await db.query('SELECT id, nome, genero, tipo_confronto, formato_disputa, icone FROM modalidades ORDER BY id ASC');
  const modalidades = rowsModal.map((m) => ({
    id: m.id,
    nome: String(m.nome || '').trim(),
    base: nomeBase(String(m.nome || '').trim()),
    genero: String(m.genero || '').trim(),
    tipoConfronto: String(m.tipo_confronto || 'Coletivo').trim(),
    formatoDisputa: String(m.formato_disputa || '').trim(),
    icone: m.icone || null
  }));

  const [rowsEnroll] = await db.query('SELECT modalidade_id, campus_id FROM campus_modalidade ORDER BY campus_id ASC');
  const enroll = new Map();
  rowsEnroll.forEach((e) => {
    if (!enroll.has(e.modalidade_id)) enroll.set(e.modalidade_id, []);
    enroll.get(e.modalidade_id).push(e.campus_id);
  });

  const inventados = {
    50: 8, 54: 8, 42: 8, 45: 10, 49: 8, 53: 12, 62: 8
  };

  const jogosTodos = [];
  const gruposTodos = [];
  const campiOrdenados = campi.map((c) => c.id);

  const empacotarEquipes = (ids) => ids.map((id) => {
    const c = mapaCampi.get(Number(id));
    return { id: Number(id), nome: c ? c.nomeExibicao : `Campus ${id}`, cidade: c ? c.cidade : '' };
  });

  for (const mod of modalidades) {
    let ids = (enroll.get(mod.id) || []).map(Number);
    if (!ids.length && inventados[mod.id]) {
      const qtde = inventados[mod.id];
      ids = [];
      for (let i = 0; i < qtde; i += 1) {
        const idx = (mod.id + i * 3) % campiOrdenados.length;
        if (!ids.includes(campiOrdenados[idx])) ids.push(campiOrdenados[idx]);
      }
    }
    const equipes = empacotarEquipes(ids);
    if (!equipes.length) continue;

    if (/xadrez/i.test(mod.nome)) {
      const resultado = gerarXadrez(mod, equipes.slice(0, 8), random);
      jogosTodos.push({ __bloco: 'xadrez', mod, resultado });
      continue;
    }
    if (/tenis de mesa/i.test(mod.nome)) {
      const resultado = gerarTenisDeMesa(mod, equipes.slice(0, 10), random);
      jogosTodos.push({ __bloco: 'jogos', mod, jogos: resultado.jogos });
      continue;
    }
    if (/atletismo/i.test(mod.nome)) {
      jogosTodos.push({ __bloco: 'atletismo', mod, equipes });
      continue;
    }
    const coletivo = gerarColetivo(mod, equipes, random);
    jogosTodos.push({ __bloco: 'jogos', mod, jogos: coletivo.jogos });
    gruposTodos.push(...coletivo.grupos);
  }

  const jogos = jogosTodos.filter((b) => b.__bloco === 'jogos').flatMap((b) => b.jogos || []);
  jogos.forEach((j, i) => { j.id = i + 1; });

  const atletismoModalidades = jogosTodos.filter((b) => b.__bloco === 'atletismo');
  const provasAtletismo = [];
  if (atletismoModalidades.length === 2) {
    const ordemProvas = ['100m', '400m', '1500m', '4x100m', 'Salto em Distância', 'Arremesso de Peso'];
    const tipos = { '100m': 'tempo', '400m': 'tempo', '1500m': 'tempo', '4x100m': 'tempo', 'Salto em Distância': 'medida', 'Arremesso de Peso': 'medida' };
    atletismoModalidades.forEach((b) => {
      const mod = b.mod;
      ordemProvas.forEach((provaNome, pi) => {
        const slug = gerarSlugLocal(provaNome);
        const resultados = b.equipes.slice(0, 6).map((eq, ri) => {
          const valorTempo = tipos[provaNome] === 'tempo' ? (9.9 + ri * 0.35 + random() * 0.4).toFixed(2) + 's' : null;
          const valorMedida = tipos[provaNome] === 'medida' ? (2.1 + random() * 0.4 + (6 - ri) * 0.05).toFixed(2) + 'm' : null;
          return {
            atletaId: ri + 1,
            atleta: escolher(ri + pi, random),
            atletaNome: escolher(ri + pi, random),
            campus: eq.nome,
            campusNome: eq.nome,
            valorTempo,
            valorMedida,
            resultado: valorTempo || valorMedida || '',
            tempo: valorTempo,
            medida: valorMedida,
            posicao: ri + 1,
            posicaoFinal: ri + 1,
            pontos: Math.max(0, 7 - ri),
            bateria: 1,
            raia: ri + 1
          };
        });
        provasAtletismo.push({
          id: pi + 1,
          modalidadeId: mod.id,
          modalidadeGenero: mod.genero,
          nome: provaNome,
          slug,
          genero: mod.genero,
          tipoResultado: tipos[provaNome],
          ordem: pi,
          formato: 'direta',
          resultados
        });
      });
    });
  }

  const xadrezBlocos = jogosTodos.filter((b) => b.__bloco === 'xadrez');
  const classificacaoXadrez = xadrezBlocos.flatMap((b) => b.resultado.classificacao || []);
  const xadrez = xadrezBlocos.length ? { modalidadeId: xadrezBlocos[0].mod.id, classificacao: classificacaoXadrez } : null;
  const atletismo = atletismoModalidades.length ? { modalidadeId: atletismoModalidades[0].mod.id, podeExistir: true, provas: provasAtletismo, campi: [] } : null;

  const snapshot = {
    formatoVersao: 1,
    ano: 2025,
    titulo: 'JIFC 2025 — edição demonstrativa',
    origem: 'importada',
    geradoEm: new Date().toISOString(),
    campi,
    modalidades,
    chaves: [],
    grupos: gruposTodos,
    jogos,
    atletismo,
    xadrez,
    boletim: null
  };

  console.log('campi', campi.length, '| modalidades', modalidades.length, '| jogos', jogos.length, '| grupos', gruposTodos.length, '| provas atletismo', provasAtletismo.length, '| jogadores xadrez', classificacaoXadrez.length);

  await edicaoService.excluirEdicao(2025);
  const resultado = await edicaoService.importarEdicao(snapshot);
  console.log('importado id', resultado.id, '| ano', resultado.ano, '| avisos', JSON.stringify(resultado.avisos || []));
}

function gerarSlugLocal(nome) {
  return String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERRO', e); process.exit(1); });