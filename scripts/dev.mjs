// Runs the API and the storefront together with prefixed logs.
//   node scripts/dev.mjs         → development (watch mode)
//   node scripts/dev.mjs --prod  → production (run `npm run build` first)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = process.argv.includes('--prod');
const apps = [
  { name: 'api', color: '\x1b[33m', cwd: path.join(root, 'backend'), script: prod ? 'start' : 'dev' },
  { name: 'web', color: '\x1b[36m', cwd: path.join(root, 'frontend'), script: prod ? 'start' : 'dev' },
];

const children = apps.map((app) => {
  const child = spawn('npm', ['run', app.script], { cwd: app.cwd, shell: true, env: process.env });
  const prefix = `${app.color}[${app.name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n');
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`\nVELORA ${prod ? 'production' : 'development'} — storefront http://localhost:3000 · owner portal http://localhost:3000/admin · API http://localhost:4000\n`);
