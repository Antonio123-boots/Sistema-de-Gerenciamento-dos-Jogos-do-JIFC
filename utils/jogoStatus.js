const STATUS_TERMINAL = ['Encerrado', 'Cancelado'];
const STATUS_EM_CURSO = ['Em Andamento'];

function statusEfetivo(status, dataHora) {
  let s = String(status || '').trim() || 'Agendado';

  if (s === 'Em Andamento') s = 'Agendado';

  if (s !== 'Agendado') return s;

  if (!dataHora) return s;

  const data = dataHora instanceof Date ? dataHora : new Date(dataHora);
  if (isNaN(data.getTime())) return s;

  return data.getTime() <= Date.now() ? 'Em Andamento' : 'Agendado';
}

function ehStatusTerminal(status) {
  return STATUS_TERMINAL.includes(String(status || '').trim());
}

function ehStatusEmCurso(status) {
  return STATUS_EM_CURSO.includes(String(status || '').trim());
}

module.exports = { statusEfetivo, ehStatusTerminal, ehStatusEmCurso, STATUS_TERMINAL };
