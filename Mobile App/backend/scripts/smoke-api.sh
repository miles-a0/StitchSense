#!/usr/bin/env bash
set -euo pipefail

api_base_url="${STITCHSENSE_API_BASE_URL:-${1:-http://127.0.0.1:4447}}"
metrics_shared_secret="${STITCHSENSE_METRICS_SHARED_SECRET:-}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

request_json() {
  local path="$1"
  local output_file="$2"
  local status

  status="$(
    curl --silent --show-error --location \
      --max-time 15 \
      --retry 2 \
      --retry-delay 2 \
      --output "$output_file" \
      --write-out "%{http_code}" \
      "${api_base_url}${path}"
  )"

  if [[ "$status" != "200" ]]; then
    echo "Expected ${path} HTTP 200, got ${status}" >&2
    sed -n '1,80p' "$output_file" >&2
    exit 1
  fi
}

health_json="$tmp_dir/health.json"
ready_json="$tmp_dir/ready.json"

request_json "/health" "$health_json"
request_json "/ready" "$ready_json"

python3 - "$health_json" "$ready_json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    health = json.load(handle)

with open(sys.argv[2], encoding="utf-8") as handle:
    ready = json.load(handle)

assert health.get("ok") is True, health
assert health.get("service") == "stitchsense-api", health

assert ready.get("ok") is True, ready
assert ready.get("service") == "stitchsense-api", ready
checks = ready.get("checks") or {}
assert checks.get("database") is True, ready
assert checks.get("storage") is True, ready
PY

if [[ -n "$metrics_shared_secret" ]]; then
  metrics_unauthorized="$tmp_dir/metrics-unauthorized.json"
  metrics_status="$(
    curl --silent --show-error --location \
      --max-time 10 \
      --retry 2 \
      --retry-delay 2 \
      --output "$metrics_unauthorized" \
      --write-out "%{http_code}" \
      "${api_base_url}/metrics"
  )"

  if [[ "$metrics_status" != "401" ]]; then
    echo "Expected /metrics without credentials to return HTTP 401, got ${metrics_status}" >&2
    sed -n '1,80p' "$metrics_unauthorized" >&2
    exit 1
  fi

  metrics_output="$tmp_dir/metrics.txt"
  metrics_status="$(
    curl --silent --show-error --location \
      --max-time 10 \
      --retry 2 \
      --retry-delay 2 \
      --header "Authorization: Bearer ${metrics_shared_secret}" \
      --output "$metrics_output" \
      --write-out "%{http_code}" \
      "${api_base_url}/metrics"
  )"

  if [[ "$metrics_status" != "200" ]]; then
    echo "Expected /metrics with credentials to return HTTP 200, got ${metrics_status}" >&2
    sed -n '1,80p' "$metrics_output" >&2
    exit 1
  fi

  grep -q '^# HELP stitchsense_api_requests_total ' "$metrics_output"
  grep -q '^# TYPE stitchsense_api_request_duration_seconds histogram' "$metrics_output"
fi

echo "StitchSense API smoke check passed for ${api_base_url}"
