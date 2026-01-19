# Obails Project Instructions

## Post-Task Requirements

### After completing any work, always restart the app
- Kill existing processes: `pkill -f "obails"; lsof -ti:9245 | xargs kill -9`
- Launch: `open bin/obails.dev.app` (if built) or `wails3 dev`

## Development Commands

### Build & Run
```bash
# Development mode
wails3 dev

# Direct app launch (after build)
open bin/obails.dev.app

# Production build
wails3 build
```

### Testing
```bash
# Run all E2E tests
pnpm test

# Run specific test suite
pnpm test --grep "Graph View"

# Run with UI
pnpm test:ui

# Run unit tests (frontend)
cd frontend && pnpm test
```

## Port Configuration
- Frontend dev server: `http://localhost:9245`

## Release & Distribution

### Build for Release
```bash
# Production build (creates bin/obails.app)
wails3 task darwin:package
```

### Create GitHub Release
```bash
# 1. Tag the release
git tag v0.1.0
git push origin v0.1.0

# 2. Build production app
wails3 task darwin:package

# 3. Zip for distribution
cd bin && zip -r obails-macos.zip obails.app && cd ..

# 4. Create GitHub Release with asset
gh release create v0.1.0 bin/obails-macos.zip \
  --title "v0.1.0" \
  --notes "Release notes here"
```

### Note on Code Signing
- Current releases are unsigned (no Apple Developer certificate)
- Users will see "developer cannot be verified" warning
- Workaround: Right-click → Open (or `xattr -cr obails.app`)
- Future: Consider Apple Developer Program ($99/year) for notarization

## Known Issues
- Port conflicts: Kill vite/obails processes before restarting
- Binding error for missing files: Non-fatal, app continues to work
