#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <new-version> [release-note]"
  exit 1
fi

VERSION="$1"
NOTE="${2:-Packaged release ${VERSION}}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_MAIN="${ROOT_DIR}/stitchsense-assistant-hub-pro.php"
PLUGIN_JS="${ROOT_DIR}/assets/stitchsense-hub-pro.js"
ZIP_LATEST="${ROOT_DIR}/stitchsense-assistant-hub-pro.zip"
ZIP_VERSIONED="${ROOT_DIR}/stitchsense-assistant-hub-pro-v${VERSION}.zip"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ ! -f "${PLUGIN_MAIN}" ]]; then
  echo "Could not find plugin main file at ${PLUGIN_MAIN}"
  exit 1
fi

perl -0pi -e "s/(\\* Version:\\s*)[0-9]+(?:\\.[0-9]+)*/\${1}${VERSION}/" "${PLUGIN_MAIN}"
perl -0pi -e "s#(// v)[0-9]+(?:\\.[0-9]+)*\\s*-.*#\${1}${VERSION} - ${NOTE}#" "${PLUGIN_MAIN}"
perl -0pi -e "s/(const VERSION = ')[0-9]+(?:\\.[0-9]+)*(';)/\${1}${VERSION}\${2}/" "${PLUGIN_MAIN}"

if [[ -f "${PLUGIN_JS}" ]]; then
  perl -0pi -e "s/(Active plugin build expected:\\s*)[0-9]+(?:\\.[0-9]+)*/\${1}${VERSION}/g" "${PLUGIN_JS}"
fi

cd "${ROOT_DIR}"
zip -r "${ZIP_LATEST}" \
  stitchsense-assistant-hub-pro.php \
  class-stitchsense-library.php \
  class-stitchsense-platform-client.php \
  class-stitchsense-ravelry.php \
  class-stitchsense-workflow-client.php \
  stitchsense-chat-proxy.php \
  stitchsense-image-proxy.php \
  stitchsense-upload-proxy.php \
  assets \
  migrations >/dev/null

cp "${ZIP_LATEST}" "${ZIP_VERSIONED}"

echo "Built:"
echo "  ${ZIP_LATEST}"
echo "  ${ZIP_VERSIONED}"
echo "Version set to ${VERSION}"
