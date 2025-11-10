import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3000;
const MCP_TOKEN = process.env.MCP_TOKEN || "change_me";
const ALLOWLIST = (process.env.ALLOWLIST || "")
  .split(",").map(s => s.trim()).filter(Boolean);

// DB locale (gratis). Render Free lo preserva tra i riavvii; si resetta solo ai redeploy.
const db = new Database("data.db");

// Init schema se mancante (JSON salvato come TEXT)
db.exec(`
  CREATE TABLE IF NOT EXISTS routing_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    condition_key TEXT NOT NULL,
    condition_value TEXT NOT NULL,
    target_workflow TEXT NOT NULL,
    confidence_weight REAL DEFAULT 1.0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    consecutive_failures INTEGER DEFAULT 0,
    is_circuit_open INTEGER DEFAULT 0,
    last_failure_time TEXT,
    is_active INTEGER DEFAULT 1,
    last_updated TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS workflow_memory (
    task_type TEXT NOT NULL,
    key TEXT,
    value TEXT,
    success_rate REAL DEFAULT 1.0,
    last_used TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (task_type, key)
  );
  CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    parent_workflow_id TEXT,
    workflow_type TEXT NOT NULL,
    input_data TEXT,
    output_data TEXT,
    status TEXT NOT NULL,
    result TEXT,
    execution_time_ms INTEGER,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

// Seed routing base se vuoto
const cnt = db.prepare("SELECT COUNT(*) AS c FROM routing_rules").get().c;
if (!cnt) {
  const ins = db.prepare(`INSERT INTO routing_rules
    (condition_key, condition_value, target_workflow, confidence_weight)
    VALUES (?,?,?,?)`);
  ins.run("taskType","notification","worker-notification-prod",1.0);
  ins.run("taskType","api_integration","worker-api-integration-prod",1.0);
  ins.run("taskType","data_processing","worker-data-processing-prod",1.0);
}

// Health (senza auth)
app.get("/health", (req,res)=> res.json({ ok:true }));

// Auth
app.use((req,res,next)=>{
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ") || h.slice(7) !== MCP_TOKEN) {
    return res.status(401).json({ error:"unauthorized" });
  }
  next();
});

// Converti $1,$2,... in ? per SQLite
const toSqlite = (q) => q.replace(/\$\d+/g, "?");

// Helper parse JSON string fields if present
const tryParse = (v)=>{ try{ return JSON.parse(v); } catch(_){ return v; } };

// SQL query (SELECT)
app.post("/mcp/sql.query", (req,res)=>{
  try{
    const { query, params = [] } = req.body || {};
    if(!query) return res.status(400).json({ error:"query required" });
    const stmt = db.prepare(toSqlite(query));
    const rows = stmt.all(params);
    res.json({ rows, rowCount: rows.length });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// SQL write (INSERT/UPDATE/DELETE)
app.post("/mcp/sql.write", (req,res)=>{
  try{
    const { query, params = [] } = req.body || {};
    if(!query) return res.status(400).json({ error:"query required" });
    const stmt = db.prepare(toSqlite(query));
    const info = stmt.run(params);
    res.json({ success:true, changes: info.changes });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Memory get
app.post("/mcp/memory.get", (req,res)=>{
  try{
    const { taskType } = req.body || {};
    if(!taskType) return res.status(400).json({ error:"taskType required" });
    const row = db.prepare(
      "SELECT task_type, key, value, success_rate, last_used FROM workflow_memory WHERE task_type=? ORDER BY last_used DESC LIMIT 1"
    ).get(taskType);
    if(row && row.value) row.value = tryParse(row.value);
    res.json({ memory: row || null });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// Memory set (upsert)
app.post("/mcp/memory.set", (req,res)=>{
  try{
    const { taskType, key=null, value={}, successRate=1.0 } = req.body || {};
    if(!taskType) return res.status(400).json({ error:"taskType required" });
    const val = JSON.stringify(value);
    db.prepare(`
      INSERT INTO workflow_memory (task_type, key, value, success_rate, last_used)
      VALUES (?,?,?,?,datetime('now'))
      ON CONFLICT(task_type,key) DO UPDATE SET
        value=excluded.value, success_rate=excluded.success_rate, last_used=datetime('now')
    `).run(taskType, key, val, successRate);
    const row = db.prepare("SELECT * FROM workflow_memory WHERE task_type=? AND key IS ?")
      .get(taskType, key);
    row.value = tryParse(row.value);
    res.json({ memory: row });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// HTTP proxy con allowlist
app.post("/mcp/http.fetch", async (req,res)=>{
  try{
    const { url, method="GET", headers={}, body } = req.body || {};
    if(!url) return res.status(400).json({ error:"url required" });
    const ok = ALLOWLIST.some(d => url.startsWith(d));
    if(!ok) return res.status(403).json({ error:"domain not allowed" });

    const r = await axios({ url, method, headers, data: body, validateStatus: ()=>true });
    res.json({ status:r.status, data:r.data, headers:r.headers });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

app.listen(PORT, ()=> console.log(`MCP (SQLite) on ${PORT}`));
