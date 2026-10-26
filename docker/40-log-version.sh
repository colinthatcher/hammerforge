#!/bin/sh
set -eu

# Log the same immutable build snapshot served by /health, not runtime env vars.
printf 'Hammerforge version: '
cat /etc/nginx/health.json
