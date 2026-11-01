import { readFile } from 'node:fs/promises';
import { parseSync } from '@babel/core';
const files = ['shared/release-labels.ts', 'shared/security-labels.ts', 'shared/finance-labels.ts', 'shared/life-labels.ts', 'shared/integration-labels.ts', 'src/lib/i18n.ts', 'src/lib/registration-i18n.ts'];
let pairs = 0;
for (const file of files) {
  const source = await readFile(file, 'utf8');
  if (/\?{3,}|\uFFFD/.test(source)) throw new Error(`${file}: damaged translation text`);
  const ast = parseSync(source, { filename: file, babelrc: false, configFile: false, parserOpts: { plugins: ['typescript'] } });
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectProperty' && node.value?.type === 'ArrayExpression') {
      const values = node.value.elements;
      if (values.length !== 2 || !values.every(v => v?.type === 'StringLiteral' && v.value.trim())) throw new Error(`${file}: incomplete bilingual label at line ${node.loc?.start.line}`);
      pairs++;
    }
    if (node.type === 'ObjectExpression') {
      const keys = node.properties.filter(p => p.type === 'ObjectProperty').map(p => p.key.name ?? p.key.value);
      if (keys.length !== new Set(keys).size) throw new Error(`${file}: duplicate translation key`);
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'loc') {
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
}
console.log(`Localization check passed: ${pairs} bilingual entries; ${files.length} catalogues; no damaged text or duplicate keys.`);
