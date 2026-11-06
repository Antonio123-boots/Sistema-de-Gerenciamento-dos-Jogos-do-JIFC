function inferirGeneroModalidade(nome, generoInformado = '') {
  const generoNormalizado = String(generoInformado || '').trim();
  if (generoNormalizado === 'Masculino' || generoNormalizado === 'Feminino' || generoNormalizado === 'Misto') {
    return generoNormalizado;
  }

  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  if (nomeNormalizado.includes('misto')) return 'Misto';
  if (nomeNormalizado.includes('feminino')) return 'Feminino';
  if (nomeNormalizado.includes('masculino')) return 'Masculino';

  return 'Masculino';
}

function inferirTipoConfrontoModalidade(nome, tipoInformado = '') {
  const tipo = String(tipoInformado || '').trim();
  if (tipo) return tipo;

  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  if (/(atletismo|natação|natacao|corrida|salto|lançamento|lancamento|esgrima|xadrez|tênis de mesa|tenis de mesa|badminton)/i.test(nomeNormalizado)) {
    return 'Individual';
  }
  return 'Coletivo';
}

function inferirFormatoDisputaModalidade(nome, formatoInformado = '') {
  const formato = String(formatoInformado || '').trim();
  if (formato) return formato;

  const nomeNormalizado = String(nome || '').trim().toLowerCase();
  if (/(atletismo|natação|natacao|corrida|salto|lançamento|lancamento|esgrima|xadrez|tênis de mesa|tenis de mesa)/i.test(nomeNormalizado)) {
    return 'Baterias por Tempo';
  }
  return 'Grupos + Mata-Mata';
}

module.exports = { inferirGeneroModalidade, inferirTipoConfrontoModalidade, inferirFormatoDisputaModalidade };
