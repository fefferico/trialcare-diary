#!/usr/bin/env node
// Regenerate the lightweight project map from source files; uses Node built-ins only.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appRoot = path.join(root, 'src/app');
const output = path.join(root, '.agent');
const ignored = new Set(['node_modules', '.angular', 'dist', '.git']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(ts|html|css)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) files.push(target);
  }
}

function relative(file) { return path.relative(root, file).split(path.sep).join('/'); }
function titleFrom(file) { return path.basename(file).replace(/\.(ts|html|css)$/, '').replace(/[-_.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

walk(appRoot);
files.sort();
const source = files.filter(file => file.endsWith('.ts')).map(file => ({ file, text: fs.readFileSync(file, 'utf8') }));
const services = source.filter(item => /@Injectable\s*\(/.test(item.text));
const components = source.filter(item => /@Component\s*\(/.test(item.text));
const debt = source.flatMap(item => [...item.text.matchAll(/\/\/.*\b(TODO|FIXME)\b.*$/gm)].map(match => `- [ ] **${relative(item.file)}**: ${match[0].replace(/^\/\/\s*/, '')}`));

fs.mkdirSync(output, { recursive: true });
const api = ['# API Catalog', '', `> Generato da \`npm run update-context\` il ${new Date().toLocaleString('it-IT')}.`, '', '## Servizi', ''];
for (const item of services) {
  const className = item.text.match(/export\s+class\s+(\w+)/)?.[1] ?? titleFrom(item.file);
  const methods = [...item.text.matchAll(/^\s{2,}(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*:\s*([^\n{]+)\s*\{/gm)].map(match => `- \`${match[1]}(${match[2]})\`: \`${match[3].trim()}\``);
  api.push(`### ${className}`, '', `File: [${relative(item.file)}](../${relative(item.file)})`, '', ...(methods.length ? methods : ['Methods are defined in the source file.']), '');
}
api.push('## Standalone components', '');
for (const item of components) {
  const className = item.text.match(/export\s+class\s+(\w+)/)?.[1] ?? titleFrom(item.file);
  api.push(`- [${className}](../${relative(item.file)})`);
}
api.push('');
fs.writeFileSync(path.join(output, 'API_CATALOG.md'), api.join('\n'));

const featureDirs = [...new Set(source.map(item => path.relative(appRoot, path.dirname(item.file)).split(path.sep)[0]))].filter(Boolean).sort();
const architecture = [
  '# Architecture Map', '', `> Aggiornato automaticamente il ${new Date().toLocaleString('it-IT')}.`, '',
  '## Struttura', '', '- `src/app/core/`: Auth, Supabase, Storage, UI state, PDF e accesso ai dati.',
  '- `src/app/features/`: pagine dei registri clinici e componenti di sezione.',
  '- `src/app/shared/`: dropdown, calendario e selettore orario accessibili.',
  '- `supabase/migrations/`: schema PostgreSQL, policy RLS e Storage.', '',
  `## Aree Angular rilevate: ${featureDirs.join(', ')}`, '', '## File applicativi', '',
  ...files.map(file => `- [${titleFrom(file)}](../${relative(file)})`), '',
];
fs.writeFileSync(path.join(output, 'ARCHITECTURE.md'), architecture.join('\n'));

const health = ['# Project Health', '', `> Generato il ${new Date().toLocaleString('it-IT')}.`, '',
  `- Servizi Angular: ${services.length}`, `- Componenti standalone: ${components.length}`, `- File applicativi: ${files.length}`, '',
  '## TODO e FIXME', '', ...(debt.length ? debt : ['Nessun commento TODO/FIXME trovato.']), '',
  '## Migrazioni Supabase', '', ...fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => `- [${name}](../supabase/migrations/${name})`), '',
];
fs.writeFileSync(path.join(output, 'HEALTH_REPORT.md'), health.join('\n'));
console.log(`Contesto aggiornato: ${services.length} servizi, ${components.length} componenti, ${files.length} file.`);
