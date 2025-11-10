
import express from "express";
import cors from "cors";
import pkg from "pg";
import axios from "axios";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3000;
const PG_URL = process.env.PG_URL;        // Neon DB connection string
const MCP_TOKEN = process.env.MCP_TOKEN;  // Bearer token for auth, e.g., brin_secret_token_123
const ALLOWLIST = (process.env.ALLOWLIST || "")
  .split(",")
  .map(a => a.trim())
  .filter(Boolean);

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Auth middleware
app.use((req, res, next) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== MCP_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// Postgres pool
const db = new Pool({
  connectionString: PG_URL,
  ssl: { rejectUnauthorized: false }
});

const safeQuery = async (query, params=[]) => {
  return db.query(query, params);
};

// SQL read
app.post("/mcp/sql.query", async (req, res) => {
  try {
    const { query, params = [] } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });
    const rs = await safeQuery(query, params);
    res.json({ rows: rs.rows, rowCount: rs.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SQL write
app.post("/mcp/sql.write", async (req, res) => {
  try {
    const { query, params = [] } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });
    const rs = await safeQuery(query, params);
    res.json({ success: true, rowCount: rs.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Memory get
app.post("/mcp/memory.get", async (req, res) => {
  try {
    const { taskType } = req.body || {};
    if (!taskType) return res.status(400).json({ error: "taskType required" });
    const q = `SELECT * FROM workflow_memory WHERE task_type=$1 ORDER BY last_used DESC LIMIT 1`;
    const rs = await safeQuery(q, [taskType]);
    res.json({ memory: rs.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Memory set (upsert)
app.post("/mcp/memory.set", async (req, res) => {
  try {
    const { taskType, key = null, value = {}, successRate = 1.0 } = req.body || {};
    if (!taskType) return res.status(400).json({ error: "taskType required" });
    const q = `
      INSERT INTO workflow_memory (task_type, key, value, success_rate, last_used)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (task_type, key)
      DO UPDATE SET value=EXCLUDED.value, success_rate=EXCLUDED.success_rate, last_used=NOW()
      RETURNING *
    `;
    const rs = await safeQuery(q, [taskType, key, value, successRate]);
    res.json({ memory: rs.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// HTTP proxy with allowlist
app.post("/mcp/http.fetch", async (req, res) => {
  try {
    const { url, method = "GET", headers = {}, body } = req.body || {};
    if (!url) return res.status(400).json({ error: "url required" });
    const ok = ALLOWLIST.some(dom => url.startsWith(dom));
    if (!ok) return res.status(403).json({ error: "domain not allowed" });

    const r = await axios({ url, method, headers, data: body, validateStatus: () => true });
    res.json({ status: r.status, data: r.data, headers: r.headers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`MCP running on ${PORT}`));
