const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arquivos = fs.readdirSync(__dirname)
  .filter((arquivo) => arquivo.endsWith('.test.js'))
  .sort();

if (arquivos.length === 0) {
  console.log('Nenhum teste encontrado.');
  process.exit(0);
}

let falhas = 0;
for (const arquivo of arquivos) {
  const resultado = spawnSync(process.execPath, [path.join(__dirname, arquivo)], {
    encoding: 'utf8',
    timeout: 60000
  });

  const passou = resultado.status === 0;
  console.log(`${passou ? 'PASS' : 'FAIL'}  ${arquivo}`);

  if (!passou) {
    falhas += 1;
    if (resultado.stdout) process.stdout.write(resultado.stdout);
    if (resultado.stderr) process.stderr.write(resultado.stderr);
    if (resultado.error && resultado.error.code === 'ETIMEDOUT') {
      console.error(`  (timeout: o teste travou por mais de 60s)`);
    }
  }
}

console.log('');
if (falhas === 0) {
  console.log(`✅ Todos os ${arquivos.length} testes passaram.`);
} else {
  console.log(`❌ ${falhas} de ${arquivos.length} testes falharam.`);
}
process.exit(falhas === 0 ? 0 : 1);
