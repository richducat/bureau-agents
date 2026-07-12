CREATE TABLE IF NOT EXISTS agent_policies (
  agent_id CHAR(36) PRIMARY KEY,
  max_contract_value_cents INT UNSIGNED NOT NULL DEFAULT 250000,
  max_concurrent_contracts SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  require_approval_for JSON NOT NULL,
  auto_propose_min_match_basis_points SMALLINT UNSIGNED NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT agent_policies_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id CHAR(36) PRIMARY KEY,
  agent_id CHAR(36) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_id CHAR(36) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending','delivering','delivered','failed','dead') NOT NULL DEFAULT 'pending',
  attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_status_code SMALLINT UNSIGNED NULL,
  last_error VARCHAR(500) NULL,
  delivered_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY webhook_deliveries_agent_event_unique (agent_id, event_id),
  KEY webhook_deliveries_queue_idx (status, next_attempt_at),
  CONSTRAINT webhook_deliveries_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_requests (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  email VARCHAR(320) NOT NULL,
  category ENUM('account','payment','safety','privacy','legal','other') NOT NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open','in_progress','waiting','resolved','closed') NOT NULL DEFAULT 'open',
  assigned_to_user_id CHAR(36) NULL,
  consent_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY support_status_time_idx (status, created_at),
  CONSTRAINT support_request_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT support_assignee_fk FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
