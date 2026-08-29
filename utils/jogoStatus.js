function statusEfetivo(status, dataHora) {
  let s = String(status || '').trim() || 'Agendado';

  if (s === 'Em Andamento') s = 'Agendado';

  if (s !== 'Agendado') return s;

  if (!dataHora) return s;

  const data = dataHora instanceof Date ? dataHora : new Date(dataHora);
  if (isNaN(data.getTime())) return s;

  return data.getTime() <= Date.now() ? 'Em Andamento' : 'Agendado';
}

module.exports = { statusEfetivo };