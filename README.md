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
docker compose up -d --build
```

Open **http://localhost:8080**.

## Checks

```sh
mise run verify
```
