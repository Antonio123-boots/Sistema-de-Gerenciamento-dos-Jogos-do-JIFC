const assert = require('assert');
const { DIAS_GRUPOS, DIA_ELIMINATORIAS, montarAgenda } = require('../utils/agendaJogosJifc');

let id = 1;
const jogos = [];
function adicionarJogos(modalidadeId, modalidade, genero, fase, quantidade, rodada = 1) {
  for (let indice = 0; indice < quantidade; indice += 1) {
    jogos.push({
      id: id++,
      modalidade_id: modalidadeId,
      modalidade,
      genero,
      fase,
      rodada: rodada + indice,
      campus_1_id: indice + 1,
      campus_2_id: indice + 2,
      status: 'Agendado'
    });
  }
}

adicionarJogos(1, 'Futsal Masculino', 'Masculino', 'Fase de Grupos', 28);
adicionarJogos(1, 'Futsal Masculino', 'Masculino', 'Quartas', 4);
adicionarJogos(1, 'Futsal Masculino', 'Masculino', 'Semifinal', 2);
adicionarJogos(1, 'Futsal Masculino', 'Masculino', 'Terceiro Lugar', 1);
adicionarJogos(1, 'Futsal Masculino', 'Masculino', 'Final', 1);
adicionarJogos(12, 'Tênis de Mesa Masculino', 'Masculino', 'Fase de Grupos', 36);
adicionarJogos(12, 'Tênis de Mesa Masculino', 'Masculino', 'Oitavas', 8);
adicionarJogos(12, 'Tênis de Mesa Masculino', 'Masculino', 'Quartas', 4);
adicionarJogos(12, 'Tênis de Mesa Masculino', 'Masculino', 'Semifinal', 4);
adicionarJogos(12, 'Tênis de Mesa Masculino', 'Masculino', 'Terceiro Lugar', 2);
adicionarJogos(12, 'Tênis de Mesa Masculino', 'Masculino', 'Final', 2);
adicionarJogos(11, 'Futsal Feminino', 'Feminino', 'Fase de Grupos', 21);
adicionarJogos(11, 'Futsal Feminino', 'Feminino', 'Quartas', 4);
adicionarJogos(11, 'Futsal Feminino', 'Feminino', 'Semifinal', 2);
adicionarJogos(11, 'Futsal Feminino', 'Feminino', 'Terceiro Lugar', 1);
adicionarJogos(11, 'Futsal Feminino', 'Feminino', 'Final', 1);
adicionarJogos(45, 'Tênis de Mesa Feminino', 'Feminino', 'Fase de Grupos', 36);
adicionarJogos(45, 'Tênis de Mesa Feminino', 'Feminino', 'Oitavas', 8);
adicionarJogos(45, 'Tênis de Mesa Feminino', 'Feminino', 'Quartas', 4);
adicionarJogos(45, 'Tênis de Mesa Feminino', 'Feminino', 'Semifinal', 4);
adicionarJogos(45, 'Tênis de Mesa Feminino', 'Feminino', 'Terceiro Lugar', 2);
adicionarJogos(45, 'Tênis de Mesa Feminino', 'Feminino', 'Final', 2);

const agenda = montarAgenda(jogos);
const idsExistentes = jogos.map((jogo) => jogo.id).sort((a, b) => a - b);
const idsAgendados = agenda.map((jogo) => jogo.id).sort((a, b) => a - b);
assert.deepStrictEqual(idsAgendados, idsExistentes);
assert.strictEqual(new Set(agenda.map((jogo) => `${jogo.data}|${jogo.horario}|${jogo.local}`)).size, agenda.length);

agenda.forEach((jogo) => {
  const hora = Number(jogo.horario.slice(0, 2));
  assert(hora >= 8 && hora <= 21);
  if (jogo.fase === 'Fase de Grupos') assert(DIAS_GRUPOS.includes(jogo.data));
  else assert.strictEqual(jogo.data, DIA_ELIMINATORIAS);
  assert(!jogo.local.includes('A definir'));
});

const gruposPorDia = DIAS_GRUPOS.map((dia) =>
  agenda.filter((jogo) => jogo.fase === 'Fase de Grupos' && jogo.data === dia).length
);
assert.deepStrictEqual(gruposPorDia, [61, 60]);
assert.strictEqual(agenda.filter((jogo) => jogo.data === DIA_ELIMINATORIAS).length, 56);
assert.throws(() => montarAgenda([]), /Não há jogos existentes/);
assert.throws(() => montarAgenda([{ ...jogos[0], fase: 'Fase desconhecida' }]), /Fase não reconhecida/);

console.log('Agenda preserva os confrontos existentes e distribui data, horário e local.');
