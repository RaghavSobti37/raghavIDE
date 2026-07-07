import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import {
  loadHubConfig,
  skillsManifestPath,
  verifyMcpScriptPath,
  hubRoot,
} from './lib/hub.mjs';
import { loadEnvFile } from './lib/env.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = new Hono();
app.use('/api/*', cors());

app.get('/api/hub-config', async (c) => {
  const config = await loadHubConfig();
  return c.json(config);
});

app.get('/api/skills', async (c) => {
  const config = await loadHubConfig();
  const manifestPath = skillsManifestPath(config);
  const raw = await fs.readFile(manifestPath, 'utf8');
  return c.json(JSON.parse(raw));
});

app.post('/api/open-folder', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const initial = body.initial || process.env.USERPROFILE || 'C:\\';
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Select project folder'
$d.SelectedPath = '${initial.replace(/'/g, "''")}'
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }
`;
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', ps],
    { windowsHide: true, timeout: 120000 },
  );
  const folder = stdout.trim();
  if (!folder) return c.json({ ok: false, error: 'cancelled' }, 400);
  return c.json({ ok: true, path: folder });
});

function resolveSafe(base, target) {
  const resolved = path.resolve(base, target || '.');
  if (!resolved.toLowerCase().startsWith(path.resolve(base).toLowerCase())) {
    throw new Error('path outside workspace');
  }
  return resolved;
}

app.get('/api/files', async (c) => {
  const root = c.req.query('root');
  const rel = c.req.query('path') || '.';
  if (!root) return c.json({ error: 'root required' }, 400);
  const dir = resolveSafe(root, rel);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith('.') || e.name === '.git')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (e) => ({
        name: e.name,
        path: path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/'),
        type: e.isDirectory() ? 'dir' : 'file',
      })),
  );
  return c.json({ root, path: rel, entries: items });
});

app.get('/api/file', async (c) => {
  const root = c.req.query('root');
  const rel = c.req.query('path');
  if (!root || !rel) return c.json({ error: 'root and path required' }, 400);
  const filePath = resolveSafe(root, rel);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) return c.json({ error: 'not a file' }, 400);
  const content = await fs.readFile(filePath, 'utf8');
  return c.json({ path: rel, content });
});

app.put('/api/file', async (c) => {
  const { root, path: rel, content } = await c.req.json();
  if (!root || !rel) return c.json({ error: 'root and path required' }, 400);
  const filePath = resolveSafe(root, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content ?? '', 'utf8');
  return c.json({ ok: true, path: rel });
});

app.get('/api/git/status', async (c) => {
  const root = c.req.query('path');
  if (!root) return c.json({ error: 'path required' }, 400);
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', root, 'status', '--porcelain=v1', '-b'],
      { windowsHide: true },
    );
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    const branchLine = lines.find((l) => l.startsWith('##')) || '';
    const branch = branchLine.replace(/^##\s*/, '').split('...')[0] || 'unknown';
    const files = lines
      .filter((l) => !l.startsWith('##'))
      .map((l) => ({ code: l.slice(0, 2), file: l.slice(3) }));
    return c.json({ ok: true, branch, files, raw: stdout });
  } catch (err) {
    return c.json({ ok: false, error: err.message });
  }
});

async function mcpStatusInline() {
  const config = await loadHubConfig();
  const mcpPath = config.mcpCanonical;
  let servers = {};
  try {
    const raw = await fs.readFile(mcpPath, 'utf8');
    servers = JSON.parse(raw).mcpServers || {};
  } catch (err) {
    return { ok: false, source: 'inline', error: err.message, servers: {} };
  }
  const entries = Object.entries(servers).map(([id, cfg]) => ({
    id,
    status: cfg.url || cfg.command ? 'configured' : 'unknown',
    type: cfg.url ? 'url' : cfg.command ? 'stdio' : 'unknown',
  }));
  return { ok: true, source: 'inline', servers: entries };
}

app.get('/api/mcp/status', async (c) => {
  const script = verifyMcpScriptPath();
  if (existsSync(script)) {
    try {
      const { stdout } = await execFileAsync(process.execPath, [script], {
        windowsHide: true,
        cwd: hubRoot(),
      });
      return c.json(JSON.parse(stdout));
    } catch (err) {
      const inline = await mcpStatusInline();
      return c.json({ ...inline, scriptError: err.message });
    }
  }
  return c.json(await mcpStatusInline());
});

app.get('/api/9router/status', async (c) => {
  const config = await loadHubConfig();
  const env = await loadEnvFile(config.nineRouterEnv);
  const baseUrl = env.NINEROUTER_BASE_URL || 'http://127.0.0.1:20128/v1';
  const apiKey = env.NINEROUTER_API_KEY || env.OPENAI_API_KEY || '';
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return c.json({
        ok: false,
        url: baseUrl,
        status: res.status,
        error: await res.text(),
      });
    }
    const data = await res.json();
    return c.json({
      ok: true,
      url: baseUrl,
      model: env.NINEROUTER_MODEL || config.defaultModel,
      modelCount: Array.isArray(data.data) ? data.data.length : 0,
    });
  } catch (err) {
    return c.json({ ok: false, url: baseUrl, error: err.message });
  }
});

async function findHermes(config) {
  const candidates = [
    path.join(config.hermesHome, 'hermes.exe'),
    path.join(config.hermesHome, 'bin', 'hermes.exe'),
    path.join(config.hermesHome, 'hermes.cmd'),
  ];
  for (const cmd of candidates) {
    if (existsSync(cmd)) return cmd;
  }
  try {
    await execFileAsync('where.exe', ['hermes'], { windowsHide: true });
    return 'hermes';
  } catch {
    return null;
  }
}

app.post('/api/agent/run', async (c) => {
  const body = await c.req.json();
  const { prompt, cwd, skills = [] } = body;
  if (!prompt) return c.json({ error: 'prompt required' }, 400);

  const config = await loadHubConfig();
  const envFile = await loadEnvFile(config.nineRouterEnv);
  const childEnv = { ...process.env, ...envFile };
  const workDir = cwd || config.tscPlatformRoot;
  const skillsNote =
    skills.length > 0 ? `\n\n[skills: ${skills.join(', ')}]` : '';
  const fullPrompt = `${prompt}${skillsNote}`;

  const hermes = await findHermes(config);
  const startedAt = Date.now();

  if (hermes) {
    return new Promise((resolve) => {
      const args =
        hermes.endsWith('.exe') || hermes.endsWith('.cmd')
          ? ['chat', fullPrompt]
          : ['chat', fullPrompt];
      const child = spawn(hermes, args, {
        cwd: workDir,
        env: childEnv,
        shell: hermes === 'hermes',
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('close', (code) => {
        if (code !== 0 && !stdout && !stderr) {
          resolve(runEchoFallback(c, fullPrompt, workDir, childEnv, startedAt));
          return;
        }
        resolve(
          c.json({
            ok: code === 0,
            mode: 'hermes',
            code,
            stdout,
            stderr,
            durationMs: Date.now() - startedAt,
          }),
        );
      });
      child.on('error', () => {
        resolve(runEchoFallback(c, fullPrompt, workDir, childEnv, startedAt));
      });
    });
  }

  return runEchoFallback(c, fullPrompt, workDir, childEnv, startedAt);
});

async function runEchoFallback(c, fullPrompt, workDir, childEnv, startedAt) {
  const echo = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Write-Output ${JSON.stringify(fullPrompt)}`],
    { cwd: workDir, env: childEnv, windowsHide: true },
  );
  return c.json({
    ok: true,
    mode: 'echo',
    stdout: echo.stdout,
    stderr: echo.stderr,
    note: 'hermes not found; echoed prompt',
    durationMs: Date.now() - startedAt,
  });
}

app.get('/', async (c) => {
  const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  return c.html(html);
});

const config = await loadHubConfig();
const port = config.workstationPort || 3028;

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: '127.0.0.1',
  },
  (info) => {
    console.log(`Agent Workstation http://127.0.0.1:${info.port}`);
  },
);

const wss = new WebSocketServer({ noServer: true });
const terminals = new Map();

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  if (url.pathname !== '/api/terminal') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, request) => {
  const url = new URL(request.url || '/', `http://localhost`);
  const cwd = url.searchParams.get('cwd') || process.env.USERPROFILE || 'C:\\';
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const term = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd,
    env: process.env,
  });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  terminals.set(id, term);

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  term.onExit(() => {
    terminals.delete(id);
    ws.close();
  });

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        term.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {
      // raw input
    }
    term.write(msg.toString());
  });
  ws.on('close', () => {
    term.kill();
    terminals.delete(id);
  });
});
