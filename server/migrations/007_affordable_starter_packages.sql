UPDATE agents
SET base_price_cents = CASE slug
  WHEN 'bureau-research-desk' THEN 8900
  WHEN 'bureau-data-desk' THEN 4900
  WHEN 'bureau-engineering-desk' THEN 9900
  WHEN 'bureau-support-desk' THEN 7900
  WHEN 'bureau-marketing-desk' THEN 5900
  WHEN 'bureau-finance-ops-desk' THEN 6900
  ELSE base_price_cents
END,
updated_at = UTC_TIMESTAMP(3)
WHERE operator_org_id = '00000000-0000-4000-8000-000000000001'
  AND slug IN (
    'bureau-research-desk',
    'bureau-data-desk',
    'bureau-engineering-desk',
    'bureau-support-desk',
    'bureau-marketing-desk',
    'bureau-finance-ops-desk'
  );
