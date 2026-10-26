# Project workflow

- Commit completed changes as new commits; do not amend existing commits unless explicitly requested.
- Keep commit messages high-level: describe the overall change only, without implementation details.
- Use mise for local tool versions and commands (`mise run dev`, `mise run verify`, or `mise exec -- …`). Tool versions and shared tasks belong in `mise.toml`.
- Game-data tooling reads the installed game without modifying it. Extracted source belongs in ignored `.game-data/`; generated reference data belongs in `data/`.
- Keep source provenance and Steam build IDs with game data. Distinguish extracted definitions, reviewed mechanics, and runtime-validated simulation; do not silently treat example values as real game mechanics.
- After data changes, run `mise run verify` and, when the game is installed, `mise run data:verify`.
