
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS routing_rules (
  id SERIAL PRIMARY KEY,
  condition_key TEXT NOT NULL,
  condition_value TEXT NOT NULL,
  target_workflow TEXT NOT NULL,
  confidence_weight NUMERIC DEFAULT 1.0,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  consecutive_failures INT DEFAULT 0,
  is_circuit_open BOOLEAN DEFAULT FALSE,
  last_failure_time TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_memory (
  task_type TEXT NOT NULL,
  key TEXT,
  value JSONB,
  success_rate NUMERIC DEFAULT 1.0,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_type, key)
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id TEXT,
  parent_workflow_id TEXT,
  workflow_type TEXT NOT NULL,
  input_data JSONB,
  output_data JSONB,
  status TEXT NOT NULL,
  result JSONB,
  execution_time_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exec_created_at ON workflow_executions (created_at);
CREATE INDEX IF NOT EXISTS idx_exec_type ON workflow_executions (workflow_type);
CREATE INDEX IF NOT EXISTS idx_exec_status ON workflow_executions (status);
CREATE INDEX IF NOT EXISTS idx_rules_active ON routing_rules (is_active);
CREATE INDEX IF NOT EXISTS idx_rules_condition ON routing_rules (condition_key, condition_value);
CREATE INDEX IF NOT EXISTS idx_memory_task ON workflow_memory (task_type);
CREATE INDEX IF NOT EXISTS idx_memory_last_used ON workflow_memory (last_used);
