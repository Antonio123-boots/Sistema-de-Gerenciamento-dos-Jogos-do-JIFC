const assert = require('assert');
const ExcelJS = require('exceljs');
const {
  gerarPlanilhaAtletas,
  formatarDataNascimento,
  obterEsportes
} = require('../services/exportAtletasExcelService');

assert.strictEqual(formatarDataNascimento('2008-01-02'), '02/01/2008');
assert.strictEqual(formatarDataNascimento(new Date(2008, 0, 2)), '02/01/2008');
assert.strictEqual(obterEsportes({ modalidades: ['Futsal Feminino', 'Atletismo Feminino'] }), 'Futsal Feminino, Atletismo Feminino');

(async () => {
  const buffer = await gerarPlanilhaAtletas([
    {
      nome: 'Ana Souza',
      dataNascimento: '2008-01-02',
      cpf: '123.456.789-00',
      rg: '12.345.678-9',
      matricula: '20261102',
      genero: 'Feminino',
      modalidades: ['Futsal Feminino', 'Atletismo Feminino']
    }
  ], { campus: 'Campus Teste' });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  const cabecalhos = sheet.getRow(1).values.slice(1);
  assert.deepStrictEqual(cabecalhos, [
    'NOME',
    'DATA DE NASCIMENTO',
    'CPF',
    'RG',
    'MATRÍCULA',
    'GÊNERO',
    'ESPORTES QUE ESTÁ INSCRITO'
  ]);

  const linha = sheet.getRow(2).values.slice(1);
  assert.deepStrictEqual(linha, [
    'Ana Souza',
    '02/01/2008',
    '123.456.789-00',
    '12.345.678-9',
    '20261102',
    'Feminino',
    'Futsal Feminino, Atletismo Feminino'
  ]);

  assert.strictEqual(sheet.getCell('A1').fill.fgColor.argb, 'FF1D4ED8');
  assert.strictEqual(sheet.getCell('G1').fill.fgColor.argb, 'FF0E7490');
  assert.strictEqual(sheet.getCell('A2').fill.fgColor.argb, 'FFDBEAFE');
  assert.strictEqual(sheet.getCell('G2').fill.fgColor.argb, 'FFCFFAFE');
  assert.strictEqual(sheet.getCell('A1').font.color.argb, 'FFFFFFFF');

  console.log('Exportação de atletas para Excel validada com sucesso.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
