/*
 * Envoi automatique des comptages vers le Google Sheet.
 * Chaque comptage est d'abord enregistré sur l'iPad (sync: 'attente'), puis
 * envoyé ; il passe à 'envoye' seulement quand le script a confirmé.
 * Le script ignore un identifiant déjà reçu : un renvoi ne crée jamais de doublon.
 */
import { CONFIG } from './config.js';
import { db } from './db.js';

let enCours = null;
const ecouteurs = new Set();
export function surChangement(fn) { ecouteurs.add(fn); }
function prevenir() { for (const fn of ecouteurs) try { fn(); } catch (e) { /* */ } }

/** Appel au script Google (POST en text/plain : pas de requête préalable CORS). */
export async function appelScript(corps, delai = 25000) {
  if (!CONFIG.SCRIPT_URL) throw new Error('non-configure');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), delai);
  try {
    const r = await fetch(CONFIG.SCRIPT_URL, {
      method: 'POST', body: JSON.stringify(corps), signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', cache: 'no-store',
    });
    if (!r.ok) throw new Error('http-' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Données envoyées : le comptage tel qu'enregistré, sans les champs internes. */
export function pourEnvoi(c) {
  const { sync, envoyeLe, ...reste } = c;
  return reste;
}

export async function etatEnvoi() {
  const tous = await db.tous();
  return {
    attente: tous.filter(c => c.sync !== 'envoye').length,
    erreur: await db.get('syncErreur'),
    dernier: await db.get('syncDernier'),
  };
}

export function synchroniser() {
  if (enCours) return enCours;
  enCours = (async () => {
    try {
      const cle = await db.get('cle');
      if (!CONFIG.SCRIPT_URL || !cle) { await db.set('syncErreur', 'non-configure'); return; }
      if (navigator.onLine === false) return;
      const attente = (await db.tous()).filter(c => c.sync !== 'envoye')
        .sort((a, b) => a.horodatage.localeCompare(b.horodatage));
      for (const c of attente) {
        let rep;
        try { rep = await appelScript({ action: 'enregistrer', cle, comptage: pourEnvoi(c) }); }
        catch (e) { await db.set('syncErreur', 'reseau'); return; }
        if (rep && rep.ok) {
          const frais = await db.lire(c.id);
          if (frais) { frais.sync = 'envoye'; frais.envoyeLe = new Date().toISOString(); await db.ecrire(frais); }
          await db.set('syncErreur', null);
          await db.set('syncDernier', new Date().toISOString());
          prevenir();
        } else {
          await db.set('syncErreur', (rep && rep.erreur) || 'inconnue');
          return;
        }
      }
    } finally { enCours = null; prevenir(); }
  })();
  return enCours;
}

/** Relance automatique : au démarrage, au retour du réseau, et toutes les minutes. */
export function demarrerSynchro() {
  synchroniser();
  window.addEventListener('online', () => synchroniser());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) synchroniser(); });
  setInterval(() => synchroniser(), 60000);
}
