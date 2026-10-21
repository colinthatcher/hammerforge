// Browser regression for the local SQL/IndexedDB build library.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { throw Error('UI tests require Playwright. Set PLAYWRIGHT_MODULE to its index.mjs in a separate installation.'); }

const url = process.env.UI_TEST_URL || 'http://localhost:5173';
// Override when a browser sandbox does not share the host's /tmp directory.
const profileRoot = process.env.UI_TEST_PROFILE_ROOT || os.tmpdir();
const profile = await mkdtemp(path.join(profileRoot, 'hammerforge-storage-ui-'));
const errors = [], assetFailures = [];
const attach = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (/pglite/i.test(request.url())) assetFailures.push(`${request.url()}: ${request.failure()?.errorText}`); });
  page.on('response', response => { if (/pglite/i.test(response.url())) assert.ok(response.ok(), `PGlite asset failed: ${response.url()} (${response.status()})`); });
};
const ready = async page => { await page.goto(url); await page.locator('#planner').waitFor({ state: 'visible' }); };
const getBuild = page => page.evaluate(() => {
  const library = JSON.parse(localStorage.getItem('hammerforge.library.v2'));
  return library.builds.find(build => build.id === library.activeId);
});
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 }, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  let page = context.pages()[0] || await context.newPage(); attach(page);
  await ready(page);
  await page.waitForFunction(() => Boolean(localStorage.getItem('hammerforge.library.v2')));
  const initial = await getBuild(page);
  assert.match(initial.name, /^New .+ build$/, 'fresh profile starts with the default build');
  await page.locator('#build-name').fill('Storage regression build');
  await page.locator('#build-name').blur();
  await page.waitForFunction(() => document.querySelector('#saved').textContent === 'Saved locally');
  assert.equal((await getBuild(page)).name, 'Storage regression build');
  // Remove the synchronous recovery journal: a reload must restore SQL/IndexedDB.
  await page.evaluate(() => localStorage.removeItem('hammerforge.library.v2'));
  await page.reload(); await page.locator('#planner').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#build-name').value === 'Storage regression build');
  const savedId = await page.locator('#build-select').inputValue();
  assert.equal((await getBuild(page)).id, savedId);
  await page.waitForFunction(() => document.querySelector('#saved').textContent === 'Saved locally');
  await context.close(); context = null;

  // Reopening the same persistent profile verifies storage survives browser close.
  context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 }, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  page = context.pages()[0] || await context.newPage(); attach(page); await ready(page);
  assert.equal(await page.locator('#build-name').inputValue(), 'Storage regression build', 'same browser profile restores the saved build after restart');
  assert.equal((await getBuild(page)).id, savedId);
  await context.close(); context = null;

  // A separate persistent profile must receive an independent default library.
  const secondProfile = await mkdtemp(path.join(profileRoot, 'hammerforge-storage-ui-fresh-'));
  try {
    const fresh = await chromium.launchPersistentContext(secondProfile, { headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
    const freshPage = fresh.pages()[0] || await fresh.newPage(); attach(freshPage); await ready(freshPage);
    await freshPage.waitForFunction(() => Boolean(localStorage.getItem('hammerforge.library.v2')));
    assert.match((await getBuild(freshPage)).name, /^New .+ build$/);
    assert.notEqual((await getBuild(freshPage)).id, savedId);

    // Seed a valid legacy-format library with the application's own build factory.
    await freshPage.goto(new URL('/data/game-data.json', url).href);
    await freshPage.evaluate(async () => {
      for(const db of await indexedDB.databases()) await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(db.name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});
      const [{ createBuild }, response] = await Promise.all([import('/planner-model.js'), fetch('/data/game-data.json')]);
      const build = createBuild(await response.json()); build.name = 'Migrated legacy build';
      localStorage.setItem('hammerforge.library.v2', JSON.stringify({ builds: [build], activeId: build.id }));
    });
    await ready(freshPage);
    await freshPage.waitForFunction(() => document.querySelector('#build-name').value === 'Migrated legacy build');
    assert.equal((await getBuild(freshPage)).name, 'Migrated legacy build');
    await fresh.close();
  } finally { await rm(secondProfile, { recursive: true, force: true }); }

  assert.deepEqual(assetFailures, [], 'PGlite assets load successfully');
  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('Storage UI regressions passed: SQL/IndexedDB reload and profile persistence, profile isolation, legacy migration, and PGlite assets.');
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
