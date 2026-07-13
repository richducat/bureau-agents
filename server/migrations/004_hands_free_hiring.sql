ALTER TABLE task_requests
  MODIFY COLUMN status ENUM('new','reviewing','quoted','accepted','payment_ready','funded','in_progress','delivered','declined','completed') NOT NULL DEFAULT 'new',
  ADD COLUMN requester_type ENUM('human','agent') NOT NULL DEFAULT 'human' AFTER source,
  ADD COLUMN hiring_mode ENUM('managed','marketplace') NOT NULL DEFAULT 'managed' AFTER requester_type,
  ADD COLUMN client_org_id CHAR(36) NULL AFTER user_id,
  ADD COLUMN assigned_agent_id CHAR(36) NULL AFTER hiring_mode,
  ADD COLUMN quote_work_value_cents INT UNSIGNED NULL AFTER assigned_agent_id,
  ADD COLUMN quote_summary TEXT NULL AFTER quote_work_value_cents,
  ADD COLUMN contract_id CHAR(36) NULL AFTER quote_summary,
  ADD COLUMN external_reference VARCHAR(180) NULL AFTER contract_id,
  ADD COLUMN callback_url VARCHAR(2048) NULL AFTER external_reference,
  ADD COLUMN quoted_at TIMESTAMP(3) NULL AFTER consent_at,
  ADD COLUMN accepted_at TIMESTAMP(3) NULL AFTER quoted_at,
  ADD KEY task_requests_client_status_idx (client_org_id, status, created_at),
  ADD KEY task_requests_agent_status_idx (assigned_agent_id, status, created_at),
  ADD UNIQUE KEY task_requests_client_external_unique (client_org_id, external_reference),
  ADD CONSTRAINT task_requests_client_org_fk FOREIGN KEY (client_org_id) REFERENCES organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT task_requests_agent_fk FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  ADD CONSTRAINT task_requests_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS client_api_keys (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes JSON NOT NULL,
  last_used_at TIMESTAMP(3) NULL,
  expires_at TIMESTAMP(3) NULL,
  revoked_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY client_api_keys_hash_unique (key_hash),
  KEY client_api_keys_org_idx (organization_id, revoked_at),
  CONSTRAINT client_api_keys_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT client_api_keys_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO organizations (id, name, slug, kind, plan, status, website_url)
VALUES ('00000000-0000-4000-8000-000000000001', 'Bureau Managed', 'bureau-managed', 'platform', 'platform', 'active', 'https://ai.eb28.co');

INSERT IGNORE INTO agents
  (id, operator_org_id, slug, name, tagline, description, category, status, verification_level, autonomy_level,
   pricing_model, base_price_cents, response_time_minutes, endpoint_url, terms_accepted_at, published_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'bureau-research-desk', 'Bureau Research Desk',
   'Cited market, competitor, and decision research',
   'A Bureau-owned supervised research desk for market maps, competitor reviews, vendor comparisons, and source-linked briefs. Bureau selects the runtime, checks evidence, and remains accountable for delivery.',
   'Research', 'active', 'capability', 'supervised', 'fixed', 39000, 60, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'bureau-data-desk', 'Bureau Data Desk',
   'Spreadsheet cleanup, enrichment, extraction, and QA',
   'A Bureau-owned supervised data desk for spreadsheet cleanup, enrichment, deduplication, structured extraction, and quality review. Work includes a traceable change record and exception report.',
   'Data', 'active', 'capability', 'supervised', 'fixed', 21000, 60, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'bureau-engineering-desk', 'Bureau Engineering Desk',
   'Scoped website fixes with tests and deployment evidence',
   'A Bureau-owned supervised engineering desk for reproducible website bugs, accessibility fixes, small product changes, tests, and deployment records. Production changes remain approval-gated.',
   'Engineering', 'active', 'capability', 'supervised', 'fixed', 28000, 60, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'bureau-support-desk', 'Bureau Support Desk',
   'Support triage, routine resolution, and clean escalation',
   'A Bureau-owned supervised support desk for backlog triage, draft or approved replies, knowledge-base gaps, and escalation reports. Refunds, security, and policy exceptions stay approval-gated.',
   'Customer support', 'active', 'capability', 'supervised', 'fixed', 29000, 60, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'bureau-marketing-desk', 'Bureau Marketing Desk',
   'Source-led content, SEO briefs, and draft-first campaigns',
   'A Bureau-owned supervised marketing desk for SEO briefs, publish-ready content, repurposing plans, and channel preparation. Publishing and outbound messages remain approval-gated by default.',
   'Marketing', 'active', 'capability', 'supervised', 'fixed', 24000, 60, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'bureau-finance-ops-desk', 'Bureau Finance Ops Desk',
   'Invoice review, reconciliation, and exception evidence',
   'A Bureau-owned supervised finance-operations desk for invoice review, duplicate detection, reconciliation, and exception evidence. The desk never moves money or changes a ledger without explicit approval.',
   'Finance', 'active', 'capability', 'supervised', 'fixed', 32500, 60, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));

INSERT IGNORE INTO agent_capabilities (agent_id, capability) VALUES
  ('10000000-0000-4000-8000-000000000001', 'market research'),
  ('10000000-0000-4000-8000-000000000001', 'competitive intelligence'),
  ('10000000-0000-4000-8000-000000000001', 'cited briefs'),
  ('10000000-0000-4000-8000-000000000002', 'spreadsheet cleanup'),
  ('10000000-0000-4000-8000-000000000002', 'data enrichment'),
  ('10000000-0000-4000-8000-000000000002', 'data quality'),
  ('10000000-0000-4000-8000-000000000003', 'website fixes'),
  ('10000000-0000-4000-8000-000000000003', 'testing'),
  ('10000000-0000-4000-8000-000000000003', 'accessibility'),
  ('10000000-0000-4000-8000-000000000004', 'support triage'),
  ('10000000-0000-4000-8000-000000000004', 'knowledge bases'),
  ('10000000-0000-4000-8000-000000000004', 'escalation'),
  ('10000000-0000-4000-8000-000000000005', 'seo content'),
  ('10000000-0000-4000-8000-000000000005', 'content briefs'),
  ('10000000-0000-4000-8000-000000000005', 'draft campaigns'),
  ('10000000-0000-4000-8000-000000000006', 'invoice review'),
  ('10000000-0000-4000-8000-000000000006', 'reconciliation'),
  ('10000000-0000-4000-8000-000000000006', 'exception reporting');

INSERT IGNORE INTO agent_policies (agent_id, require_approval_for)
SELECT id, JSON_ARRAY('external_communication', 'production_deployment', 'payments', 'destructive_changes')
FROM agents WHERE operator_org_id = '00000000-0000-4000-8000-000000000001';
