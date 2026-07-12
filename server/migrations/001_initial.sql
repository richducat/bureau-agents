SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  status ENUM('pending','active','suspended','deleted') NOT NULL DEFAULT 'pending',
  platform_role ENUM('user','support','admin') NOT NULL DEFAULT 'user',
  email_verified_at TIMESTAMP(3) NULL,
  last_login_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organizations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  kind ENUM('client','operator','platform') NOT NULL,
  plan ENUM('client_starter','client_scale','operator_starter','operator_pro','platform') NOT NULL,
  status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  website_url VARCHAR(2048) NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_account_id VARCHAR(255) NULL,
  stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY organizations_slug_unique (slug),
  UNIQUE KEY organizations_stripe_customer_unique (stripe_customer_id),
  UNIQUE KEY organizations_stripe_account_unique (stripe_account_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  member_role ENUM('owner','admin','member','billing') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT org_members_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY sessions_user_idx (user_id),
  KEY sessions_expiry_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS identity_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  purpose ENUM('verify_email','reset_password') NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  used_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY identity_tokens_user_idx (user_id),
  CONSTRAINT identity_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agents (
  id CHAR(36) PRIMARY KEY,
  operator_org_id CHAR(36) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  name VARCHAR(120) NOT NULL,
  tagline VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  avatar_url VARCHAR(2048) NULL,
  status ENUM('draft','review','active','paused','rejected') NOT NULL DEFAULT 'draft',
  verification_level ENUM('unverified','identity','capability','production') NOT NULL DEFAULT 'unverified',
  autonomy_level ENUM('assistive','supervised','autonomous') NOT NULL DEFAULT 'supervised',
  pricing_model ENUM('fixed','hourly','usage','quote') NOT NULL DEFAULT 'fixed',
  base_price_cents INT UNSIGNED NULL,
  hourly_rate_cents INT UNSIGNED NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  response_time_minutes INT UNSIGNED NULL,
  success_rate_basis_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  completed_contracts INT UNSIGNED NOT NULL DEFAULT 0,
  average_rating DECIMAL(3,2) NOT NULL DEFAULT 0,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  endpoint_url VARCHAR(2048) NULL,
  webhook_url VARCHAR(2048) NULL,
  webhook_secret_ciphertext TEXT NULL,
  terms_accepted_at TIMESTAMP(3) NULL,
  published_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY agents_slug_unique (slug),
  KEY agents_category_status_idx (category, status),
  CONSTRAINT agents_operator_fk FOREIGN KEY (operator_org_id) REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_capabilities (
  agent_id CHAR(36) NOT NULL,
  capability VARCHAR(100) NOT NULL,
  evidence_url VARCHAR(2048) NULL,
  verified_at TIMESTAMP(3) NULL,
  PRIMARY KEY (agent_id, capability),
  CONSTRAINT agent_capabilities_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id CHAR(36) PRIMARY KEY,
  agent_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes JSON NOT NULL,
  last_used_at TIMESTAMP(3) NULL,
  expires_at TIMESTAMP(3) NULL,
  revoked_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY agent_api_keys_hash_unique (key_hash),
  KEY agent_api_keys_agent_idx (agent_id),
  CONSTRAINT agent_api_keys_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agent_id CHAR(36) NOT NULL,
  status ENUM('online','busy','degraded','offline') NOT NULL,
  active_runs INT UNSIGNED NOT NULL DEFAULT 0,
  capacity INT UNSIGNED NOT NULL DEFAULT 1,
  metadata JSON NULL,
  recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY agent_heartbeats_agent_time_idx (agent_id, recorded_at),
  CONSTRAINT agent_heartbeats_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  client_org_id CHAR(36) NOT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(180) NOT NULL,
  summary VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  deliverables JSON NOT NULL,
  required_capabilities JSON NOT NULL,
  autonomy_level ENUM('assistive','supervised','autonomous') NOT NULL DEFAULT 'supervised',
  budget_min_cents INT UNSIGNED NOT NULL,
  budget_max_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  deadline_at TIMESTAMP(3) NULL,
  status ENUM('draft','open','shortlisted','awarded','closed','cancelled') NOT NULL DEFAULT 'draft',
  visibility ENUM('public','invite_only','private') NOT NULL DEFAULT 'public',
  published_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY jobs_slug_unique (slug),
  KEY jobs_status_category_idx (status, category),
  KEY jobs_client_idx (client_org_id),
  CONSTRAINT jobs_client_fk FOREIGN KEY (client_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT jobs_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (budget_max_cents >= budget_min_cents)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proposals (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  agent_id CHAR(36) NOT NULL,
  submitted_by_user_id CHAR(36) NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  duration_days INT UNSIGNED NOT NULL,
  approach TEXT NOT NULL,
  milestones JSON NOT NULL,
  status ENUM('submitted','shortlisted','accepted','declined','withdrawn') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY proposals_job_agent_unique (job_id, agent_id),
  KEY proposals_agent_idx (agent_id),
  CONSTRAINT proposals_job_fk FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT proposals_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT proposals_submitter_fk FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contracts (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NULL,
  proposal_id CHAR(36) NULL,
  client_org_id CHAR(36) NOT NULL,
  operator_org_id CHAR(36) NOT NULL,
  agent_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  scope TEXT NOT NULL,
  total_work_value_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  client_fee_basis_points SMALLINT UNSIGNED NOT NULL,
  operator_fee_basis_points SMALLINT UNSIGNED NOT NULL,
  status ENUM('pending_funding','active','submitted','completed','cancelled','disputed') NOT NULL DEFAULT 'pending_funding',
  started_at TIMESTAMP(3) NULL,
  completed_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY contracts_client_status_idx (client_org_id, status),
  KEY contracts_operator_status_idx (operator_org_id, status),
  CONSTRAINT contracts_job_fk FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
  CONSTRAINT contracts_proposal_fk FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL,
  CONSTRAINT contracts_client_fk FOREIGN KEY (client_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT contracts_operator_fk FOREIGN KEY (operator_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT contracts_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS milestones (
  id CHAR(36) PRIMARY KEY,
  contract_id CHAR(36) NOT NULL,
  sequence_number SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  work_value_cents INT UNSIGNED NOT NULL,
  due_at TIMESTAMP(3) NULL,
  status ENUM('unfunded','funding','funded','in_progress','submitted','approved','released','refunded','disputed') NOT NULL DEFAULT 'unfunded',
  funded_at TIMESTAMP(3) NULL,
  submitted_at TIMESTAMP(3) NULL,
  approved_at TIMESTAMP(3) NULL,
  released_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY milestones_contract_sequence_unique (contract_id, sequence_number),
  CONSTRAINT milestones_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  milestone_id CHAR(36) NOT NULL,
  client_org_id CHAR(36) NOT NULL,
  operator_org_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_charge_id VARCHAR(255) NULL,
  stripe_transfer_id VARCHAR(255) NULL,
  work_value_cents INT UNSIGNED NOT NULL,
  client_fee_cents INT UNSIGNED NOT NULL,
  operator_fee_cents INT UNSIGNED NOT NULL,
  client_total_cents INT UNSIGNED NOT NULL,
  operator_net_cents INT UNSIGNED NOT NULL,
  bureau_gross_cents INT UNSIGNED NOT NULL,
  processor_fee_cents INT UNSIGNED NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status ENUM('created','checkout_open','paid','release_pending','released','refund_pending','refunded','failed','disputed') NOT NULL DEFAULT 'created',
  open_milestone_id CHAR(36) NULL,
  paid_at TIMESTAMP(3) NULL,
  released_at TIMESTAMP(3) NULL,
  refunded_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY payments_idempotency_unique (idempotency_key),
  UNIQUE KEY payments_checkout_unique (stripe_checkout_session_id),
  UNIQUE KEY payments_intent_unique (stripe_payment_intent_id),
  UNIQUE KEY payments_one_open_per_milestone_unique (open_milestone_id),
  CONSTRAINT payments_milestone_fk FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE RESTRICT,
  CONSTRAINT payments_client_fk FOREIGN KEY (client_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT payments_operator_fk FOREIGN KEY (operator_org_id) REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS payments_set_open_milestone_before_insert;
CREATE TRIGGER payments_set_open_milestone_before_insert
BEFORE INSERT ON payments FOR EACH ROW
SET NEW.open_milestone_id = CASE
  WHEN NEW.status IN ('created','checkout_open','paid','release_pending') THEN NEW.milestone_id
  ELSE NULL
END;

DROP TRIGGER IF EXISTS payments_set_open_milestone_before_update;
CREATE TRIGGER payments_set_open_milestone_before_update
BEFORE UPDATE ON payments FOR EACH ROW
SET NEW.open_milestone_id = CASE
  WHEN NEW.status IN ('created','checkout_open','paid','release_pending') THEN NEW.milestone_id
  ELSE NULL
END;

CREATE TABLE IF NOT EXISTS deliverables (
  id CHAR(36) PRIMARY KEY,
  milestone_id CHAR(36) NOT NULL,
  submitted_by_agent_id CHAR(36) NULL,
  submitted_by_user_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  artifact_url VARCHAR(2048) NULL,
  artifact_sha256 CHAR(64) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT deliverables_milestone_fk FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
  CONSTRAINT deliverables_agent_fk FOREIGN KEY (submitted_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  CONSTRAINT deliverables_user_fk FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  contract_id CHAR(36) NOT NULL,
  sender_user_id CHAR(36) NULL,
  sender_agent_id CHAR(36) NULL,
  body TEXT NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY messages_contract_time_idx (contract_id, created_at),
  CONSTRAINT messages_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  CONSTRAINT messages_user_fk FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT messages_agent_fk FOREIGN KEY (sender_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  CHECK ((sender_user_id IS NOT NULL) <> (sender_agent_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
  id CHAR(36) PRIMARY KEY,
  contract_id CHAR(36) NOT NULL,
  reviewer_user_id CHAR(36) NOT NULL,
  agent_id CHAR(36) NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('published','hidden','flagged') NOT NULL DEFAULT 'published',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY reviews_contract_unique (contract_id),
  CONSTRAINT reviews_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
  CONSTRAINT reviews_reviewer_fk FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT reviews_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_agents (
  user_id CHAR(36) NOT NULL,
  agent_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, agent_id),
  CONSTRAINT saved_agents_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT saved_agents_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  plan ENUM('client_scale','operator_pro') NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  status ENUM('trialing','active','past_due','paused','cancelled','unpaid') NOT NULL,
  current_period_end TIMESTAMP(3) NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY subscriptions_stripe_unique (stripe_subscription_id),
  KEY subscriptions_org_status_idx (organization_id, status),
  CONSTRAINT subscriptions_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS disputes (
  id CHAR(36) PRIMARY KEY,
  contract_id CHAR(36) NOT NULL,
  milestone_id CHAR(36) NOT NULL,
  opened_by_user_id CHAR(36) NOT NULL,
  reason ENUM('scope','quality','deadline','unauthorized','other') NOT NULL,
  statement TEXT NOT NULL,
  status ENUM('open','evidence','resolved_client','resolved_operator','split','closed') NOT NULL DEFAULT 'open',
  resolution_note TEXT NULL,
  resolved_by_user_id CHAR(36) NULL,
  resolved_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY disputes_status_idx (status, created_at),
  CONSTRAINT disputes_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
  CONSTRAINT disputes_milestone_fk FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE RESTRICT,
  CONSTRAINT disputes_opener_fk FOREIGN KEY (opened_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT disputes_resolver_fk FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webhook_events (
  provider VARCHAR(40) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(160) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  status ENUM('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
  error_message VARCHAR(500) NULL,
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at TIMESTAMP(3) NULL,
  PRIMARY KEY (provider, external_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  anonymous_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  organization_id CHAR(36) NULL,
  session_id VARCHAR(100) NULL,
  path VARCHAR(500) NULL,
  referrer_origin VARCHAR(255) NULL,
  utm_source VARCHAR(120) NULL,
  utm_medium VARCHAR(120) NULL,
  utm_campaign VARCHAR(160) NULL,
  properties JSON NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY analytics_event_id_unique (event_id),
  KEY analytics_name_time_idx (event_name, occurred_at),
  CONSTRAINT analytics_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT analytics_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS waitlist_leads (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  audience ENUM('client','operator','partner','press') NOT NULL,
  source VARCHAR(120) NULL,
  consent_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY waitlist_email_audience_unique (email, audience)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  actor_agent_id CHAR(36) NULL,
  organization_id CHAR(36) NULL,
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(80) NOT NULL,
  target_id VARCHAR(100) NULL,
  ip_hash CHAR(64) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_target_idx (target_type, target_id),
  KEY audit_actor_time_idx (actor_user_id, created_at),
  CONSTRAINT audit_user_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT audit_agent_fk FOREIGN KEY (actor_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  CONSTRAINT audit_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB;
