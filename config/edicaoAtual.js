// Ano da edição (JIFC) em andamento.
//
// Toda a competição ao vivo (chaves, jogos, classificação, resultados) pertence
// a uma edição. O ano vem de `configuracoes_evento.ano_evento`, que é a
// configuração salva pelo admin em /admin/configurar.
//
// O valor é sempre um inteiro validado: interpolá-lo no SQL é seguro e evita
// espalhar um parâmetro extra por todas as consultas.
const db = require('./db');

const TTL_CACHE_MS = 5000;

let anoCache = null;
let anoCacheEm = 0;

function normalizarAno(valor) {
  const ano = Number(valor);
  if (!Number.isFinite(ano)) return null;
  const inteiro = Math.trunc(ano);
  if (inteiro < 1900 || inteiro > 2200) return null;
  return inteiro;
}

async function obterAnoEventoAtual() {
  const agora = Date.now();
  if (anoCache !== null && (agora - anoCacheEm) < TTL_CACHE_MS) {
    return anoCache;
  }

  let ano = null;

  try {
    const [linhas] = await db.query('SELECT ano_evento FROM configuracoes_evento ORDER BY id DESC LIMIT 1');
    ano = normalizarAno(linhas?.[0]?.ano_evento);
  } catch (_) {
    // banco indisponível: cai no estado local
  }

  if (ano === null) {
    try {
      const { getConfiguracoes } = require('../services/configService');
      ano = normalizarAno(getConfiguracoes().ano_evento);
    } catch (_) {
      // estado local indisponível: usa o ano corrente
    }
  }

  if (ano === null) {
    ano = new Date().getFullYear();
  }

  anoCache = ano;
  anoCacheEm = agora;

  return ano;
}

function invalidarAnoEvento() {
  anoCache = null;
  anoCacheEm = 0;
}

/** Fragmento SQL seguro: "ano_evento = 2026" ou "j.ano_evento = 2026". */
async function filtroAnoEvento(alias = '') {
  const ano = await obterAnoEventoAtual();
  const prefixo = alias ? `${alias}.` : '';
  return `${prefixo}ano_evento = ${ano}`;
}

module.exports = {
  obterAnoEventoAtual,
  invalidarAnoEvento,
  filtroAnoEvento,
  normalizarAno
};
