/*
 * Caisse Joséphine — calculs.
 * Tous les montants sont en CENTIMES ENTIERS (jamais de nombres à virgule).
 * Ce fichier ne dépend de rien : il est utilisé par l'application, la page
 * Suivi caisse et les tests automatisés.
 */

/** Fond de caisse fixe, en centimes (100,00 €). */
export const FOND_DE_CAISSE = 10000;

/** Nombre maximum de pièces d'une même valeur laissées dans la caisse. */
export const MAX_PIECES_PAR_VALEUR = 20;

/** Pièces utilisées, en centimes, de la plus petite à la plus grande. */
export const PIECES = [1, 2, 5, 10, 20, 50, 100, 200];

/** Billets utilisés, en centimes, du plus petit au plus grand. */
export const BILLETS = [500, 1000, 2000, 5000];

export const COUPURES = [...PIECES, ...BILLETS];

export function estPiece(v) { return PIECES.includes(v); }

/** Quantités vides : { "1": 0, "2": 0, ... "5000": 0 }. */
export function quantitesVides() {
  const q = {};
  for (const v of COUPURES) q[v] = 0;
  return q;
}

/** Nettoie une quantité saisie : entier >= 0. */
export function quantite(x) {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function sousTotal(valeur, qte) { return valeur * quantite(qte); }

export function totaux(q) {
  let pieces = 0, billets = 0;
  for (const v of PIECES) pieces += v * quantite(q[v]);
  for (const v of BILLETS) billets += v * quantite(q[v]);
  return { pieces, billets, total: pieces + billets };
}

/** Écart d'ouverture : compté – attendu (positif = en trop, négatif = manquant). */
export function ecart(total, attendu = FOND_DE_CAISSE) { return total - attendu; }

/* ------------------------------------------------------------------ */
/* Répartition caisse / coffre du soir                                 */
/* ------------------------------------------------------------------ */

/*
 * Programmation dynamique exacte sur les centimes (pièces).
 * best[v] = plus grand nombre de pièces permettant de faire exactement v
 * centimes (-1 si impossible), avec au plus min(compté, limite) pièces par
 * valeur. choix[i][v] = nombre de pièces de PIECES[i] utilisées.
 */
function dpPieces(compte, limite, cible) {
  const n = PIECES.length;
  let best = new Int32Array(cible + 1).fill(-1);
  best[0] = 0;
  const choix = [];
  for (let i = 0; i < n; i++) {
    const d = PIECES[i];
    const m = Math.min(quantite(compte[d]), limite, Math.floor(cible / d));
    const next = new Int32Array(cible + 1).fill(-1);
    const ch = new Int16Array(cible + 1);
    for (let v = 0; v <= cible; v++) {
      let b = -1, bj = 0;
      for (let j = 0; j <= m && j * d <= v; j++) {
        const prev = best[v - j * d];
        if (prev < 0) continue;
        const c = prev + j;
        if (c > b) { b = c; bj = j; }
      }
      next[v] = b; ch[v] = bj;
    }
    best = next; choix.push(ch);
  }
  return { best, choix };
}

function reconstruirePieces(choix, valeur) {
  const res = {};
  let v = valeur;
  for (let i = PIECES.length - 1; i >= 0; i--) {
    const j = choix[i][v];
    res[PIECES[i]] = j;
    v -= j * PIECES[i];
  }
  return res;
}

/*
 * Pour chaque montant atteignable en billets (multiple de 5 €), la
 * composition qui utilise les plus petits billets : on minimise d'abord le
 * nombre de 50 €, puis de 20 €, puis de 10 € (le reste en 5 €).
 */
function compositionsBillets(compte, cible) {
  const c = BILLETS.map(v => quantite(compte[v]));
  const res = new Map(); // montant -> { 500: n, 1000: n, ... }
  const [b5, b10, b20, b50] = BILLETS;
  for (let n50 = 0; n50 <= c[3] && n50 * b50 <= cible; n50++)
    for (let n20 = 0; n20 <= c[2] && n50 * b50 + n20 * b20 <= cible; n20++)
      for (let n10 = 0; n10 <= c[1] && n50 * b50 + n20 * b20 + n10 * b10 <= cible; n10++)
        for (let n5 = 0; n5 <= c[0]; n5++) {
          const t = n50 * b50 + n20 * b20 + n10 * b10 + n5 * b5;
          if (t > cible) break;
          const prev = res.get(t);
          const cle = [n50, n20, n10];
          if (!prev || plusPetit(cle, [prev[b50], prev[b20], prev[b10]]))
            res.set(t, { [b5]: n5, [b10]: n10, [b20]: n20, [b50]: n50 });
        }
  return res;
}

function plusPetit(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/*
 * Meilleure composition du fond avec une limite de pièces donnée.
 * Ordre de préférence (lexicographique) :
 *   1. fond le plus proche possible de la cible, sans la dépasser ;
 *   2. valeur des pièces gardées maximale ;
 *   3. plus petits billets (via compositionsBillets) ;
 *   4. nombre de pièces gardées maximal (via la programmation dynamique).
 */
function meilleurFond(compte, limite, cible) {
  const { best, choix } = dpPieces(compte, limite, cible);
  const billets = compositionsBillets(compte, cible);
  let meilleur = null;
  for (const [mb, compo] of billets) {
    // plus grande valeur de pièces atteignable <= cible - mb
    for (let vp = cible - mb; vp >= 0; vp--) {
      if (best[vp] < 0) continue;
      const fond = vp + mb;
      if (!meilleur || fond > meilleur.fond || (fond === meilleur.fond && vp > meilleur.vp))
        meilleur = { fond, vp, compoBillets: compo };
      break;
    }
  }
  const garde = { ...reconstruirePieces(choix, meilleur.vp), ...meilleur.compoBillets };
  return { fond: meilleur.fond, garde };
}

/**
 * Calcule automatiquement ce qui reste dans la caisse et ce qui va au coffre.
 * @param {Object} compte  quantités comptées par coupure (clé = centimes)
 * @returns {{
 *   garde: Object, coffre: Object, fond: number, enveloppe: number,
 *   statut: 'ok'|'incomplet'|'impossible', limiteDepassee: boolean
 * }}
 */
export function repartir(compte, cible = FOND_DE_CAISSE, limite = MAX_PIECES_PAR_VALEUR) {
  const q = {};
  for (const v of COUPURES) q[v] = quantite(compte[v]);
  const { total } = totaux(q);

  // Cas particulier : moins que le fond -> tout reste dans la caisse.
  if (total <= cible) {
    const r = resultat(q, { ...q });
    r.statut = total === cible ? 'ok' : 'incomplet';
    return r;
  }

  // Meilleur fond possible sans aucune limite (ce qu'on peut faire de mieux).
  const maxQ = Math.max(limite, ...PIECES.map(v => q[v]));
  const sansLimite = meilleurFond(q, maxQ, cible);
  let choisi = meilleurFond(q, limite, cible);

  // Priorité 1 (100,00 € pile) avant priorité 2 (limite de 20) : si la
  // limite empêche d'atteindre le meilleur fond possible, on cherche la plus
  // petite limite qui le permet (recherche dichotomique, exacte).
  if (choisi.fond < sansLimite.fond) {
    let lo = limite + 1, hi = maxQ;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (meilleurFond(q, mid, cible).fond === sansLimite.fond) hi = mid; else lo = mid + 1;
    }
    choisi = meilleurFond(q, lo, cible);
  }

  const r = resultat(q, choisi.garde);
  r.statut = r.fond === cible ? 'ok' : 'impossible';
  return r;
}

/** Construit le résultat à partir des quantités gardées (coffre = compté – caisse). */
export function resultat(compte, garde, limite = MAX_PIECES_PAR_VALEUR) {
  const g = {}, c = {};
  let fond = 0, enveloppe = 0, limiteDepassee = false;
  for (const v of COUPURES) {
    const n = quantite(compte[v]);
    const k = Math.min(n, quantite(garde[v]));
    g[v] = k; c[v] = n - k;
    fond += v * k; enveloppe += v * (n - k);
    if (estPiece(v) && k > limite) limiteDepassee = true;
  }
  return { garde: g, coffre: c, fond, enveloppe, limiteDepassee };
}

/**
 * Pour l'affichage : décompose les pièces mises au coffre en
 * « au-delà de la limite » et « pour tomber juste ».
 */
export function raisonsCoffre(compte, garde, limite = MAX_PIECES_PAR_VALEUR) {
  const res = {};
  for (const v of PIECES) {
    const n = quantite(compte[v]);
    const k = Math.min(n, quantite(garde[v]));
    const auCoffre = n - k;
    const limiteN = Math.min(auCoffre, Math.max(0, n - limite));
    res[v] = { limite: limiteN, appoint: auCoffre - limiteN };
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Formats                                                             */
/* ------------------------------------------------------------------ */

/**
 * 123456 -> "1 234,56 €". sep = séparateur des milliers (espace insécable
 * par défaut ; espace simple pour les PDF).
 */
export function euros(cents, { signe = false, sep = ' ', symbole = true } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const e = Math.floor(abs / 100), c = abs % 100;
  const ent = String(e).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const s = `${ent},${String(c).padStart(2, '0')}`;
  const pre = neg ? '–' : (signe && cents > 0 ? '+' : '');
  return pre + s + (symbole ? ' €' : '');
}

/** Libellé d'une coupure : 1 -> "0,01 €", 100 -> "1 €", 5000 -> "50 €". */
export function libelle(v) {
  return v % 100 === 0 ? `${v / 100} €` : `0,${String(v).padStart(2, '0')} €`;
}

/* ------------------------------------------------------------------ */
/* Dates (fuseau Europe/Paris)                                         */
/* ------------------------------------------------------------------ */

export const TZ = 'Europe/Paris';

/** { date: "2026-11-04", heure: "09:17:42", h: 9, jourSemaine: 3 } en heure de Paris. */
export function parisMaintenant(d = new Date()) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(d)) p[x.type] = x.value;
  const jours = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    heure: `${p.hour}:${p.minute}:${p.second}`,
    h: Number(p.hour), jourSemaine: jours[p.weekday]
  };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** "2026-11-04" -> "mercredi 4 novembre 2026" */
export function dateLongue(iso, { jour = true, annee = true } = {}) {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${jour ? JOURS[js] + ' ' : ''}${d === 1 ? '1er' : d} ${MOIS[m - 1]}${annee ? ' ' + y : ''}`;
}

/** "2026-11-04" -> "04/11/2026" */
export function dateCourte(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function typeLibelle(t) { return t === 'ouverture' ? 'Ouverture' : 'Clôture'; }
