CREATE TABLE IF NOT EXISTS legal_acceptances (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  document ENUM('terms','privacy','acceptable_use') NOT NULL,
  version VARCHAR(64) NOT NULL,
  document_path VARCHAR(255) NOT NULL,
  acceptance_surface ENUM('signup_clickwrap') NOT NULL DEFAULT 'signup_clickwrap',
  ip_hash CHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  accepted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY legal_acceptances_user_document_version_unique (user_id, organization_id, document, version),
  KEY legal_acceptances_user_time_idx (user_id, accepted_at),
  CONSTRAINT legal_acceptances_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT legal_acceptances_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME = 'terms_version') = 0,
  'ALTER TABLE agents ADD COLUMN terms_version VARCHAR(64) NULL AFTER terms_accepted_at',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;
