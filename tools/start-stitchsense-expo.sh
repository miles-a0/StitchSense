#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-lan}"
ROOT="/Users/andrewmagill/DEV/StitchSense"
APP_DIR="$ROOT/Mobile App/stitchsense-expo"

is_usable_ipv4() {
  local ip="${1:-}"
  [[ -n "$ip" ]] || return 1
  [[ "$ip" != 127.* ]] || return 1
  [[ "$ip" != 169.254.* ]] || return 1
  return 0
}

ipv4_for_interface() {
  local iface="${1:-}"
  [[ -n "$iface" ]] || return 1

  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig "$iface" 2>/dev/null | awk '/inet / { print $2; exit }'
    return 0
  fi

  return 1
}

detect_lan_ip() {
  local ip=""
  local default_iface=""

  if [[ -n "${STITCHSENSE_LAN_IP:-}" ]]; then
    if is_usable_ipv4 "$STITCHSENSE_LAN_IP"; then
      printf '%s' "$STITCHSENSE_LAN_IP"
      return 0
    fi
  fi

  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if ! is_usable_ipv4 "$ip"; then
    ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  if ! is_usable_ipv4 "$ip"; then
    ip="$(ipv4_for_interface en0 || true)"
  fi
  if ! is_usable_ipv4 "$ip"; then
    ip="$(ipv4_for_interface en1 || true)"
  fi
  if ! is_usable_ipv4 "$ip"; then
    default_iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' | head -n 1)"
    if [[ -n "$default_iface" ]]; then
      ip="$(ipconfig getifaddr "$default_iface" 2>/dev/null || true)"
      if ! is_usable_ipv4 "$ip"; then
        ip="$(ipv4_for_interface "$default_iface" || true)"
      fi
    fi
  fi
  if ! is_usable_ipv4 "$ip"; then
    ip="$(
      ifconfig 2>/dev/null \
        | awk '
            /^[a-z0-9]+:/ { iface=$1; sub(":", "", iface) }
            /status: active/ { active[iface]=1 }
            /inet / && active[iface] && $2 !~ /^127\./ && $2 !~ /^169\.254\./ { print $2; exit }
          ' || true
    )"
  fi

  if is_usable_ipv4 "$ip"; then
    printf '%s' "$ip"
  fi
}

if [[ ! -d "$APP_DIR" ]]; then
  echo "Could not find Expo app directory: $APP_DIR" >&2
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm was not found at $NVM_DIR" >&2
  exit 1
fi

nvm use 20 >/dev/null

pkill -f "expo start" 2>/dev/null || true
pkill -f "node .*expo" 2>/dev/null || true

for port in 8081 8082 8084 19000 19001 19002 19006; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  fi
done

rm -rf "$APP_DIR/.expo"

cd "$APP_DIR"

LAN_IP="$(detect_lan_ip)"
if [[ -n "$LAN_IP" ]]; then
  export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"
fi
export STITCHSENSE_EXPO_NAME="StitchSense Preview"
export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-https://stitchsense.zu-auto.co.uk}"

if [[ "$MODE" == "doctor" ]]; then
  echo "StitchSense Expo doctor"
  echo "App directory: $APP_DIR"
  echo "Node: $(node -v)"
  echo "API base: ${EXPO_PUBLIC_API_BASE_URL}"
  if command -v curl >/dev/null 2>&1; then
    echo "API health:"
    curl -fsS --max-time 12 "${EXPO_PUBLIC_API_BASE_URL%/}/health" || true
    echo
  fi
  if [[ -n "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]]; then
    echo "Detected LAN host: ${REACT_NATIVE_PACKAGER_HOSTNAME}"
    echo "Expected Expo URL: exp://${REACT_NATIVE_PACKAGER_HOSTNAME}:8081"
  else
    echo "Detected LAN host: none"
    echo "Advice: use tunnel mode or set STITCHSENSE_LAN_IP manually."
  fi
  echo "Start modes:"
  echo "  ./tools/start-stitchsense-expo.sh"
  echo "  ./tools/start-stitchsense-expo.sh tunnel"
  exit 0
fi

echo "Starting StitchSense Expo with Node $(node -v) in $MODE mode..."
echo "Using API base ${EXPO_PUBLIC_API_BASE_URL}"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 12 "${EXPO_PUBLIC_API_BASE_URL%/}/health" >/dev/null; then
    echo "API health OK."
  else
    echo "WARNING: API health check failed for ${EXPO_PUBLIC_API_BASE_URL%/}/health" >&2
    echo "Expo will still start, but the app may show API errors until the server is healthy." >&2
  fi
fi
if [[ -n "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]]; then
  echo "Using LAN host ${REACT_NATIVE_PACKAGER_HOSTNAME}"
fi
echo "Open this with Expo Go on your iPhone after scanning the fresh QR code."
echo "If you have an older custom dev build installed, do not open that for this session."

if [[ "$MODE" == "tunnel" ]]; then
  exec npx expo start --clear --tunnel --go
else
  if [[ -z "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]]; then
    echo "Could not determine a usable LAN IP automatically." >&2
    echo "Falling back to tunnel mode so Expo does not guess a stale address." >&2
    exec npx expo start --clear --tunnel --go
  fi
  exec npx expo start --clear --lan --port 8081 --go
fi
