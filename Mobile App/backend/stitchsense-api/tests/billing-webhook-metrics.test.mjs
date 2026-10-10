import assert from 'node:assert/strict';
import test from 'node:test';

test('billing webhook metrics record provider outcomes without secret or event identifiers', async () => {
  const { recordBillingWebhookMetrics, renderPrometheusMetrics } = await import('../dist/services/metrics.js');

  recordBillingWebhookMetrics({
    provider: 'revenuecat',
    outcome: 'received',
    statusCode: 200,
    durationMs: 12,
  });
  recordBillingWebhookMetrics({
    provider: 'revenuecat',
    outcome: 'replayed',
    statusCode: 200,
    durationMs: 3,
  });
  recordBillingWebhookMetrics({
    provider: 'revenuecat',
    outcome: 'ignored',
    statusCode: 200,
    durationMs: 4,
  });
  recordBillingWebhookMetrics({
    provider: 'revenuecat',
    outcome: 'unauthorized',
    statusCode: 401,
    durationMs: 2,
  });
  recordBillingWebhookMetrics({
    provider: 'stripe',
    outcome: 'invalid_payload',
    statusCode: 400,
    durationMs: 2,
  });
  recordBillingWebhookMetrics({
    provider: 'stripe',
    outcome: 'exception',
    statusCode: 500,
    durationMs: 18,
  });

  const metrics = renderPrometheusMetrics();
  assert.match(metrics, /stitchsense_billing_webhook_requests_total\{provider="revenuecat",outcome="received",status_class="2xx"\} 1/);
  assert.match(metrics, /stitchsense_billing_webhook_requests_total\{provider="revenuecat",outcome="replayed",status_class="2xx"\} 1/);
  assert.match(metrics, /stitchsense_billing_webhook_requests_total\{provider="revenuecat",outcome="ignored",status_class="2xx"\} 1/);
  assert.match(metrics, /stitchsense_billing_webhook_requests_total\{provider="revenuecat",outcome="unauthorized",status_class="4xx"\} 1/);
  assert.match(metrics, /stitchsense_billing_webhook_requests_total\{provider="stripe",outcome="invalid_payload",status_class="4xx"\} 1/);
  assert.match(metrics, /stitchsense_billing_webhook_requests_total\{provider="stripe",outcome="exception",status_class="5xx"\} 1/);
  assert.match(metrics, /stitchsense_billing_webhook_request_duration_seconds_bucket\{provider="revenuecat",outcome="received",status_class="2xx",le="\+Inf"\} 1/);
  assert.doesNotMatch(metrics, /Bearer/);
  assert.doesNotMatch(metrics, /evt_/);
  assert.doesNotMatch(metrics, /transaction/);
});
