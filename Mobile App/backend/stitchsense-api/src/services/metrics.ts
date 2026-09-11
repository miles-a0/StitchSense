import type { FastifyReply, FastifyRequest } from 'fastify';

const DURATION_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity] as const;

type RequestMetricKey = `${string}\t${string}\t${string}`;

interface RequestMetric {
  method: string;
  route: string;
  statusClass: string;
  count: number;
  durationSecondsSum: number;
  buckets: number[];
}

const requestMetrics = new Map<RequestMetricKey, RequestMetric>();

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

function labelValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(metric: RequestMetric) {
  return `method="${labelValue(metric.method)}",route="${labelValue(metric.route)}",status_class="${labelValue(metric.statusClass)}"`;
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

  return `${lines.join('\n')}\n`;
}
