# MCP Auth per IDE

Hub writes the same `mcpServers` block to each IDE via `scripts/sync-mcp-config.mjs`.

## Targets

| IDE | Config path |
|-----|-------------|
| Cursor | `%USERPROFILE%\.cursor\mcp.json` |
| VS Code | `%APPDATA%\Code\User\mcp.json` |
| TSC Platform (optional) | `<tscPlatformRoot>\.cursor\mcp.json` |

TSC Platform path comes from `hub.config.json` → `tscPlatformRoot`. Sync skips it if the directory does not exist.

## Cursor

### OAuth servers (Vercel, Supabase, Sentry, Neon, PostHog, Clerk, Prisma Remote)

1. `node scripts/sync-mcp-config.mjs`
2. Restart Cursor or reload MCP.
3. Click **Needs login** on the server tile; complete browser OAuth.

### Bearer servers (Render, Resend, Bright Data, BrowserStack)

Set env vars in Windows User Environment or a `.env` loaded before Cursor starts:

```powershell
[System.Environment]::SetEnvironmentVariable("RENDER_API_KEY", "rnd_...", "User")
```

Hub config uses Cursor's `${env:RENDER_API_KEY}` syntax in `mcp.servers.json`.

### Stdio servers (Open Design, MongoDB, Browse, Prisma Local)

- **Open Design** — daemon must run at `http://127.0.0.1:7456`; paths in `mcp.servers.json` point to your local `open-design` install.
- **MongoDB** — set `MDB_MCP_CONNECTION_STRING`; plugin uses `npx mongodb-mcp-server`.
- **Browse** — Cursor sets `CURSOR_PLUGIN_ROOT` when launching the plugin stdio server.

## VS Code

Same `mcp.json` shape. OAuth flows use VS Code's MCP UI (Command Palette → MCP: List Servers). Bearer tokens must be in the user environment before launching VS Code.

## Verify

```bash
node scripts/verify-mcp.mjs
```

Status values: `reachable` / `ok`, `needs_auth`, `warning`, `error`.

## Workflow

```bash
# 1. Refresh plugin paths in catalog (optional)
node scripts/discover-mcp-plugins.mjs --write

# 2. Edit config/mcp.servers.json (enabled + mcpServers)

# 3. Push to all IDE configs
node scripts/sync-mcp-config.mjs

# 4. Check servers
node scripts/verify-mcp.mjs
```
