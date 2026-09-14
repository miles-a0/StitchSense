CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_unique_revenuecat_webhook_event
    ON audit_events ((metadata->>'revenueCatEventId'))
    WHERE event_type = 'billing.revenuecat.webhook.received'
      AND metadata ? 'revenueCatEventId';
