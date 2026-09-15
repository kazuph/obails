#!/bin/bash
set -euo pipefail

: "${OBAILS_SIGN_IDENTITY:?Set the Developer ID Application identity}"
: "${OBAILS_NOTARY_KEY_PATH:?Set the App Store Connect private key path}"
: "${OBAILS_NOTARY_KEY_ID:?Set the App Store Connect key ID}"
: "${OBAILS_NOTARY_ISSUER_ID:?Set the App Store Connect issuer ID}"
app="${1:?Usage: notarize-macos.sh path/to/obails.app}"
test -d "$app"
submission_dir="$(mktemp -d)"
trap 'rm -rf "$submission_dir"' EXIT

# Sign nested executables first; the outer signature seals their signatures.
for helper in obails-freeze obails-transcribe; do
  codesign --force --options runtime --timestamp --sign "$OBAILS_SIGN_IDENTITY" "$app/Contents/MacOS/$helper"
done
codesign --force --options runtime --timestamp --sign "$OBAILS_SIGN_IDENTITY" "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --keepParent "$app" "$submission_dir/submission.zip"
xcrun notarytool submit "$submission_dir/submission.zip" \
  --key "$OBAILS_NOTARY_KEY_PATH" --key-id "$OBAILS_NOTARY_KEY_ID" \
  --issuer "$OBAILS_NOTARY_ISSUER_ID" --wait
xcrun stapler staple "$app"
xcrun stapler validate "$app"
codesign --verify --deep --strict "$app"
spctl --assess --type execute --verbose=4 "$app"
