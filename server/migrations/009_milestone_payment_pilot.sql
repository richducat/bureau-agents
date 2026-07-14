CREATE TABLE IF NOT EXISTS payment_pilot_control (
  id TINYINT UNSIGNED PRIMARY KEY,
  scope VARCHAR(80) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO payment_pilot_control (id, scope) VALUES (1, 'bureau_milestone_payment_pilot');

CREATE TABLE IF NOT EXISTS payment_stripe_exposure_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  stripe_object_id VARCHAR(255) NOT NULL,
  event_kind ENUM('refund_principal','dispute_principal','additional_fee') NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  first_observed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY payment_exposure_object_kind_unique (payment_id, stripe_object_id, event_kind),
  KEY payment_exposure_kind_idx (event_kind, first_observed_at),
  CONSTRAINT payment_exposure_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
