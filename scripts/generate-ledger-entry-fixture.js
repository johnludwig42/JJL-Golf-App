import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('ledger-report', 'shell.html'), 'utf8');
const html = source
  .replaceAll('url(\'./fonts/', 'url(\'../ledger-report/fonts/')
  .replaceAll('src="./bootstrap.js', 'src="../ledger-report/bootstrap.js')
  .replaceAll('src="./pack.js', 'src="../ledger-report/pack.js')
  .replaceAll('src="./engines.js', 'src="../ledger-report/engines.js')
  .replaceAll('src="./report.js', 'src="../ledger-report/report.js');
const output = resolve('reports', 'ledger-entry-v31.0.02-reference.html');
writeFileSync(output, html, 'utf8');
console.log(`Generated ${output} from the production Ledger Entry shell.`);
