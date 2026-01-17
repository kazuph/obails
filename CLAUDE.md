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

## Known Issues
- Port conflicts: Kill vite/obails processes before restarting
- Binding error for missing files: Non-fatal, app continues to work
