SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'quote_basis') = 0,
  'ALTER TABLE task_requests ADD COLUMN quote_basis ENUM(''catalog'',''verified_external_reference'') NULL AFTER quote_summary',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'quote_policy_version') = 0,
  'ALTER TABLE task_requests ADD COLUMN quote_policy_version VARCHAR(32) NULL AFTER quote_basis',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'quote_policy_attested_at') = 0,
  'ALTER TABLE task_requests ADD COLUMN quote_policy_attested_at TIMESTAMP(3) NULL AFTER quote_policy_version',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'catalog_scope_units') = 0,
  'ALTER TABLE task_requests ADD COLUMN catalog_scope_units INT UNSIGNED NULL AFTER quote_policy_attested_at',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'catalog_package_count') = 0,
  'ALTER TABLE task_requests ADD COLUMN catalog_package_count INT UNSIGNED NULL AFTER catalog_scope_units',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'source_verification_status') = 0,
  'ALTER TABLE task_requests ADD COLUMN source_verification_status ENUM(''not_applicable'',''url_validated'',''legacy_unverified'',''verified'') NOT NULL DEFAULT ''not_applicable'' AFTER source_reference_cents',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'source_verification_method') = 0,
  'ALTER TABLE task_requests ADD COLUMN source_verification_method ENUM(''url_format'',''upwork_api'') NULL AFTER source_verification_status',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'source_validated_at') = 0,
  'ALTER TABLE task_requests ADD COLUMN source_validated_at TIMESTAMP(3) NULL AFTER source_verification_method',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND COLUMN_NAME = 'source_verification_note') = 0,
  'ALTER TABLE task_requests ADD COLUMN source_verification_note VARCHAR(500) NULL AFTER source_validated_at',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

SET @bureau_schema_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_requests' AND INDEX_NAME = 'task_requests_source_verification_idx') = 0,
  'ALTER TABLE task_requests ADD KEY task_requests_source_verification_idx (source_platform, source_verification_status, created_at)',
  'SELECT 1'
);
PREPARE bureau_schema_stmt FROM @bureau_schema_sql;
EXECUTE bureau_schema_stmt;
DEALLOCATE PREPARE bureau_schema_stmt;

UPDATE task_requests
SET source_verification_status = 'legacy_unverified',
    source_verification_note = 'Legacy client-attested amount; not accepted as verified comparison evidence.'
WHERE source_platform = 'upwork' AND source_verification_status = 'not_applicable';

UPDATE contracts c
JOIN task_requests tr ON tr.contract_id = c.id
SET c.status = 'cancelled'
WHERE tr.source_platform = 'upwork'
  AND tr.source_verification_status = 'legacy_unverified'
  AND c.status = 'pending_funding'
  AND NOT EXISTS (
    SELECT 1 FROM milestones m
    WHERE m.contract_id = c.id AND m.status IN ('funded','in_progress','submitted','approved','released','disputed')
  )
  AND NOT EXISTS (
    SELECT 1 FROM milestones m JOIN payments p ON p.milestone_id = m.id
    WHERE m.contract_id = c.id AND p.status IN ('paid','release_pending','released','refund_pending','disputed')
  );

UPDATE task_requests tr
SET tr.status = 'reviewing',
    tr.quote_work_value_cents = NULL,
    tr.quote_summary = 'Legacy self-attested comparison invalidated. Submit the job reference again to receive a bounded Bureau catalog quote.',
    tr.quote_basis = NULL,
    tr.quote_policy_version = NULL,
    tr.quote_policy_attested_at = NULL,
    tr.catalog_scope_units = NULL,
    tr.catalog_package_count = NULL,
    tr.source_reference_type = NULL,
    tr.source_reference_cents = NULL,
    tr.guarantee_status = 'manual_review',
    tr.guarantee_discount_basis_points = NULL,
    tr.guarantee_savings_cents = NULL,
    tr.guarantee_terms_version = NULL,
    tr.guarantee_attested_at = NULL,
    tr.guarantee_expires_at = NULL,
    tr.quoted_at = NULL
WHERE tr.source_platform = 'upwork'
  AND tr.source_verification_status = 'legacy_unverified'
  AND (
    tr.contract_id IS NULL
    OR EXISTS (SELECT 1 FROM contracts c WHERE c.id = tr.contract_id AND c.status = 'cancelled')
  );

UPDATE task_requests
SET quote_basis = 'catalog'
WHERE source_platform = 'direct' AND quote_work_value_cents IS NOT NULL AND quote_basis IS NULL;
