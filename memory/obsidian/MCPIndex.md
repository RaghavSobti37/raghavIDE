# MCP Connections

```json
{
  "ok": true,
  "summary": {
    "total": 3,
    "ok": 1,
    "needs_auth": 2,
    "warning": 0,
    "error": 0
  },
  "servers": [
    {
      "id": "render",
      "type": "http",
      "status": "needs_auth",
      "message": "missing env: RENDER_API_KEY",
      "url": "https://mcp.render.com/mcp"
    },
    {
      "id": "vercel",
      "type": "http",
      "status": "needs_auth",
      "message": "HTTP 401",
      "url": "https://mcp.vercel.com"
    },
    {
      "id": "open-design",
      "type": "stdio",
      "status": "ok",
      "message": "command available",
      "command": "C:\\Program Files\\nodejs\\node.exe"
    }
  ]
}

```
