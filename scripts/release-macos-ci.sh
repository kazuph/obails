#!/bin/bash
set -euo pipefail

: "${RUNNER_TEMP:?This script runs on GitHub Actions}"
: "${OBAILS_SIGNING_CERTIFICATE_BASE64:?Missing signing certificate}"
: "${OBAILS_SIGNING_CERTIFICATE_PASSWORD:?Missing signing certificate password}"
: "${OBAILS_NOTARY_KEY_BASE64:?Missing notarization key}"
: "${OBAILS_NOTARY_KEY_ID:?Missing notarization key ID}"
: "${OBAILS_NOTARY_ISSUER_ID:?Missing notarization issuer ID}"
umask 077
credential_dir="$(mktemp -d "$RUNNER_TEMP/obails-signing.XXXXXX")"
keychain="$credential_dir/signing.keychain-db"
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$credential_dir"
}
trap cleanup EXIT
export OBAILS_NOTARY_KEY_PATH="$credential_dir/AuthKey.p8"
printf '%s' "$OBAILS_SIGNING_CERTIFICATE_BASE64" | base64 --decode > "$credential_dir/certificate.p12"
printf '%s' "$OBAILS_NOTARY_KEY_BASE64" | base64 --decode > "$OBAILS_NOTARY_KEY_PATH"
keychain_password="$(openssl rand -base64 32)"
security create-keychain -p "$keychain_password" "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$credential_dir/certificate.p12" -k "$keychain" \
  -P "$OBAILS_SIGNING_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"
export OBAILS_SIGN_IDENTITY='Developer ID Application: KAZUHIRO HOMMA (67M8FDFZ28)'
bash scripts/notarize-macos.sh bin/obails.app
version="$(node -p "require('./package.json').version")"
ditto -c -k --keepParent bin/obails.app "bin/obails-$version-macos-arm64.zip"
(cd bin && shasum -a 256 "obails-$version-macos-arm64.zip" > "obails-$version-macos-arm64.zip.sha256")
