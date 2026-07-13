ALTER TABLE task_requests
  ADD COLUMN source_platform ENUM('direct','upwork') NOT NULL DEFAULT 'direct' AFTER source,
  ADD COLUMN source_job_url VARCHAR(2048) NULL AFTER source_platform,
  ADD COLUMN source_reference_type ENUM('posted_budget','proposal_total') NULL AFTER source_job_url,
  ADD COLUMN source_reference_cents INT UNSIGNED NULL AFTER source_reference_type,
  ADD COLUMN guarantee_status ENUM('not_requested','eligible','manual_review','expired') NOT NULL DEFAULT 'not_requested' AFTER source_reference_cents,
  ADD COLUMN guarantee_discount_basis_points SMALLINT UNSIGNED NULL AFTER guarantee_status,
  ADD COLUMN guarantee_savings_cents INT UNSIGNED NULL AFTER guarantee_discount_basis_points,
  ADD COLUMN guarantee_terms_version VARCHAR(32) NULL AFTER guarantee_savings_cents,
  ADD COLUMN guarantee_attested_at TIMESTAMP(3) NULL AFTER guarantee_terms_version,
  ADD COLUMN guarantee_expires_at TIMESTAMP(3) NULL AFTER guarantee_attested_at,
  ADD KEY task_requests_source_platform_idx (source_platform, guarantee_status, created_at),
  ADD KEY task_requests_source_job_idx (source_platform, source_job_url(191));
