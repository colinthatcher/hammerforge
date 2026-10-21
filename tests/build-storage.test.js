import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { openBuildStorage, LEGACY_LIBRARY_KEY } from '../build-storage.js';

const valid = value => {
  if (!value || !Array.isArray(value.builds)) throw new Error('invalid library');
  return value;
};
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
const database = () => new PGlite();

test('creates SQL storage, saves and reopens snapshot', async () => {
  const storage = memoryStorage(), db = await database();
  const first = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  const value = { builds: [{ id: 'a' }] };
  await first.save(value);
  assert.deepEqual(await first.load(), value);
  storage.removeItem = key => storage.values.delete(key);
  storage.removeItem(LEGACY_LIBRARY_KEY);
  const reopened = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  assert.deepEqual(await reopened.load(), value);
  assert.equal((await db.query('SELECT snapshot FROM build_library WHERE singleton=1')).rows.length, 1);
  await reopened.close();
});

test('migrates legacy localStorage data and retains journal', async () => {
  const value = { builds: [{ id: 'legacy' }] }, storage = memoryStorage({ [LEGACY_LIBRARY_KEY]: JSON.stringify(value) });
  const db = await database(), store = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  assert.deepEqual(await store.load(), value);
  assert.equal((await db.query('SELECT snapshot FROM build_library WHERE singleton=1')).rows.length, 1);
  await store.save(value);
  assert.deepEqual(await store.load(), value);
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY_LIBRARY_KEY)).builds, value.builds);
  await store.close();
});

test('serializes invocation snapshots in order', async () => {
  const db = await database(), storage = memoryStorage(), store = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  const original = { builds: [{ id: 'one' }] };
  const pending = store.save(original);
  original.builds[0].id = 'changed';
  const second = store.save({ builds: [{ id: 'two' }] });
  await Promise.all([pending, second]);
  assert.equal((await store.load()).builds[0].id, 'two');
  await store.close();
});

test('uses localStorage fallback when database unavailable and preserves corrupt data', async () => {
  const storage = memoryStorage();
  const fallback = await openBuildStorage({ storage, openDatabase: async () => { throw new Error('offline'); }, validateLibrary: valid });
  await fallback.save({ builds: [{ id: 'backup' }] });
  assert.equal((await fallback.load()).builds[0].id, 'backup');
  await fallback.close();

  const corrupt = '{not json', corruptStorage = memoryStorage({ [LEGACY_LIBRARY_KEY]: corrupt });
  const broken = await openBuildStorage({ storage: corruptStorage, openDatabase: async () => { throw new Error('offline'); }, validateLibrary: valid });
  await assert.rejects(broken.load());
  assert.equal(corruptStorage.getItem(LEGACY_LIBRARY_KEY), corrupt);
  await broken.close();
});

test('rejects when both persistent stores fail', async () => {
  const storage = { getItem: () => null, setItem() { throw new Error('blocked'); } };
  const db = await database(), store = await openBuildStorage({ storage, openDatabase: async () => db });
  const query = db.query.bind(db);
  db.query = async (...args) => { if (String(args[0]).startsWith('INSERT')) throw new Error('write failed'); return query(...args); };
  await assert.rejects(store.save({ builds: [] }), /write failed/);
  await assert.rejects(store.close(), /write failed/);
});

test('valid legacy library migrates into SQL during load', async () => {
  const value = { builds: [{ id: 'migrated' }] }, storage = memoryStorage({ [LEGACY_LIBRARY_KEY]: JSON.stringify(value) }), db = await database();
  const store = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  assert.deepEqual(await store.load(), value);
  assert.deepEqual((await db.query('SELECT snapshot FROM build_library')).rows[0].snapshot, value);
  await store.close();
});

test('secondary lock holder uses localStorage only', async () => {
  const lock = { request: async (_name, _options, callback) => callback(null) }, storage = memoryStorage();
  const store = await openBuildStorage({ locks: lock, storage, openDatabase: async () => { throw new Error('must not open'); } });
  await store.save({ builds: [{ id: 'secondary' }] });
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY_LIBRARY_KEY)).builds, [{ id: 'secondary' }]);
  await store.close();
});

test('persists to SQL without localStorage and closes after failed write', async () => {
  const db = await database(), store = await openBuildStorage({ storage: null, openDatabase: async () => db });
  await store.save({ builds: [] });
  assert.equal((await db.query('SELECT snapshot FROM build_library')).rows.length, 1);
  await store.close();

  const failingDb = await database(), failing = await openBuildStorage({ storage: null, openDatabase: async () => failingDb });
  const query = failingDb.query.bind(failingDb);
  failingDb.query = async (...args) => { if (String(args[0]).startsWith('INSERT INTO build_library')) throw new Error('write failed'); return query(...args); };
  await assert.rejects(failing.save({ builds: [] }), /write failed/);
  await assert.rejects(failing.close(), /write failed/);
  assert.equal(failingDb.closed, true);
});

test('rejects future schema versions', async () => {
  const db = await database();
  await db.exec("CREATE TABLE build_storage_meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL)");
  await db.query("INSERT INTO build_storage_meta VALUES ('schema_version',99)");
  await assert.rejects(openBuildStorage({ storage: memoryStorage(), openDatabase: async () => db }), /Unsupported build storage schema version/);
});

test('loads newer SQL after journal write failure despite stale journal', async () => {
  const old = { builds: [{ id: 'old' }] }, newer = { builds: [{ id: 'new' }] };
  const storage = memoryStorage({ [LEGACY_LIBRARY_KEY]: JSON.stringify({ ...old, __buildStorage: { version: 1, updatedAt: 10 } }) });
  const db = await database();
  const store = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  await store.save(newer);
  storage.setItem = () => { throw new Error('quota'); };
  // Restore the stale journal after the successful SQL-only write.
  storage.values.set(LEGACY_LIBRARY_KEY, JSON.stringify({ ...old, __buildStorage: { version: 1, updatedAt: 10 } }));
  const reopened = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  assert.deepEqual(await reopened.load(), newer);
  await store.close();
  // The first handle closes this shared test database; do not close it twice.
});

test('primary observes and syncs a newer journal from another tab', async () => {
  const old = { builds: [{ id: 'old' }] }, update = { builds: [{ id: 'secondary-edit' }] }, db = await database();
  const storage = memoryStorage({ [LEGACY_LIBRARY_KEY]: JSON.stringify(old) });
  const primary = await openBuildStorage({ storage, openDatabase: async () => db, validateLibrary: valid });
  await primary.load();
  storage.setItem(LEGACY_LIBRARY_KEY, JSON.stringify({ ...update, __buildStorage: { version: 1, updatedAt: Date.now() + 100 } }));
  assert.deepEqual(await primary.load(), update);
  assert.deepEqual((await db.query('SELECT snapshot FROM build_library')).rows[0].snapshot, update);
  await primary.close();
});
