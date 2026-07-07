import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = 3028;
const url = `http://127.0.0.1:${port}/api/hub-config`;

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let failed = false;
const timer = setTimeout(() => done(1, 'timeout waiting for server'), 15000);

function done(code, msg) {
  if (failed) return;
  failed = true;
  clearTimeout(timer);
  child.kill('SIGTERM');
  if (msg) console.error(msg);
  process.exit(code);
}

child.stderr.on('data', (d) => process.stderr.write(d));
child.stdout.on('data', (d) => process.stdout.write(d));

async function probe() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.workstationPort) throw new Error('invalid hub-config payload');
      console.log('smoke ok:', data.workstationPort);
      done(0);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  done(1, 'could not reach /api/hub-config');
}

child.on('exit', (code) => {
  if (!failed) done(code || 1, `server exited early (${code})`);
});

probe();
