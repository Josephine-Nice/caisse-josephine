/* Stockage local sur l'iPad (IndexedDB). */

const NOM = 'caisse-josephine';
let dbp = null;

function ouvrir() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('comptages')) db.createObjectStore('comptages', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await ouvrir();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let res;
    const r = fn(s);
    if (r) r.onsuccess = () => { res = r.result; };
    t.oncomplete = () => resolve(res);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  tous: () => tx('comptages', 'readonly', s => s.getAll()).then(l => l || []),
  lire: id => tx('comptages', 'readonly', s => s.get(id)),
  ecrire: c => tx('comptages', 'readwrite', s => s.put(c)),
  /** Ajoute seulement si l'identifiant n'existe pas encore (jamais deux fois). */
  ajouter: async c => { if (await db.lire(c.id)) return false; await db.ecrire(c); return true; },
  supprimer: id => tx('comptages', 'readwrite', s => s.delete(id)),
  get: k => tx('kv', 'readonly', s => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
  del: k => tx('kv', 'readwrite', s => s.delete(k)),
};

/** Demande au navigateur de ne jamais effacer les données (stockage persistant). */
export async function stockagePersistant() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* ignoré */ }
  return false;
}
