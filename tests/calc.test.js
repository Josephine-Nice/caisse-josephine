/*
 * Tests automatisés des calculs (totaux, écarts, répartition du soir).
 * Lancer : ouvrir tests/index.html dans un navigateur
 * (ou, sur Mac : jsc -m tests/calc.test.js).
 */
import {
  FOND_DE_CAISSE, MAX_PIECES_PAR_VALEUR, PIECES, BILLETS, COUPURES,
  quantitesVides, totaux, ecart, repartir, resultat, raisonsCoffre, euros, libelle, dateLongue,
  centimesSaisis, sommeMouvements, caisseTheorique
} from '../js/calc.js';

const log = (typeof print === 'function') ? print : (...a) => console.log(...a);
const resultats = [];
function test(nom, fn) {
  try { fn(); resultats.push({ nom, ok: true }); }
  catch (e) { resultats.push({ nom, ok: false, err: e.message }); }
}
function egal(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg} attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function vrai(c, msg) { if (!c) throw new Error(msg || 'condition fausse'); }

function caisse(obj) { return { ...quantitesVides(), ...obj }; }

/** Vérifications communes à toute répartition. */
function invariants(compte, r) {
  for (const v of COUPURES) {
    egal(r.garde[v] + r.coffre[v], compte[v] || 0, `caisse + coffre = compté pour ${v}`);
    vrai(r.garde[v] >= 0 && r.coffre[v] >= 0, 'quantités positives');
  }
  const t = totaux(compte).total;
  egal(r.fond + r.enveloppe, t, 'fond + enveloppe = total');
  egal(r.fond, totaux(r.garde).total, 'fond = somme gardée');
  vrai(r.fond <= Math.max(FOND_DE_CAISSE, 0) || t <= FOND_DE_CAISSE, 'fond <= 100 €');
}

/** Recherche exhaustive (force brute) de la meilleure valeur de pièces gardée, pour contrôler l'algorithme. */
function forceBrute(compte) {
  const lim = PIECES.map(v => Math.min(compte[v] || 0, MAX_PIECES_PAR_VALEUR));
  const sommes = new Set([0]);
  PIECES.forEach((v, i) => {
    const cur = [...sommes];
    for (const s of cur) for (let j = 1; j <= lim[i]; j++) if (s + j * v <= FOND_DE_CAISSE) sommes.add(s + j * v);
  });
  const billets = new Set([0]);
  BILLETS.forEach(v => {
    const cur = [...billets];
    for (const s of cur) for (let j = 1; j <= (compte[v] || 0); j++) if (s + j * v <= FOND_DE_CAISSE) billets.add(s + j * v);
  });
  let best = { fond: -1, vp: -1 };
  for (const b of billets) for (const p of sommes) {
    const f = b + p;
    if (f > FOND_DE_CAISSE) continue;
    if (f > best.fond || (f === best.fond && p > best.vp)) best = { fond: f, vp: p };
  }
  return best;
}

// ---------- Totaux et écarts ----------
test('Totaux pièces / billets / général', () => {
  const q = caisse({ 1: 3, 2: 1, 50: 2, 200: 5, 500: 2, 5000: 1 });
  egal(totaux(q), { pieces: 3 + 2 + 100 + 1000, billets: 1000 + 5000, total: 7105 });
});
test('Totaux : champs vides ou invalides comptent 0', () => {
  egal(totaux({ 1: '', 2: 'abc', 5: -3, 10: '4' }).total, 40);
});
test('Écart d\'ouverture juste, en plus, en moins', () => {
  egal(ecart(10000), 0); egal(ecart(10001), 1); egal(ecart(9770), -230);
});
test('Pas d\'erreur d\'arrondi (0,10 + 0,20)', () => {
  egal(totaux(caisse({ 10: 1, 20: 1 })).total, 30);
  egal(euros(30), '0,30 €');
});
test('Format euros', () => {
  egal(euros(123456), '1 234,56 €');
  egal(euros(-230), '–2,30 €');
  egal(euros(5, { signe: true }), '+0,05 €');
  egal(euros(123456, { sep: ' ' }), '1 234,56 €');
  egal(libelle(1), '0,01 €'); egal(libelle(500), '5 €');
});
test('Dates en français', () => {
  egal(dateLongue('2026-11-04'), 'mercredi 4 novembre 2026');
  egal(dateLongue('2026-11-01', { jour: false, annee: false }), '1er novembre');
});

// ---------- Répartition du soir ----------
test('Caisse normale : 100 € pile, gros billets au coffre', () => {
  const c = caisse({ 1: 10, 2: 10, 5: 10, 10: 10, 20: 10, 50: 10, 100: 10, 200: 10, 500: 4, 1000: 3, 2000: 6, 5000: 2 });
  const r = repartir(c); invariants(c, r);
  egal(r.statut, 'ok'); egal(r.fond, 10000);
  // pièces : 0,10+0,20+0,50+1+2+5+10+20 = 38,80 € -> on garde 35 € de pièces (+65 € de billets ? non : 38,80 -> 35,00)
  egal(totaux(r.garde).pieces, forceBrute(c).vp);
  egal(r.garde[5000], 0, 'aucun billet de 50 € dans la caisse');
});
test('Plus de 20 pièces d\'une valeur : l\'excédent part au coffre', () => {
  const c = caisse({ 50: 22, 100: 20, 200: 20, 500: 4, 1000: 2, 2000: 3 });
  const r = repartir(c); invariants(c, r);
  egal(r.statut, 'ok'); egal(r.fond, 10000);
  egal(r.garde[50], 20); egal(r.coffre[50], 2);
  egal(raisonsCoffre(c, r.garde)[50], { limite: 2, appoint: 0 });
  vrai(!r.limiteDepassee);
});
test('Centimes à retirer pour tomber à 100,00 € pile', () => {
  const c = caisse({ 1: 7, 2: 3, 5: 2, 10: 5, 20: 4, 50: 6, 100: 10, 200: 12, 500: 3, 1000: 2, 2000: 4, 5000: 1 });
  const r = repartir(c); invariants(c, r);
  egal(r.fond, 10000); egal(r.statut, 'ok');
  const fb = forceBrute(c);
  egal(totaux(r.garde).pieces, fb.vp, 'valeur des pièces maximale');
  egal(totaux(r.garde).pieces % 500, 0, 'pièces gardées = multiple de 5 €');
  vrai(r.coffre[1] + r.coffre[2] + r.coffre[5] > 0, 'des centimes partent au coffre');
});
test('Moins de 100 € dans la caisse : tout reste, enveloppe à 0', () => {
  const c = caisse({ 1: 30, 50: 25, 200: 10, 500: 2, 1000: 3 });
  const r = repartir(c); invariants(c, r);
  egal(r.statut, 'incomplet'); egal(r.enveloppe, 0);
  egal(r.garde[1], 30); egal(r.garde[50], 25); egal(r.fond, totaux(c).total);
});
test('Exactement 100 € avec plus de 20 pièces : tout reste (priorité au 100 € pile)', () => {
  const c = caisse({ 100: 25, 500: 3, 2000: 3 });
  const r = repartir(c); invariants(c, r);
  egal(r.statut, 'ok'); egal(r.fond, 10000); egal(r.enveloppe, 0);
  vrai(r.limiteDepassee);
});
test('Pas assez de petite monnaie : on complète avec les plus petits billets', () => {
  // pièces : 9 € au total -> on garde 5 € (pour que le reste soit un multiple de 5 €)
  const c = caisse({ 100: 3, 200: 3, 500: 2, 1000: 4, 2000: 5, 5000: 3 });
  const r = repartir(c); invariants(c, r);
  egal(r.statut, 'ok'); egal(r.fond, 10000);
  egal(totaux(r.garde).pieces, 500);
  egal(totaux(r.garde).billets, 9500);
  egal(r.garde[5000], 0, 'aucun billet de 50 €');
  // 95 € sans 50 € : le moins possible de 20 € -> 3×20 + 3×10 + 1×5
  egal([r.garde[500], r.garde[1000], r.garde[2000]], [1, 3, 3]);
  // seulement des pièces de 2 € : 5 € est impossible, on ne garde aucune pièce
  const c2 = caisse({ 200: 3, 500: 2, 1000: 4, 2000: 5, 5000: 3 });
  const r2 = repartir(c2); invariants(c2, r2);
  egal(r2.fond, 10000); egal(totaux(r2.garde).pieces, 0);
});
test('Uniquement des billets : préférer 50+20+20+10 à 50+50', () => {
  const c = caisse({ 1000: 1, 2000: 2, 5000: 3 });
  const r = repartir(c); invariants(c, r);
  egal(r.fond, 10000);
  egal([r.garde[1000], r.garde[2000], r.garde[5000]], [1, 2, 1]);
});
test('100,00 € impossible à faire exactement : composition la plus proche en dessous', () => {
  const c = caisse({ 200: 3, 2000: 2, 5000: 2 });  // 146 € ; possibles : 0..6 + 0/20/40/50/70/90/100...
  const r = repartir(c); invariants(c, r);
  // 50+50 = 100 possible ! -> ok
  egal(r.statut, 'ok');
  const c2 = caisse({ 200: 2, 2000: 3, 5000: 2 }); // pièces 4 € ; billets 20,40,50,60,70,90,100(50+50)...
  egal(repartir(c2).fond, 10000);
  const c3 = caisse({ 50: 3, 200: 1, 2000: 3, 5000: 1 }); // 113,50 € mais pas de 100 pile : 50+20+20 + 3,50 = 93,50
  const r3 = repartir(c3); invariants(c3, r3);
  egal(r3.statut, 'impossible'); egal(r3.fond, 9350);
  egal(r3.fond, forceBrute(c3).fond, 'meilleur fond possible');
});
test('Ne jamais garder plus que compté', () => {
  const c = caisse({ 1: 1, 500: 1, 5000: 5 });
  const r = repartir(c); invariants(c, r);
  egal(r.statut, 'ok'); egal([r.garde[1], r.garde[500], r.garde[5000]], [0, 0, 2]);
});
test('Ajustement manuel : coffre = compté – caisse', () => {
  const c = caisse({ 50: 22, 500: 3 });
  const r = resultat(c, { 50: 21, 500: 5 });
  egal(r.garde[500], 3, 'jamais plus que compté'); egal(r.coffre[50], 1);
  vrai(r.limiteDepassee, 'avertissement limite 20');
});
test('Contrôle aléatoire contre la force brute (300 caisses)', () => {
  let graine = 42;
  const rnd = n => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % (n + 1); };
  for (let k = 0; k < 300; k++) {
    const c = quantitesVides();
    for (const v of PIECES) c[v] = rnd(28);
    for (const v of BILLETS) c[v] = rnd(5);
    const r = repartir(c); invariants(c, r);
    const t = totaux(c).total;
    if (t <= FOND_DE_CAISSE) continue;
    const fb = forceBrute(c);
    if (fb.fond === FOND_DE_CAISSE) {
      egal(r.fond, FOND_DE_CAISSE, `caisse ${k}`);
      if (!r.limiteDepassee) egal(totaux(r.garde).pieces, fb.vp, `pièces caisse ${k}`);
    } else {
      vrai(r.fond >= fb.fond, `caisse ${k} : fond ${r.fond} < ${fb.fond}`);
    }
  }
});

// ---------- Caisse théorique du soir ----------
test('Montants saisis au clavier', () => {
  egal(centimesSaisis('12,50'), 1250); egal(centimesSaisis('12.5'), 1250); egal(centimesSaisis('12'), 1200);
  egal(centimesSaisis(' 0,05 € '), 5); egal(centimesSaisis('1 234,56'), 123456);
  egal(centimesSaisis('abc'), null); egal(centimesSaisis('1,234'), null); egal(centimesSaisis(''), null); egal(centimesSaisis('-3'), null);
});
test('Caisse théorique = matin + ventes – remboursements ± mouvements', () => {
  const mv = [{ montant: -1200, motif: 'lait' }, { montant: 500, motif: 'appoint' }];
  egal(sommeMouvements(mv), -700);
  egal(caisseTheorique({ matin: 10000, ventes: 23450, remboursements: 300, mouvements: mv }), 10000 + 23450 - 300 - 700);
  egal(caisseTheorique({ matin: 10000, ventes: 0 }), 10000);
});
test('Écart de caisse du soir', () => {
  const th = caisseTheorique({ matin: 10001, ventes: 15060, mouvements: [] });
  egal(ecart(25061, th), 0); egal(ecart(24831, th), -230);
});

export function lancer() {
  const ko = resultats.filter(r => !r.ok);
  for (const r of resultats) log(`${r.ok ? '✔' : '✘'} ${r.nom}${r.ok ? '' : ' — ' + r.err}`);
  log(`\n${resultats.length - ko.length}/${resultats.length} tests réussis`);
  return { resultats, ko };
}
export const bilan = lancer();
