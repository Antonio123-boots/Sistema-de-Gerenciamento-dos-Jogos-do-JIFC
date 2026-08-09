const assert = require('assert');
const { normalizarCPF, normalizarMatricula, validarCamposObrigatoriosAtleta } = require('../models/campusModel');

assert.strictEqual(normalizarCPF('12345678900'), '123.456.789-00');
assert.strictEqual(normalizarCPF('123.456.789-00'), '123.456.789-00');
assert.strictEqual(normalizarMatricula('123456789'), '123456789');
assert.throws(
  () => validarCamposObrigatoriosAtleta({
    nome: 'Ana Souza',
    matricula: '12345678',
    genero: 'Feminino',
    modalidades: ['Futsal Feminino'],
    dataNascimento: '2008-01-01',
    cpf: '12345678900'
  }),
  (error) => {
    assert.strictEqual(error.code, 'MATRICULA_INVALIDA');
    return true;
  }
);

console.log('Testes de máscara/validação concluídos com sucesso.');
