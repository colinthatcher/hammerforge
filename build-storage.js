export const LEGACY_LIBRARY_KEY = 'hammerforge.library.v2';
const SCHEMA_VERSION = 1;

async function defaultOpenDatabase() {
  const { PGlite } = await import('./vendor/pglite/index.js');
  return new PGlite('idb://hammerforge-builds');
}

/**
 * Open local build storage. load() returns a validated library or null; save()
 * resolves once SQL persistence finishes (or rejects if neither journal nor SQL
 * accepted the write). The localStorage value preserves the library's top-level
 * shape and adds a private __buildStorage clock used to compare it with SQL.
 */
export async function openBuildStorage({ validateLibrary = value => value, storage,
  openDatabase = defaultOpenDatabase, locks, onStatus = () => {} } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  if (locks === undefined) { try { locks = openDatabase === defaultOpenDatabase ? globalThis.navigator?.locks : null; } catch { locks = null; } }
  let releaseLock;
  let lockReady = Promise.resolve(openDatabase !== defaultOpenDatabase);
  if (locks?.request) {
    let acquired;
    lockReady = new Promise(resolve => { acquired = resolve; });
    const held = new Promise(resolve => { releaseLock = resolve; });
    locks.request('hammerforge-builds', { mode: 'exclusive', ifAvailable: true }, async lock => {
      acquired(Boolean(lock));
      if (lock) await held;
    }).catch(() => acquired(false));
  }
  const isPrimary = await lockReady;
  let db = null;
  if (isPrimary) {
    try { db = await openDatabase(); }
    catch { onStatus('Database unavailable; using localStorage recovery journal'); }
  }
  let closed = false, pending = Promise.resolve(), sequence = 0, loadedClock = 0;
  const fallbackReason = isPrimary ? 'database unavailable' : locks?.request ? 'another tab owns the database' : 'Web Locks unavailable';

  if (db) {
    try {
      await db.exec('CREATE TABLE IF NOT EXISTS build_storage_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
      await db.exec('CREATE TABLE IF NOT EXISTS build_library (singleton INTEGER PRIMARY KEY CHECK(singleton=1), snapshot JSONB NOT NULL, saved_at BIGINT NOT NULL, revision BIGINT NOT NULL)');
      const version = await db.query("SELECT value FROM build_storage_meta WHERE key='schema_version'");
      if (version.rows[0] && Number(version.rows[0].value) > SCHEMA_VERSION) throw new Error('Unsupported build storage schema version');
      await db.query("INSERT INTO build_storage_meta(key,value) VALUES ('schema_version',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [SCHEMA_VERSION]);
    }
    catch (error) {
      await db.close();
      if (error.message === 'Unsupported build storage schema version') { releaseLock?.(); throw error; }
      db = null; onStatus('Database unavailable; using localStorage recovery journal');
    }
  }
  const readJournal = () => {
    try {
      let raw;
      try { raw = storage?.getItem(LEGACY_LIBRARY_KEY); }
      catch { return { unavailable: true }; }
      if (raw === null || raw === undefined) return null;
      const parsed = JSON.parse(raw);
      const clock = Number(parsed?.__buildStorage?.updatedAt) || 0;
      if (clock > loadedClock) loadedClock = clock;
      return { library: parsed, clock };
    } catch (error) { return { error }; }
  };

  async function load() {
    if (closed) throw new Error('Build storage is closed');
    const journal = readJournal();
    if (journal?.error) throw new Error('Saved library journal is corrupt and was preserved', { cause: journal.error });
    let row = null;
    if (db) {
      const result = await db.query('SELECT snapshot, saved_at, revision FROM build_library WHERE singleton=1');
      row = result.rows[0] ?? null;
    }
    const sql = row ? { library: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot, savedAt: Number(row.saved_at) || 0 } : null;
    loadedClock = Math.max(loadedClock, sql?.savedAt || 0);
    // A journal can contain an edit made before SQL flushed, or in another tab.
    const newest = journal?.unavailable ? sql : journal && (!sql || journal.clock >= Number(row?.saved_at)) ? journal : sql;
    if (!newest) return null;
    try {
      const checked = validateLibrary(stripJournalMetadata(newest.library));
      if (db && journal && !journal.unavailable && (!sql || newest === journal && journal.clock > sql.savedAt)) {
        try { await writeSql(checked, journal.clock, journal.clock); }
        catch { onStatus('Loaded recovery journal; database migration/update unavailable'); }
      }
      return checked;
    }
    catch (error) { throw new Error('Saved library is invalid; stored data was preserved', { cause: error }); }
  }

  function save(library) {
    if (closed) return Promise.reject(new Error('Build storage is closed'));
    let snapshot;
    try { snapshot = structuredClone(library); } catch (error) { return Promise.reject(error); }
    const revision = ++sequence;
    const existing = readJournal();
    const savedAt = Math.max(Date.now(), loadedClock + 1, (existing?.clock || 0) + 1);
    loadedClock = savedAt;
    let journalWritten = false;
    try {
      if (storage?.setItem) {
        storage.setItem(LEGACY_LIBRARY_KEY, JSON.stringify({ ...snapshot, __buildStorage: { version: 1, updatedAt: savedAt } }));
        journalWritten = true;
      }
    } catch { /* SQL may still persist the edit. */ }
    const work = pending.catch(() => {}).then(async () => {
      if (!db) {
        if (!journalWritten) throw new Error('Neither IndexedDB nor localStorage could persist the library');
        if (revision === sequence) onStatus(`Saved locally (${fallbackReason}; localStorage fallback)`);
        return;
      }
      try {
        await writeSql(snapshot, savedAt, revision);
        if (revision === sequence) onStatus(journalWritten ? 'Saved locally' : 'Saved to database; backup unavailable');
      } catch (error) {
        if (!journalWritten) throw error;
        if (revision === sequence) onStatus('Saved to recovery journal; database unavailable');
      }
    });
    pending = work;
    return work;
  }

  function writeSql(snapshot, savedAt, revision) {
    return db.query(`INSERT INTO build_library(singleton,snapshot,saved_at,revision) VALUES (1,$1::jsonb,$2,$3)
      ON CONFLICT(singleton) DO UPDATE SET snapshot=excluded.snapshot,saved_at=excluded.saved_at,revision=excluded.revision`,
    [JSON.stringify(snapshot), savedAt, revision]);
  }

  function stripJournalMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, '__buildStorage')) return value;
    const copy = { ...value };
    delete copy.__buildStorage;
    return copy;
  }

  return { load, save, async close() { if (closed) return; closed = true; try { await pending; } finally { try { await db?.close(); } finally { releaseLock?.(); } } } };
}
