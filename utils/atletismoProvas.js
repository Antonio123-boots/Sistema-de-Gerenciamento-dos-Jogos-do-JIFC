const db = require('../config/db');
const campusModel = require('../models/campusModel');

/* Mapa: slug da prova -> nomes usados na inscrição do atleta */
const MAPA_PROVAS_INSCRICAO = {
  '100m': ['100m rasos'],
  '200m': ['200m rasos'],
  '400m': ['400m'],
  '800m': ['800m'],
  '1500m': ['1500m'],
  '3000m': ['3000m'],
  '5000m': ['5000m'],
  '4x100m': ['4x100m'],
  '4x400m': ['4x400m'],
  'salto-em-distancia': ['Salto em distância'],
  'salto-em-altura': ['Salto em altura'],
  'salto-triplo': ['Salto Triplo'],
  'disco': ['Disco'],
  'dardo': ['Dardo'],
  'peso': ['Peso']
};

/* Lista plana de provas para exibição pública */
const PROVAS_ATLETISMO_EXIBICAO = [
  { grupo: 'Corrida', slug: '100m', nome: '100m' },
  { grupo: 'Corrida', slug: '200m', nome: '200m' },
  { grupo: 'Corrida', slug: '400m', nome: '400m' },
  { grupo: 'Corrida', slug: '800m', nome: '800m' },
  { grupo: 'Corrida', slug: '1500m', nome: '1500m' },
  { grupo: 'Corrida', slug: '3000m', nome: '3000m' },
  { grupo: 'Corrida', slug: '5000m', nome: '5000m' },
  { grupo: 'Revezamento', slug: '4x100m', nome: '4x100m' },
  { grupo: 'Revezamento', slug: '4x400m', nome: '4x400m' },
  { grupo: 'Saltos', slug: 'salto-em-distancia', nome: 'Salto em Distância' },
  { grupo: 'Saltos', slug: 'salto-em-altura', nome: 'Salto em Altura' },
  { grupo: 'Saltos', slug: 'salto-triplo', nome: 'Salto Triplo' },
  { grupo: 'Arremessos', slug: 'disco', nome: 'Disco' },
  { grupo: 'Arremessos', slug: 'dardo', nome: 'Dardo' },
  { grupo: 'Arremessos', slug: 'peso', nome: 'Peso' }
];

function normalizarTextoProva(valor) {
  return String(valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Formata o tempo vindo do banco ("00:00:10.523", "00:10.523", "10.523" ou Date)
   para exibição: "00:10.523" (coloca horas apenas quando houver) */
function formatarTempoResultado(valor) {
  if (valor == null) return '';

  if (typeof valor === 'string') {
    const texto = String(valor).trim();
    if (!texto) return '';

    const match = texto.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
    if (match) {
      const horas = Number(match[1] || 0);
      const minutos = String(match[2]).padStart(2, '0');
      const segundos = String(match[3]).padStart(2, '0');
      const milesimos = match[4] ? '.' + String(match[4]).padEnd(3, '0') : '.000';
      return horas > 0 ? `${horas}:${minutos}:${segundos}${milesimos}` : `${minutos}:${segundos}${milesimos}`;
    }

    const matchSegundos = texto.match(/^(\d{1,4})(?:[.,](\d{1,3}))?$/);
    if (matchSegundos) {
      const milesimos = matchSegundos[2] ? '.' + String(matchSegundos[2]).padEnd(3, '0') : '.000';
      return `${matchSegundos[1]}${milesimos}`;
    }

    return texto;
  }

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const horas = valor.getUTCHours();
    const minutos = String(valor.getUTCMinutes()).padStart(2, '0');
    const segundos = String(valor.getUTCSeconds()).padStart(2, '0');
    const milesimos = '.' + String(valor.getUTCMilliseconds()).padStart(3, '0');
    return horas > 0 ? `${horas}:${minutos}:${segundos}${milesimos}` : `${minutos}:${segundos}${milesimos}`;
  }

  return String(valor);
}

function chaveAtletaProvas(nomeAtleta, nomeCampus) {
  return `${normalizarTextoProva(nomeAtleta)}|${normalizarTextoProva(nomeCampus)}`;
}

/* Carrega do state store as provas inscritas de cada atleta (chave: nome|campus) */
function obterMapaProvasAtletismo() {
  const mapa = new Map();
  try {
    const atletasState = campusModel.getAtletasParaAnalise() || [];
    atletasState.forEach((atleta) => {
      if (!Array.isArray(atleta.atletismoProvas) || !atleta.atletismoProvas.length) return;
      const chave = chaveAtletaProvas(atleta.nome, atleta.campus);
      if (!mapa.has(chave)) mapa.set(chave, new Set());
      const conjunto = mapa.get(chave);
      atleta.atletismoProvas.forEach((prova) => conjunto.add(normalizarTextoProva(prova)));
    });
  } catch (e) {
    console.error('Erro ao carregar provas de atletismo inscritas:', e);
  }
  return mapa;
}

/* Filtra a lista de inscritos (banco) mantendo apenas quem se inscreveu na prova.
   Aceita mapa por id do atleta ou pela chave nome|campus */
function filtrarInscritosPorProva(inscritos, mapaProvas, slugProva) {
  const lista = Array.isArray(inscritos) ? inscritos : [];
  const nomesAceitos = MAPA_PROVAS_INSCRICAO[String(slugProva || '').toLowerCase()];
  if (!nomesAceitos) return lista;
  return lista.filter((inscrito) => {
    let provasRegistradas = null;
    if (mapaProvas instanceof Map) {
      provasRegistradas = mapaProvas.get(Number(inscrito.id))
        || mapaProvas.get(chaveAtletaProvas(inscrito.nomeAtleta || inscrito.nome, inscrito.nomeCampus))
        || null;
    }
    if (!provasRegistradas) return false;
    return nomesAceitos.some((nomeProva) => provasRegistradas.has(normalizarTextoProva(nomeProva)));
  });
}

/* Mapa de provas por inscrito combinando coluna do banco (fonte principal) com fallback do state store */
async function montarMapaProvasParaInscritos(inscritos) {
  const lista = Array.isArray(inscritos) ? inscritos : [];
  const [mapaBanco, mapaState] = await Promise.all([
    obterMapaProvasDoBanco(lista.map((inscrito) => inscrito.id)),
    Promise.resolve(obterMapaProvasAtletismo())
  ]);

  const mapaFinal = new Map();
  lista.forEach((inscrito) => {
    const idNum = Number(inscrito.id);
    let conjunto = mapaBanco.get(idNum) || null;
    if (!conjunto) {
      conjunto = mapaState.get(chaveAtletaProvas(inscrito.nomeAtleta || inscrito.nome, inscrito.nomeCampus)) || null;
    }
    if (conjunto) mapaFinal.set(idNum, conjunto);
  });
  return mapaFinal;
}

/* Monta a lista de provas com seus atletas a partir dos inscritos já carregados */
function montarProvasComAtletas(inscritos, mapaProvas) {
  return PROVAS_ATLETISMO_EXIBICAO.map((prova) => ({
    slug: prova.slug,
    nome: prova.nome,
    grupo: prova.grupo,
    atletas: filtrarInscritosPorProva(inscritos, mapaProvas, prova.slug)
      .map((atleta) => ({
        nome: String(atleta.nomeAtleta || atleta.nome || '').trim(),
        campus: String(atleta.nomeCampus || atleta.campus || '').trim()
      }))
  }));
}

/* Carrega do banco as provas inscritas (coluna provas_atletismo) por id do atleta */
async function obterMapaProvasDoBanco(atletaIds) {
  const mapa = new Map();
  const ids = [...new Set((Array.isArray(atletaIds) ? atletaIds : []).map(Number).filter(Boolean))];
  if (!ids.length) return mapa;

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, provas_atletismo FROM atletas WHERE id IN (${placeholders})`,
    ids
  );

  rows.forEach((row) => {
    if (!row.provas_atletismo) return;
    let nomes = [];
    try {
      nomes = JSON.parse(row.provas_atletismo);
    } catch (_) {
      nomes = [];
    }
    if (!Array.isArray(nomes) || !nomes.length) return;
    const conjunto = new Set();
    nomes.forEach((nome) => conjunto.add(normalizarTextoProva(nome)));
    mapa.set(Number(row.id), conjunto);
  });
  return mapa;
}

/* Descobre a qual prova de exibição um resultado pertence pelo nome da prova no banco */
function resolverSlugDaProva(nomeProvaResultado) {
  const alvo = normalizarTextoProva(nomeProvaResultado);
  if (!alvo) return '';
  for (const prova of PROVAS_ATLETISMO_EXIBICAO) {
    const aceitos = MAPA_PROVAS_INSCRICAO[prova.slug] || [];
    const combinou = aceitos.some((aceito) => {
      const normalizado = normalizarTextoProva(aceito);
      return normalizado === alvo
        || (alvo.length >= 3 && normalizado.includes(alvo))
        || (normalizado.length >= 3 && alvo.includes(normalizado));
    });
    if (combinou) return prova.slug;
  }
  return '';
}

/* Pontuação acumulada por atleta em cada prova (resultados_atletismo) */
async function obterPontuacaoPorAtleta() {
  const mapa = new Map();
  try {
    const [rows] = await db.query(
      `SELECT ra.atleta_id, ra.pontos, ra.posicao_final, ra.etapa,
              ra.resultado_tempo, ra.resultado_medida, p.nome AS prova_nome
       FROM resultados_atletismo ra
       JOIN provas p ON p.id = ra.prova_id
       JOIN modalidades m ON m.id = p.modalidade_id
       WHERE LOWER(m.nome) LIKE '%atletismo%'`
    );
    rows.forEach((row) => {
      const slug = resolverSlugDaProva(row.prova_nome);
      if (!slug) return;
      const atletaId = Number(row.atleta_id);
      if (!mapa.has(atletaId)) mapa.set(atletaId, new Map());
      const porProva = mapa.get(atletaId);
      const etapa = String(row.etapa || 'prova').toLowerCase();
      const atual = porProva.get(slug) || { pontos: 0, posicao: null, resultado: '', etapa: '' };
      atual.pontos += Number(row.pontos || 0);
      if (row.posicao_final != null && (atual.posicao == null || Number(row.posicao_final) < atual.posicao)) {
        atual.posicao = Number(row.posicao_final);
      }
      /* Prioriza o resultado físico da etapa 'prova'; usa 'final' apenas se não houver outro */
      if (!atual.resultado || (etapa === 'prova' && atual.etapa !== 'prova')) {
        const tempo = row.resultado_tempo != null
          ? formatarTempoResultado(row.resultado_tempo)
          : '';
        const medida = row.resultado_medida != null && row.resultado_medida !== ''
          ? `${Number(row.resultado_medida)} m`
          : '';
        const novoResultado = tempo || medida;
        if (novoResultado || (etapa === 'prova')) {
          atual.resultado = novoResultado || atual.resultado;
          atual.etapa = etapa;
        }
      }
      porProva.set(slug, atual);
    });
  } catch (error) {
    console.error('Erro ao carregar pontuação do atletismo:', error.message);
  }
  return mapa;
}

/* Dados da bateria/raia usados pela tabela pública, sem inventar agrupamentos. */
async function obterDetalhesResultadosPorAtleta() {
  const mapa = new Map();
  try {
    const [rows] = await db.query(
      `SELECT ra.atleta_id, ra.numero_bateria, ra.numero_raia, ra.resultado_tempo,
              ra.resultado_medida, ra.etapa, p.nome AS prova_nome
       FROM resultados_atletismo ra
       JOIN provas p ON p.id = ra.prova_id
       JOIN modalidades m ON m.id = p.modalidade_id
       WHERE LOWER(m.nome) LIKE '%atletismo%'`
    );
    rows.forEach((row) => {
      if (String(row.etapa || 'prova') !== 'prova') return;
      const slug = resolverSlugDaProva(row.prova_nome);
      if (!slug) return;
      const atletaId = Number(row.atleta_id);
      if (!mapa.has(atletaId)) mapa.set(atletaId, new Map());
      const resultado = row.resultado_tempo || row.resultado_medida;
      mapa.get(atletaId).set(slug, {
        numeroBateria: row.numero_bateria != null ? Number(row.numero_bateria) : null,
        numeroRaia: row.numero_raia != null ? Number(row.numero_raia) : null,
        resultado: resultado != null ? String(resultado) : ''
      });
    });
  } catch (error) {
    console.error('Erro ao carregar detalhes de bateria do atletismo:', error.message);
  }
  return mapa;
}

/* Resultados oficiais das provas com Final (100m rasos): linhas da etapa 'final',
   agrupadas por gênero da modalidade e slug da prova. */
async function obterResultadosFinaisPorProva() {
  const mapa = new Map();
  try {
    const [rows] = await db.query(
      `SELECT ra.atleta_id, ra.posicao_final, ra.pontos, ra.resultado_tempo,
              a.nome AS atleta_nome, c.nome AS campus_nome,
              p.nome AS prova_nome, m.genero AS modalidade_genero
       FROM resultados_atletismo ra
       JOIN provas p ON p.id = ra.prova_id
       JOIN modalidades m ON m.id = p.modalidade_id
       JOIN atletas a ON a.id = ra.atleta_id
       LEFT JOIN campus c ON c.id = a.campus_id
       WHERE LOWER(m.nome) LIKE '%atletismo%' AND ra.etapa = 'final'
       ORDER BY (ra.posicao_final IS NULL), ra.posicao_final ASC`
    );
    rows.forEach((row) => {
      const slug = resolverSlugDaProva(row.prova_nome);
      if (!slug) return;
      const genero = String(row.modalidade_genero || 'Geral').trim() || 'Geral';
      if (!mapa.has(genero)) mapa.set(genero, new Map());
      const porSlug = mapa.get(genero);
      if (!porSlug.has(slug)) porSlug.set(slug, []);
      porSlug.get(slug).push({
        atletaId: Number(row.atleta_id),
        nome: String(row.atleta_nome || '').trim(),
        campus: String(row.campus_nome || '').trim(),
        posicao: row.posicao_final != null ? Number(row.posicao_final) : null,
        pontos: Number(row.pontos || 0),
        tempo: row.resultado_tempo != null
          ? formatarTempoResultado(row.resultado_tempo)
          : ''
      });
    });
  } catch (error) {
    console.error('Erro ao carregar resultados finais do atletismo:', error.message);
  }
  return mapa;
}

/* Versão completa: provas com atletas (banco + fallback state) e pontuação de cada prova */
async function montarProvasComAtletasEDetalhes(inscritos) {
  const lista = Array.isArray(inscritos) ? inscritos : [];
  const [mapaProvas, pontuacao, detalhesResultados] = await Promise.all([
    montarMapaProvasParaInscritos(lista),
    obterPontuacaoPorAtleta(),
    obterDetalhesResultadosPorAtleta()
  ]);

  return PROVAS_ATLETISMO_EXIBICAO.map((prova) => {
    const atletas = filtrarInscritosPorProva(lista, mapaProvas, prova.slug)
      .map((inscrito) => {
        const resultadoProva = pontuacao.get(Number(inscrito.id));
        const detalhe = resultadoProva ? resultadoProva.get(prova.slug) : null;
        const resultadoSalvo = detalhesResultados.get(Number(inscrito.id))?.get(prova.slug) || {};
        return {
          id: inscrito.id,
          nome: String(inscrito.nomeAtleta || inscrito.nome || '').trim(),
          campus: String(inscrito.nomeCampus || inscrito.campus || '').trim(),
          pontos: detalhe ? detalhe.pontos : 0,
          posicao: detalhe && detalhe.posicao != null ? detalhe.posicao : null,
          resultado: detalhe && detalhe.resultado ? detalhe.resultado : '',
          numeroBateria: resultadoSalvo.numeroBateria,
          numeroRaia: resultadoSalvo.numeroRaia,
          temResultadoSalvo: Boolean(resultadoSalvo.resultado)
        };
      })
      .sort((a, b) =>
        (b.pontos - a.pontos)
        || ((a.posicao != null ? a.posicao : 999) - (b.posicao != null ? b.posicao : 999))
        || a.nome.localeCompare(b.nome)
      );

    return { slug: prova.slug, nome: prova.nome, grupo: prova.grupo, atletas };
  });
}

module.exports = {
  MAPA_PROVAS_INSCRICAO,
  PROVAS_ATLETISMO_EXIBICAO,
  normalizarTextoProva,
  chaveAtletaProvas,
  obterMapaProvasAtletismo,
  filtrarInscritosPorProva,
  montarMapaProvasParaInscritos,
  montarProvasComAtletas,
  obterMapaProvasDoBanco,
  resolverSlugDaProva,
  obterPontuacaoPorAtleta,
  obterResultadosFinaisPorProva,
  obterDetalhesResultadosPorAtleta,
  montarProvasComAtletasEDetalhes
};
