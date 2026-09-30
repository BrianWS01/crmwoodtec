// Roda os testes no Node (18+):  node tests/run.mjs
import { rodar } from './harness.js';
import './validators.test.js';
import './regras.test.js';
import './automacao.test.js';

const resultados = await rodar();
const falhas = resultados.filter((r) => !r.ok);

for (const r of resultados) {
  console.log(`${r.ok ? '✔' : '✘'} ${r.nome}${r.ok ? '' : `\n    ${r.erro}`}`);
}
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} testes passaram.`);
process.exit(falhas.length ? 1 : 0);
