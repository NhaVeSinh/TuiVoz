// Catalogs that are identical for every user and change rarely — the node tree, the reaction set, the smilie
// list — cached in localStorage with a TTL. Cold page loads read them from disk instead of re-downloading
// (nodes alone is ~100KB), and a discarded mobile tab loses nothing. Values live in one versioned key per
// catalog; bump PREFIX's version when a catalog's shape changes. Concurrent first calls share one fetch via
// the pending map; failures are never cached, so the next caller retries.

const PREFIX = 'voz-catalog:v1:';
const TTL = 24 * 60 * 60 * 1000;

const memory = new Map();
const pending = new Map();

export function cachedCatalog(key, fetcher) {
  if (memory.has(key)) return Promise.resolve(memory.get(key));
  if (pending.has(key)) return pending.get(key);
  try {
    const hit = JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
    if (hit && typeof hit.t === 'number' && Date.now() - hit.t < TTL && hit.v != null) {
      memory.set(key, hit.v);
      return Promise.resolve(hit.v);
    }
  } catch {
    // Corrupt entry: fall through and refetch.
  }
  const fetching = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      if (value == null) throw new Error(`catalog ${key} empty`);
      memory.set(key, value);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
      } catch {
        // Quota or private-mode failure: the in-memory copy still serves this page load.
      }
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
