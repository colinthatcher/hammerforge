# Hammerforge

A **Path of Building (PoB)-inspired build planner for Heroes of Hammerwatch II (HOH2)**. Create, import, and compare character builds, equipment, skills, and upgrades.

This project was **created entirely with AI**. It is experimental: calculations are incomplete and may not match in-game behavior.

## Run locally

Install [mise](https://mise.jdx.dev/), then run these commands from the project directory:

```sh
mise trust
mise install
mise run dev
```

Open **http://localhost:5173**. Dependencies and PGlite browser assets are prepared automatically. A game installation is not required to run the planner.

Builds are saved locally in your browser across sessions. Clearing site data removes them; use **Export build** to keep a backup.

### Docker

```sh
GIT_REVISION="$(git rev-parse HEAD)" \
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
docker compose up -d --build
```

Open **http://localhost:8080**.

The image embeds build metadata; it does not inspect a host checkout at runtime. `GET /health` returns JSON containing `status`, `name`, `version`, `gitRevision`, and `buildDate`. If revision metadata is not supplied or detected while building, `gitRevision` is `unknown`; if no build date is supplied, the image build time is used.

Both the image and Compose health checks use `/health`. Check it manually with `curl http://localhost:8080/health`. The local development server exposes the same endpoint at `http://localhost:5173/health`, detects the Git revision at startup, and reports `buildDate: null` unless `BUILD_DATE` is supplied. This is a liveness endpoint, not a check of game-data or calculation accuracy.

Startup logs include the same application version and full Git revision as `/health` (`docker compose logs hammerforge` for Docker). The page footer also shows the app version and shortened Git revision, separately from the Steam game-data build; hover over it for the full revision and build date. If build metadata is unavailable, the footer says so without blocking the planner.

## Checks

```sh
mise run verify
```
