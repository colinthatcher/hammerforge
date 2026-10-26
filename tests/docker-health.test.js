import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [dockerfile, compose, nginx, dockerignore] = await Promise.all([
  readFile(new URL('../Dockerfile', import.meta.url), 'utf8'),
  readFile(new URL('../compose.yaml', import.meta.url), 'utf8'),
  readFile(new URL('../docker/default.conf', import.meta.url), 'utf8'),
  readFile(new URL('../.dockerignore', import.meta.url), 'utf8'),
]);

test('health endpoint serves build metadata privately with JSON and no caching', () => {
  assert.match(nginx, /location = \/health\s*\{/);
  assert.match(nginx, /alias \/etc\/nginx\/health\.json;/);
  assert.match(nginx, /default_type application\/json;/);
  assert.match(nginx, /add_header Cache-Control "no-store" always;/);
  assert.match(dockerfile, /COPY --from=dependencies \/app\/health\.json \/etc\/nginx\/health\.json/);
});

test('image and Compose healthchecks request the health endpoint', () => {
  assert.match(dockerfile, /http:\/\/127\.0\.0\.1\/health/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /http:\/\/127\.0\.0\.1\/health/);
});

test('image builds metadata without including a host Git checkout', () => {
  assert.match(dockerfile, /COPY scripts\/version\.mjs/);
  assert.match(dockerfile, /node scripts\/version\.mjs \/app\/health\.json/);
  assert.match(compose, /GIT_REVISION: \$\{GIT_REVISION:-unknown\}/);
  assert.match(compose, /BUILD_DATE: \$\{BUILD_DATE:-\}/);
  assert.match(dockerignore, /^\*$/m);
  assert.doesNotMatch(dockerignore, /^!\.git/m);
});
