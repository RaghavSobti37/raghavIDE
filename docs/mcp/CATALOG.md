# MCP Server Catalog

Canonical metadata lives in `config/mcp.catalog.json`. Run discovery to refresh plugin paths from the Cursor plugin cache:

```bash
node scripts/discover-mcp-plugins.mjs --write
```

## Servers

| ID | Name | Auth | Env vars | Docs |
|----|------|------|----------|------|
| `render` | Render | bearer | `RENDER_API_KEY` | [Render MCP](https://render.com/docs/mcp) |
| `vercel` | Vercel | oauth | — | [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp) |
| `supabase` | Supabase | oauth | — | [Supabase MCP](https://supabase.com/docs/guides/getting-started/mcp) |
| `prisma` | Prisma | oauth | — | [Prisma MCP](https://www.prisma.io/docs/postgres/integrations/mcp-server) |
| `sentry` | Sentry | oauth | — | [Sentry MCP](https://docs.sentry.io/product/sentry-mcp/) |
| `bright-data` | Bright Data | bearer | `BRIGHT_DATA_API_TOKEN`, zones | [Bright Data MCP](https://docs.brightdata.com/ai/mcp-server/overview) |
| `neon-postgres` | Neon Postgres | oauth | — | [Neon MCP](https://neon.com/docs/ai/neon-mcp-server) |
| `mongodb` | MongoDB | stdio | `MDB_MCP_CONNECTION_STRING` | [MongoDB MCP](https://www.mongodb.com/docs/mcp-server/) |
| `open-design` | Open Design | stdio | `OD_DATA_DIR` | Local daemon (no Cursor plugin) |
| `browserstack` | BrowserStack | bearer | `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` | [BrowserStack MCP](https://www.browserstack.com/docs/mcp-server) |
| `posthog` | PostHog | oauth | — | [PostHog MCP](https://posthog.com/docs/model-context-protocol) |
| `clerk` | Clerk | oauth | — | [Clerk MCP](https://clerk.com/docs/mcp/overview) |
| `resend` | Resend | bearer | `RESEND_API_KEY` | [Resend MCP](https://resend.com/docs/mcp) |
| `browse` | Browse | stdio | `CURSOR_PLUGIN_ROOT` | [Cursor MCP](https://cursor.com/docs/context/mcp) |

## Enabling servers

Edit `config/mcp.servers.json`:

1. Add the server id to `enabled`.
2. Add or copy the `mcpServers.<id>` block (from plugin `mcp.json` or vendor docs).
3. Run `node scripts/sync-mcp-config.mjs` to push to IDE configs.
4. Run `node scripts/verify-mcp.mjs` to check connectivity.

## Auth types

- **oauth** — IDE prompts browser login on first use; no env vars in hub.
- **bearer** — set API key env var before sync; hub uses `${env:VAR}` placeholders.
- **stdio** — local process via `command`/`args`; may need env vars or running daemon.
- **none** — public HTTP tools only (rare).
