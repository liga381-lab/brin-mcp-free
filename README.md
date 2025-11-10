
# BRIN MCP (Free) on Render

Minimal MCP-like HTTP gateway with SQL (Neon), Memory, and HTTP proxy tools.

## Endpoints
- `GET /health`
- `POST /mcp/sql.query`  -> `{ query, params? }`
- `POST /mcp/sql.write`  -> `{ query, params? }`
- `POST /mcp/memory.get` -> `{ taskType }`
- `POST /mcp/memory.set` -> `{ taskType, key?, value?, successRate? }`
- `POST /mcp/http.fetch` -> `{ url, method?, headers?, body? }`

## Env
- `PG_URL`    = Neon connection string (sslmode=require)
- `MCP_TOKEN` = Bearer token used by n8n (e.g. brin_secret_token_123)
- `ALLOWLIST` = Comma separated allow-list for HTTP proxy (e.g. https://jsonplaceholder.typicode.com)

## Run locally
```
npm install
PG_URL=postgres://... MCP_TOKEN=token ALLOWLIST=https://jsonplaceholder.typicode.com node server.js
```
