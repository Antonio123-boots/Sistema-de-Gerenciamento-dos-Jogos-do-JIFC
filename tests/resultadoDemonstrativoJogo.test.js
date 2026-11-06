const assert = require('assert');
const { gerarResultadoDemonstrativo } = require('../utils/resultadoDemonstrativoJogo');

function jogo(id, modalidade, fase = 'Fase de Grupos', modalidadeId = 1) {
  return {
    id,
    modalidade_id: modalidadeId,
    modalidade,
    fase,
    campus_1_id: 1,
    campus_2_id: 2,
    atleta_1_id: null,
    atleta_2_id: null
  };
}

assert.strictEqual(gerarResultadoDemonstrativo(jogo(1, 'Futsal Masculino', 'Final')), null);

for (const modalidade of [
  'Futsal Masculino',
  'Handebol Feminino',
  'Basquete Masculino',
  'Vôlei Feminino',
  'Vôlei de Praia Feminino',
  'Tênis de Mesa Masculino'
]) {
  for (const fase of ['Fase de Grupos', 'Semifinal', 'Terceiro Lugar']) {
    const partida = jogo(78, modalidade, fase, 12);
    const resultado = gerarResultadoDemonstrativo(partida);
    assert.deepStrictEqual(resultado, gerarResultadoDemonstrativo(partida));
    assert(Number.isInteger(resultado.placar1));
    assert(Number.isInteger(resultado.placar2));

    if (modalidade.startsWith('Basquete') || fase !== 'Fase de Grupos' || !resultado.sets.length) {
      if (fase !== 'Fase de Grupos' || !/^(Futsal|Handebol)/.test(modalidade)) {
        assert.notStrictEqual(resultado.placar1, resultado.placar2);
      }
    }

    if (resultado.sets.length) {
      const praia = /praia/i.test(modalidade);
      assert(resultado.sets.length >= (praia ? 2 : 3));
      assert(resultado.sets.length <= (praia ? 3 : 5));
      resultado.sets.forEach((set, index) => {
        assert.strictEqual(set.numero, index + 1);
        assert(Math.abs(set.pontos_1 - set.pontos_2) >= 2);
      });
      assert.notStrictEqual(resultado.placar1, resultado.placar2);
    }
  }
}

assert.throws(() => gerarResultadoDemonstrativo(jogo(1, 'Esporte Desconhecido')), /Não há regras/);
console.log('Resultados demonstrativos são determinísticos e finais permanecem sem placar.');
