import type { FastifyReply, FastifyRequest } from 'fastify';

const DURATION_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity] as const;

type RequestMetricKey = `${string}\t${string}\t${string}`;
type WorkflowMetricKey = `${string}\t${string}\t${string}`;
type BillingWebhookMetricKey = `${string}\t${string}\t${string}`;

interface RequestMetric {
  method: string;
  route: string;
  statusClass: string;
  count: number;
  durationSecondsSum: number;
  buckets: number[];
}

const requestMetrics = new Map<RequestMetricKey, RequestMetric>();
const workflowMetrics = new Map<WorkflowMetricKey, {
  workflowType: string;
  outcome: string;
  statusClass: string;
  count: number;
  durationSecondsSum: number;
  buckets: number[];
}>();
const billingWebhookMetrics = new Map<BillingWebhookMetricKey, {
  provider: string;
  outcome: string;
  statusClass: string;
  count: number;
  durationSecondsSum: number;
  buckets: number[];
}>();

function statusClass(statusCode: number) {
  if (statusCode >= 100 && statusCode <= 599) {
    return `${Math.floor(statusCode / 100)}xx`;
  }
  return 'unknown';
}

function normaliseRoute(request: FastifyRequest) {
  const routePath = request.routeOptions.url;
  if (typeof routePath === 'string' && routePath) {
    return routePath;
  }
  return 'unmatched';
}

function metricKey(method: string, route: string, responseStatusClass: string): RequestMetricKey {
  return `${method}\t${route}\t${responseStatusClass}`;
}

function workflowMetricKey(workflowType: string, outcome: string, responseStatusClass: string): WorkflowMetricKey {
  return `${workflowType}\t${outcome}\t${responseStatusClass}`;
}

function billingWebhookMetricKey(provider: string, outcome: string, responseStatusClass: string): BillingWebhookMetricKey {
  return `${provider}\t${outcome}\t${responseStatusClass}`;
}

function labelValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(metric: RequestMetric) {
  return `method="${labelValue(metric.method)}",route="${labelValue(metric.route)}",status_class="${labelValue(metric.statusClass)}"`;
}

function workflowLabels(metric: { workflowType: string; outcome: string; statusClass: string }) {
  return `workflow_type="${labelValue(metric.workflowType)}",outcome="${labelValue(metric.outcome)}",status_class="${labelValue(metric.statusClass)}"`;
}

function billingWebhookLabels(metric: { provider: string; outcome: string; statusClass: string }) {
  return `provider="${labelValue(metric.provider)}",outcome="${labelValue(metric.outcome)}",status_class="${labelValue(metric.statusClass)}"`;
}

export function recordRequestMetrics(request: FastifyRequest, reply: FastifyReply) {
  if (request.routeOptions.url === '/metrics') {
    return;
  }

  const method = request.method;
  const route = normaliseRoute(request);
  const responseStatusClass = statusClass(reply.statusCode);
  const key = metricKey(method, route, responseStatusClass);
  let metric = requestMetrics.get(key);

  if (!metric) {
    metric = {
      method,
      route,
      statusClass: responseStatusClass,
      count: 0,
      durationSecondsSum: 0,
      buckets: DURATION_BUCKETS_SECONDS.map(() => 0),
    };
    requestMetrics.set(key, metric);
  }

  const durationSeconds = reply.elapsedTime / 1000;
  metric.count += 1;
  metric.durationSecondsSum += durationSeconds;

  for (const [index, bucket] of DURATION_BUCKETS_SECONDS.entries()) {
    if (durationSeconds <= bucket) {
      metric.buckets[index] += 1;
    }
  }
}

export function recordWorkflowMetrics(input: {
  workflowType: string;
  outcome: 'success' | 'http_error' | 'workflow_error' | 'exception';
  statusCode?: number;
  durationMs: number;
}) {
  const responseStatusClass = typeof input.statusCode === 'number' ? statusClass(input.statusCode) : 'none';
  const key = workflowMetricKey(input.workflowType, input.outcome, responseStatusClass);
  let metric = workflowMetrics.get(key);

  if (!metric) {
    metric = {
      workflowType: input.workflowType,
      outcome: input.outcome,
      statusClass: responseStatusClass,
      count: 0,
      durationSecondsSum: 0,
      buckets: DURATION_BUCKETS_SECONDS.map(() => 0),
    };
    workflowMetrics.set(key, metric);
  }

  const durationSeconds = Math.max(0, input.durationMs) / 1000;
  metric.count += 1;
  metric.durationSecondsSum += durationSeconds;

  for (const [index, bucket] of DURATION_BUCKETS_SECONDS.entries()) {
    if (durationSeconds <= bucket) {
      metric.buckets[index] += 1;
    }
  }
}

export function recordBillingWebhookMetrics(input: {
  provider: 'revenuecat' | 'stripe';
  outcome: 'received' | 'replayed' | 'ignored' | 'unauthorized' | 'invalid_payload' | 'configuration_error' | 'exception';
  statusCode?: number;
  durationMs: number;
}) {
  const responseStatusClass = typeof input.statusCode === 'number' ? statusClass(input.statusCode) : 'none';
  const key = billingWebhookMetricKey(input.provider, input.outcome, responseStatusClass);
  let metric = billingWebhookMetrics.get(key);

  if (!metric) {
    metric = {
      provider: input.provider,
      outcome: input.outcome,
      statusClass: responseStatusClass,
      count: 0,
      durationSecondsSum: 0,
      buckets: DURATION_BUCKETS_SECONDS.map(() => 0),
    };
    billingWebhookMetrics.set(key, metric);
  }

  const durationSeconds = Math.max(0, input.durationMs) / 1000;
  metric.count += 1;
  metric.durationSecondsSum += durationSeconds;

  for (const [index, bucket] of DURATION_BUCKETS_SECONDS.entries()) {
    if (durationSeconds <= bucket) {
      metric.buckets[index] += 1;
    }
  }
}

export function renderPrometheusMetrics() {
  const lines = [
    '# HELP stitchsense_api_requests_total Total StitchSense API responses by method, route, and status class.',
    '# TYPE stitchsense_api_requests_total counter',
  ];

  const metrics = [...requestMetrics.values()].sort((left, right) => {
    const leftKey = metricKey(left.method, left.route, left.statusClass);
    const rightKey = metricKey(right.method, right.route, right.statusClass);
    return leftKey.localeCompare(rightKey);
  });

  for (const metric of metrics) {
    lines.push(`stitchsense_api_requests_total{${labels(metric)}} ${metric.count}`);
  }

  lines.push(
    '# HELP stitchsense_api_request_duration_seconds StitchSense API response duration by method, route, and status class.',
    '# TYPE stitchsense_api_request_duration_seconds histogram',
  );

  for (const metric of metrics) {
    const baseLabels = labels(metric);
    for (const [index, bucket] of DURATION_BUCKETS_SECONDS.entries()) {
      const le = Number.isFinite(bucket) ? bucket.toString() : '+Inf';
      lines.push(`stitchsense_api_request_duration_seconds_bucket{${baseLabels},le="${le}"} ${metric.buckets[index]}`);
    }
    lines.push(`stitchsense_api_request_duration_seconds_sum{${baseLabels}} ${metric.durationSecondsSum.toFixed(6)}`);
    lines.push(`stitchsense_api_request_duration_seconds_count{${baseLabels}} ${metric.count}`);
  }

  lines.push(
    '# HELP stitchsense_workflow_requests_total Total external workflow attempts by workflow type, outcome, and status class.',
    '# TYPE stitchsense_workflow_requests_total counter',
  );

  const workflowMetricValues = [...workflowMetrics.values()].sort((left, right) => {
    const leftKey = workflowMetricKey(left.workflowType, left.outcome, left.statusClass);
    const rightKey = workflowMetricKey(right.workflowType, right.outcome, right.statusClass);
    return leftKey.localeCompare(rightKey);
  });

  for (const metric of workflowMetricValues) {
    lines.push(`stitchsense_workflow_requests_total{${workflowLabels(metric)}} ${metric.count}`);
  }

  lines.push(
    '# HELP stitchsense_workflow_request_duration_seconds External workflow attempt duration by workflow type, outcome, and status class.',
    '# TYPE stitchsense_workflow_request_duration_seconds histogram',
  );

  for (const metric of workflowMetricValues) {
    const baseLabels = workflowLabels(metric);
    for (const [index, bucket] of DURATION_BUCKETS_SECONDS.entries()) {
      const le = Number.isFinite(bucket) ? bucket.toString() : '+Inf';
      lines.push(`stitchsense_workflow_request_duration_seconds_bucket{${baseLabels},le="${le}"} ${metric.buckets[index]}`);
    }
    lines.push(`stitchsense_workflow_request_duration_seconds_sum{${baseLabels}} ${metric.durationSecondsSum.toFixed(6)}`);
    lines.push(`stitchsense_workflow_request_duration_seconds_count{${baseLabels}} ${metric.count}`);
  }

  lines.push(
    '# HELP stitchsense_billing_webhook_requests_total Total billing webhook attempts by provider, outcome, and status class.',
    '# TYPE stitchsense_billing_webhook_requests_total counter',
  );

  const billingWebhookMetricValues = [...billingWebhookMetrics.values()].sort((left, right) => {
    const leftKey = billingWebhookMetricKey(left.provider, left.outcome, left.statusClass);
    const rightKey = billingWebhookMetricKey(right.provider, right.outcome, right.statusClass);
    return leftKey.localeCompare(rightKey);
  });

  for (const metric of billingWebhookMetricValues) {
    lines.push(`stitchsense_billing_webhook_requests_total{${billingWebhookLabels(metric)}} ${metric.count}`);
  }

  lines.push(
    '# HELP stitchsense_billing_webhook_request_duration_seconds Billing webhook attempt duration by provider, outcome, and status class.',
    '# TYPE stitchsense_billing_webhook_request_duration_seconds histogram',
  );

  for (const metric of billingWebhookMetricValues) {
    const baseLabels = billingWebhookLabels(metric);
    for (const [index, bucket] of DURATION_BUCKETS_SECONDS.entries()) {
      const le = Number.isFinite(bucket) ? bucket.toString() : '+Inf';
      lines.push(`stitchsense_billing_webhook_request_duration_seconds_bucket{${baseLabels},le="${le}"} ${metric.buckets[index]}`);
    }
    lines.push(`stitchsense_billing_webhook_request_duration_seconds_sum{${baseLabels}} ${metric.durationSecondsSum.toFixed(6)}`);
    lines.push(`stitchsense_billing_webhook_request_duration_seconds_count{${baseLabels}} ${metric.count}`);
  }

  return `${lines.join('\n')}\n`;
}
