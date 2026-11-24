/** Cached catalogs. */

const PREFIX = 'voz-catalog:v1:';
const TTL = 24 * 60 * 60 * 1000;

const memory = new Map();
const pending = new Map();
const storedAt = new Map();

// Memory first, then non-expired localStorage; null if absent.
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
    // Corrupt entry: treat as absent
  }
  return null;
}

// Ms since the stored copy was fetched; null if none.
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
    // Quota/private-mode failure: memory copy still serves this load.
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
