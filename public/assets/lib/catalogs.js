// Catalogs that are identical for every user and change rarely — the node tree, the reaction set, the smilie
// list — cached in localStorage with a TTL. Cold page loads read them from disk instead of re-downloading
// (nodes alone is ~100KB), and a discarded mobile tab loses nothing. Values live in one versioned key per
// catalog; bump PREFIX's version when a catalog's shape changes. Concurrent first calls share one fetch via
// the pending map; failures are never cached, so the next caller retries.

const PREFIX = 'voz-catalog:v1:';
const TTL = 24 * 60 * 60 * 1000;

const memory = new Map();
const pending = new Map();
const storedAt = new Map();

// Sync peek: memory first, then a non-expired localStorage entry. Null when absent or expired.
export function readCatalog(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const hit = JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
    if (hit && typeof hit.t === 'number' && Date.now() - hit.t < TTL && hit.v != null) {
      storedAt.set(key, hit.t);
      memory.set(key, hit.v);
      return hit.v;
    }
  } catch {
    // Corrupt entry: treat as absent.
  }
  return null;
}

// Milliseconds since the stored copy was fetched; null when nothing is stored (or it expired).
export function catalogAge(key) {
  if (storedAt.has(key)) return Date.now() - storedAt.get(key);
  readCatalog(key);
  return storedAt.has(key) ? Date.now() - storedAt.get(key) : null;
}

export function storeCatalog(key, value) {
  if (value == null) return;
  storedAt.set(key, Date.now());
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Quota or private-mode failure: the in-memory copy still serves this page load.
  }
}

export function cachedCatalog(key, fetcher) {
  if (memory.has(key)) return Promise.resolve(memory.get(key));
  if (pending.has(key)) return pending.get(key);
  const cached = readCatalog(key);
  if (cached != null) return Promise.resolve(cached);
  const fetching = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      if (value == null) throw new Error(`catalog ${key} empty`);
      storeCatalog(key, value);
      pending.delete(key);
      return value;
    })
    .catch((error) => {
      pending.delete(key);
      throw error;
    });
  pending.set(key, fetching);
  return fetching;
}
