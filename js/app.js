/* Caisse Joséphine — application de comptage (iPad). */
import {
  FOND_DE_CAISSE, MAX_PIECES_PAR_VALEUR, PIECES, BILLETS, COUPURES, estPiece,
  quantitesVides, quantite, totaux, ecart, repartir, resultat, raisonsCoffre,
  euros, libelle, parisMaintenant, dateLongue, typeLibelle,
  centimesSaisis, sommeMouvements, caisseTheorique
} from './calc.js';
import { db, stockagePersistant } from './db.js';
import { synchroniser, demarrerSynchro, surChangement, etatEnvoi, appelScript } from './sync.js';
import { pdfComptage, pdfRecap, partagerFichier, prechargerLogo, nomFichier } from './pdf.js';
import { visuel } from './visuels.js';
import { CONFIG } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vue = $('#vue');
const modale = $('#modale');

const etat = {
  vue: 'accueil',
  brouillon: null,      // comptage en cours (sauvegardé automatiquement)
  comptages: [],        // historique (copie en mémoire)
  prenoms: [], dernierPrenom: '',
  selection: null,      // comptage affiché en détail / écran de fin
  filtreDate: '', filtreType: 'tous',
  checklist: {},
  enregistrement: false,
  majEnAttente: false,
};

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

async function demarrer() {
  stockagePersistant();
  prechargerLogo();
  [etat.comptages, etat.brouillon, etat.prenoms, etat.dernierPrenom] = await Promise.all([
    db.tous(), db.get('brouillon'), db.get('prenoms'), db.get('dernierPrenom')]);
  etat.prenoms = etat.prenoms || [];
  etat.dernierPrenom = etat.dernierPrenom || '';
  // Comptage en cours retrouvé après une fermeture accidentelle : on le rouvre.
  if (etat.brouillon && aDesDonnees(etat.brouillon)) etat.vue = etat.brouillon.etape || 'comptage';
  else etat.brouillon = null;
  rendre();
  surChangement(async () => { etat.comptages = await db.tous(); majEnvoi(); if (etat.vue === 'historique') rendreListe(); });
  demarrerSynchro();
  enregistrerServiceWorker();
}

function aDesDonnees(b) { return b && COUPURES.some(v => quantite(b.quantites[v]) > 0); }

function nouvelId() {
  const a = new Uint8Array(4); crypto.getRandomValues(a);
  return 'C' + Date.now().toString(36).toUpperCase() + '-' + [...a].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

let minuteur = null;
function sauverBrouillon(tout_de_suite = false) {
  clearTimeout(minuteur);
  const f = () => etat.brouillon ? db.set('brouillon', etat.brouillon) : db.del('brouillon');
  if (tout_de_suite) f(); else minuteur = setTimeout(f, 250);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) sauverBrouillon(true); });

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

function rendre() {
  const vues = { accueil: vueAccueil, comptage: vueComptage, repartition: vueRepartition, fin: vueFin, historique: vueHistorique, detail: vueDetail, reglages: vueReglages };
  vue.innerHTML = (vues[etat.vue] || vueAccueil)();
  vue.dataset.vue = etat.vue;
  majEnvoi();
  if (etat.vue === 'comptage') { majTotaux(); if (etat.brouillon.type === 'cloture') chargerVentes(); }
  if (etat.vue === 'historique') rendreListe();
}

function aller(v) {
  etat.vue = v; rendre(); window.scrollTo(0, 0);
  if (v === 'accueil' && etat.majEnAttente) appliquerMiseAJour();
}

function entete({ retour = null, titre = '', badge = '' } = {}) {
  const onglets = !retour;
  return `<header class="barre">
    ${retour ? `<button class="retour" data-act="${retour.act}" data-v="${retour.v || ''}">‹ ${esc(retour.texte)}</button>` :
      `<div class="marque"><img src="img/logo-small.png" alt="" width="30" height="32"><span>Caisse Joséphine</span></div>`}
    ${onglets ? `<nav class="onglets" role="tablist">
      <button data-act="onglet" data-v="accueil" class="${['accueil', 'fin'].includes(etat.vue) ? 'actif' : ''}">Comptage</button>
      <button data-act="onglet" data-v="historique" class="${['historique', 'reglages'].includes(etat.vue) ? 'actif' : ''}">Historique</button>
    </nav>` : `<div class="titre-barre">${badge}<span>${esc(titre)}</span></div>`}
    <div class="droite">
      <span class="envoi" id="envoi"></span>
      ${retour ? `<img class="logo-mini" src="img/logo-small.png" alt="" width="26" height="28">` : ''}
    </div>
  </header>`;
}

function badgeType(t) { return `<span class="badge ${t === 'ouverture' ? 'ouv' : 'clo'}">${typeLibelle(t)}</span>`; }

async function majEnvoi() {
  const el = $('#envoi'); if (!el) return;
  const e = await etatEnvoi();
  if (!CONFIG.SCRIPT_URL) { el.className = 'envoi'; el.textContent = ''; return; }
  if (e.attente === 0) { el.className = 'envoi ok'; el.textContent = 'Envoyé'; }
  else { el.className = 'envoi attente'; el.textContent = `${e.attente} en attente d'envoi`; }
}

/* ---------------- Accueil ---------------- */

function comptagesDuJour(date) { return etat.comptages.filter(c => c.date === date).sort((a, b) => a.heure.localeCompare(b.heure)); }

function vueAccueil() {
  const p = parisMaintenant();
  const reco = p.h < 13 ? 'ouverture' : 'cloture';
  const jour = comptagesDuJour(p.date);
  const ouv = jour.filter(c => c.type === 'ouverture').pop();
  const clo = jour.filter(c => c.type === 'cloture').pop();
  const b = etat.brouillon;
  const bouton = (t, titre, sous) => `<button class="choix ${t === reco ? 'reco' : ''}" data-act="choisir" data-v="${t}">
      <span class="choix-titre">${titre}</span><span class="choix-sous">${sous}</span></button>`;
  return entete() + `<main class="accueil">
    <p class="date-jour">${esc(dateLongue(p.date))}</p>
    ${b && aDesDonnees(b) ? `<div class="reprise"><div><b>Comptage en cours</b> · ${typeLibelle(b.type)} · ${euros(totaux(b.quantites).total)}</div>
      <button class="lien" data-act="reprendre">Reprendre ›</button></div>` : ''}
    <div class="choix-grille">
      ${bouton('ouverture', 'Ouverture – matin', 'Compter le fond de caisse (100,00 €)')}
      ${bouton('cloture', 'Clôture – soir', 'Compter la caisse et préparer l’enveloppe du coffre')}
    </div>
    <div class="jour-etat">
      <span class="${ouv ? 'fait' : ''}">${ouv ? `✓ Ouverture faite à ${ouv.heure.slice(0, 5)}` : 'Ouverture pas encore faite'}</span>
      <span class="${clo ? 'fait' : ''}">${clo ? `✓ Clôture faite à ${clo.heure.slice(0, 5)}` : 'Clôture pas encore faite'}</span>
    </div>
  </main>`;
}

/* ---------------- Comptage ---------------- */

function ligneComptage(v) {
  const q = quantite(etat.brouillon.quantites[v]);
  return `<div class="ligne" data-v="${v}">
    <div class="vis">${visuel(v)}</div>
    <div class="lib">${libelle(v)}</div>
    <div class="saisie">
      <button class="pm" data-act="moins" data-v="${v}" aria-label="Une de moins">−</button>
      <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" autocorrect="off"
        data-v="${v}" value="${q || ''}" placeholder="0" aria-label="Nombre de ${libelle(v)}">
      <button class="pm" data-act="plus" data-v="${v}" aria-label="Une de plus">+</button>
    </div>
    <div class="st" id="st-${v}">${euros(v * q)}</div>
  </div>`;
}

function vueComptage() {
  const b = etat.brouillon, ouv = b.type === 'ouverture';
  return entete({ retour: { act: 'onglet', v: 'accueil', texte: 'Accueil' }, titre: ouv ? 'Ouverture – matin' : 'Clôture – soir', badge: '' }) + `
  <div class="comptage-grille">
    <main class="comptage">
      <section class="groupe"><h2>Pièces</h2>${PIECES.map(ligneComptage).join('')}</section>
      <section class="groupe"><h2>Billets</h2>${BILLETS.map(ligneComptage).join('')}</section>
      <div class="raz-zone"><button class="secondaire" data-act="raz">Remettre à zéro</button></div>
    </main>
    <aside class="panneau">
      <div class="ligne-total detail-total"><span>Total des pièces</span><b id="t-p"></b></div>
      <div class="ligne-total detail-total"><span>Total des billets</span><b id="t-b"></b></div>
      <div class="ligne-total general"><span>Total général</span><b id="t-g"></b></div>
      ${ouv ? '<div class="controle" id="controle"></div>' : '<div class="controle" id="theorique"></div>'}
      <button class="principal valider" data-act="${ouv ? 'valider' : 'versRepartition'}">${ouv ? 'Valider et enregistrer' : 'Suivant : répartition ›'}</button>
    </aside>
  </div>`;
}

function majTotaux() {
  const b = etat.brouillon; if (!b) return;
  const t = totaux(b.quantites);
  $('#t-p').textContent = euros(t.pieces);
  $('#t-b').textContent = euros(t.billets);
  $('#t-g').textContent = euros(t.total);
  const th = $('#theorique');
  if (th) th.innerHTML = blocTheorique(b, t.total);
  const ctl = $('#controle');
  if (ctl) {
    const e = ecart(t.total);
    let statut;
    if (t.total === 0) statut = `<div class="statut neutre">Saisissez les quantités</div>`;
    else if (e === 0) statut = `<div class="statut vert">✓ Caisse juste</div>`;
    else statut = `<p class="msg-ecart">Recomptez une fois. Si l’écart persiste, enregistrez le vrai montant.</p>`;
    ctl.innerHTML = `<div class="ligne-total"><span>Attendu</span><b>${euros(FOND_DE_CAISSE)}</b></div>
      <div class="ligne-total"><span>Écart</span><b class="${t.total && e ? 'txt-ecart' : t.total ? 'txt-vert' : ''}">${t.total ? euros(e, { signe: true }) : '—'}</b></div>${statut}`;
  }
}

/* ---------------- Caisse théorique du soir ---------------- */

/** Caisse du matin : ouverture du jour sur cet iPad, sinon celle reçue par le Google Sheet, sinon 100,00 €. */
function caisseDuMatin(b) {
  const aujourdHui = parisMaintenant().date;
  const ouv = etat.comptages.filter(c => c.type === 'ouverture' && c.date === aujourdHui)
    .sort((a, x) => a.horodatage.localeCompare(x.horodatage)).pop();
  if (ouv) return { total: ouv.total, source: 'ipad', heure: ouv.heure };
  const o = b.square && b.square.ouverture;
  if (o && Number.isInteger(o.total)) return { total: o.total, source: 'sheet', heure: o.heure };
  return { total: FOND_DE_CAISSE, source: 'defaut', heure: '' };
}

/** Tous les éléments du calcul, pour l'affichage et l'enregistrement. */
function infoTheorique(b, total) {
  const matin = caisseDuMatin(b);
  const sq = b.square || {};
  const mouvements = b.mouvements || [];
  const connu = sq.etat === 'ok' || (sq.etat === 'chargement' && Number.isInteger(sq.ventes));
  const ventes = connu ? sq.ventes : null;
  const remb = connu ? (sq.remboursements || 0) : 0;
  const theorique = connu ? caisseTheorique({ matin: matin.total, ventes, remboursements: remb, mouvements }) : null;
  return { matin, ventes, remb, nb: sq.nb || 0, mouvements, theorique, ecart: theorique === null ? null : total - theorique, sq };
}

function blocTheorique(b, total) {
  const it = infoTheorique(b, total);
  const sq = it.sq;
  const matinTxt = it.matin.source === 'defaut' ? 'aucune ouverture aujourd’hui : 100,00 € par défaut'
    : `ouverture de ${it.matin.heure.slice(0, 5)}`;
  let ventesInfo;
  if (sq.etat === 'chargement') ventesInfo = 'Lecture des ventes dans Square…';
  else if (sq.etat === 'ok') ventesInfo = `${it.nb} vente(s) en espèces dans Square`;
  else if (sq.erreur === 'square-non-configure' || sq.erreur === 'non-configure') ventesInfo = 'Square n’est pas encore connecté.';
  else if (sq.erreur === 'cle' || sq.erreur === 'sans-cle') ventesInfo = 'Clé secrète absente ou refusée : Historique › Réglages et sauvegarde.';
  else if (sq.etat === 'erreur' && /^square/.test(sq.erreur || '')) ventesInfo = 'Square a refusé la demande (jeton à reconnecter dans le Google Sheet).';
  else if (sq.etat === 'erreur') ventesInfo = 'Pas de connexion : l’écart sera calculé par le Google Sheet.';
  else ventesInfo = '';
  const mvts = it.mouvements.map((m, i) => `<div class="ligne-total mvt-l"><span>${esc(m.motif || 'Mouvement exceptionnel')}</span>
    <b>${euros(m.montant, { signe: true })}<button class="x" data-act="supprimerMouvement" data-i="${i}" aria-label="Retirer ce mouvement">×</button></b></div>`).join('');
  let statut = '';
  if (it.ecart !== null && total > 0) {
    statut = it.ecart === 0 ? '<div class="statut vert">✓ Caisse juste</div>'
      : '<p class="msg-ecart">Recomptez une fois. Si l’écart persiste, enregistrez le vrai montant.</p>';
  }
  return `
    <div class="ligne-total"><span>Caisse du matin</span><b>${euros(it.matin.total)}</b></div>
    <small class="sous-ligne">${matinTxt}</small>
    <div class="ligne-total"><span>Ventes espèces</span><b>${it.ventes === null ? '—' : euros(it.ventes, { signe: true })}</b></div>
    <small class="sous-ligne">${ventesInfo} <button class="lien mini" data-act="actualiserVentes">Actualiser</button> · <button class="lien mini" data-act="ajouterMouvement">+ Mouvement exceptionnel</button></small>
    ${it.remb ? `<div class="ligne-total"><span>Remboursements</span><b>${euros(-it.remb, { signe: true })}</b></div>` : ''}
    ${mvts}
    <div class="ligne-total theo"><span>Caisse théorique</span><b>${it.theorique === null ? '—' : euros(it.theorique)}</b></div>
    <div class="ligne-total ecart-l"><span>Écart</span><b class="${it.ecart ? 'txt-ecart' : it.ecart === 0 && total ? 'txt-vert' : ''}">${it.ecart === null || !total ? '—' : euros(it.ecart, { signe: true })}</b></div>
    ${statut}`;
}

let chargementVentes = false;
async function chargerVentes(force = false) {
  const b = etat.brouillon;
  if (!b || b.type !== 'cloture' || chargementVentes) return;
  const sq = b.square;
  if (!force && sq && sq.etat === 'ok' && Date.now() - sq.t < 120000) return;
  chargementVentes = true;
  b.square = { ...(sq || {}), etat: 'chargement' };
  majTotaux();
  try {
    const cle = await db.get('cle');
    if (!cle) throw new Error('sans-cle');
    const r = await appelScript({ action: 'ventesEspeces', cle, date: parisMaintenant().date }, 20000);
    if (r && r.ok) b.square = { etat: 'ok', ventes: r.ventes, remboursements: r.remboursements || 0, nb: r.nb || 0, ouverture: r.ouverture || null, t: Date.now() };
    else b.square = { etat: 'erreur', erreur: (r && r.erreur) || 'inconnue', ouverture: (r && r.ouverture) || null, t: Date.now() };
  } catch (e) {
    b.square = { etat: 'erreur', erreur: ['non-configure', 'sans-cle'].includes(e.message) ? e.message : 'reseau', t: Date.now() };
  } finally { chargementVentes = false; }
  if (etat.brouillon === b) { sauverBrouillon(); majTotaux(); }
}

function ouvrirMouvement() {
  ouvrirModale(`<h2>Mouvement exceptionnel</h2>
    <p class="aide">Argent sorti ou entré dans la caisse en dehors des ventes Square. Les responsables seront prévenus par e-mail.</p>
    <div class="segment sens"><button data-act="mvtSens" data-v="-1" class="actif">Sortie d’argent</button><button data-act="mvtSens" data-v="1">Entrée d’argent</button></div>
    <label class="etiquette" for="mvt-montant">Montant</label>
    <input id="mvt-montant" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off">
    <label class="etiquette" for="mvt-motif">Commentaire</label>
    <input id="mvt-motif" type="text" maxlength="80" placeholder="Ex. : remboursement en espèces d’un client payé par CB" autocomplete="off">
    <p class="txt-orange" id="mvt-erreur" hidden></p>
    <div class="boutons"><button class="secondaire" data-act="fermerModale">Annuler</button>
    <button class="principal" data-act="validerMouvement">Ajouter</button></div>`);
  modale.dataset.sens = '-1';
  setTimeout(() => { const i = $('#mvt-montant'); if (i) i.focus(); }, 50);
}

function changerQuantite(v, n, depuisChamp = false) {
  const b = etat.brouillon;
  b.quantites[v] = Math.max(0, Math.min(99999, quantite(n)));
  if (!depuisChamp) { const i = $(`input[data-v="${v}"]`); if (i) i.value = b.quantites[v] || ''; }
  const st = $(`#st-${v}`); if (st) st.textContent = euros(v * b.quantites[v]);
  majTotaux();
  sauverBrouillon();
}

vue.addEventListener('input', e => {
  const i = e.target;
  if (i.matches('.ligne input')) {
    const propre = i.value.replace(/\D/g, '').slice(0, 5);
    if (propre !== i.value) i.value = propre;
    changerQuantite(Number(i.dataset.v), propre, true);
  }
});
vue.addEventListener('focusin', e => { if (e.target.matches('.ligne input')) setTimeout(() => e.target.select(), 0); });
vue.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.ligne input')) {
    e.preventDefault();
    const champs = $$('.ligne input');
    const k = champs.indexOf(e.target);
    if (k >= 0 && k < champs.length - 1) champs[k + 1].focus(); else e.target.blur();
  }
});

/* ---------------- Répartition caisse / coffre ---------------- */

function calculRepartition() {
  const b = etat.brouillon;
  const signature = JSON.stringify(b.quantites);
  const auto = repartir(b.quantites);
  if (!b.garde || b.gardePour !== signature) { b.garde = auto.garde; b.gardeAuto = true; b.gardePour = signature; }
  const r = resultat(b.quantites, b.garde);
  return { auto, r };
}

function vueRepartition() {
  const b = etat.brouillon;
  const { auto, r } = calculRepartition();
  const t = totaux(b.quantites);
  const raisons = raisonsCoffre(b.quantites, r.garde);
  const exact = r.fond === FOND_DE_CAISSE;
  const msgs = [];
  if (t.total < FOND_DE_CAISSE) msgs.push(`<div class="message orange"><b>Fond de caisse incomplet.</b> La caisse ne contient que ${euros(t.total)} : tout reste dans la caisse, l’enveloppe est à 0,00 €.</div>`);
  else if (b.gardeAuto && auto.statut === 'impossible') msgs.push(`<div class="message orange"><b>Impossible de faire exactement 100,00 €</b> avec les pièces et billets disponibles. Proposition la plus proche : ${euros(r.fond)}. Vous pouvez ajuster à la main.</div>`);
  else if (!exact) msgs.push(`<div class="message orange">Le fond de caisse fait ${euros(r.fond)} au lieu de ${euros(FOND_DE_CAISSE)}.</div>`);
  if (r.limiteDepassee) msgs.push(`<div class="message jaune">Attention : plus de ${MAX_PIECES_PAR_VALEUR} pièces d’une même valeur restent dans la caisse.</div>`);

  const lignes = COUPURES.filter(v => quantite(b.quantites[v]) > 0).map(v => {
    const n = quantite(b.quantites[v]), k = r.garde[v], c = r.coffre[v];
    const rs = estPiece(v) ? raisons[v] : null;
    const tags = [];
    if (rs && rs.limite) tags.push(`limite ${MAX_PIECES_PAR_VALEUR}`);
    if (rs && rs.appoint) tags.push('pour tomber juste');
    const depasse = estPiece(v) && k > MAX_PIECES_PAR_VALEUR;
    return `<tr class="${c ? 'au-coffre' : ''} ${depasse ? 'depasse' : ''}">
      <td class="val"><span class="vis-mini">${visuel(v)}</span>${libelle(v)}</td>
      <td class="num">${n}</td>
      <td class="coffre"><div class="saisie petite">
        <button class="pm" data-act="gPlus" data-v="${v}" ${c <= 0 ? 'disabled' : ''} aria-label="Une de moins au coffre">−</button>
        <b class="${c ? 'txt-rouge' : ''}">${c}</b>
        <button class="pm" data-act="gMoins" data-v="${v}" ${k <= 0 ? 'disabled' : ''} aria-label="Une de plus au coffre">+</button></div></td>
      <td class="caisse"><div class="saisie petite">
        <button class="pm" data-act="gMoins" data-v="${v}" ${k <= 0 ? 'disabled' : ''} aria-label="Une de moins en caisse">−</button>
        <b>${k}</b>
        <button class="pm" data-act="gPlus" data-v="${v}" ${k >= n ? 'disabled' : ''} aria-label="Une de plus en caisse">+</button></div>
        ${depasse ? `<small class="txt-orange">plus de ${MAX_PIECES_PAR_VALEUR}</small>` : ''}</td>
    </tr>`;
  }).join('');

  return entete({ retour: { act: 'versComptage', texte: 'Comptage' }, titre: 'Répartition caisse / coffre' }) + `
  <div class="comptage-grille repart-grille">
    <main class="repartition">
      ${msgs.join('')}
      <table class="table-repart">
        <thead><tr><th>Valeur</th><th class="num">Compté</th><th>Va au coffre</th><th>Reste en caisse</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="4" class="vide">Aucune pièce ni aucun billet compté.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${euros(t.total)}</td><td><b>${euros(r.enveloppe)}</b></td><td><b>${euros(r.fond)}</b></td></tr></tfoot>
      </table>
    </main>
    <aside class="panneau">
      <div class="ligne-total fond-ligne"><span>Fond de caisse</span><b class="${exact ? 'txt-vert' : 'txt-orange'}">${euros(r.fond)}</b></div>
      <div class="ligne-total"><span></span><small class="txt-gris">attendu ${euros(FOND_DE_CAISSE)}</small></div>
      <div class="ligne-total general"><span>Enveloppe coffre</span><b class="txt-rouge">${euros(r.enveloppe)}</b></div>
      ${(() => { const it = infoTheorique(b, t.total); return `<div class="ligne-total ecart-ligne"><span>Écart de caisse</span><b class="${it.ecart ? 'txt-ecart' : it.ecart === 0 ? 'txt-vert' : ''}">${it.ecart === null ? 'non calculé' : it.ecart ? euros(it.ecart, { signe: true }) : 'juste'}</b></div>`; })()}
      ${b.gardeAuto ? '' : '<button class="lien" data-act="recalculer">Revenir au calcul automatique</button>'}
      <button class="principal valider" data-act="valider">Valider et enregistrer</button>
      <button class="secondaire" data-act="versComptage">‹ Modifier le comptage</button>
    </aside>
  </div>`;
}

function ajusterGarde(v, delta) {
  const b = etat.brouillon;
  const n = quantite(b.quantites[v]);
  b.garde = { ...b.garde, [v]: Math.max(0, Math.min(n, quantite(b.garde[v]) + delta)) };
  b.gardeAuto = false;
  sauverBrouillon();
  const y = window.scrollY; rendre(); window.scrollTo(0, y);
}

/* ---------------- Validation ---------------- */

function ouvrirModale(html) {
  modale.innerHTML = `<div class="voile" data-act="voile"></div><div class="carte-modale" role="dialog" aria-modal="true">${html}</div>`;
  modale.hidden = false;
  document.body.classList.add('modale-ouverte');
}
function fermerModale() { modale.hidden = true; modale.innerHTML = ''; document.body.classList.remove('modale-ouverte'); }

/** Petite boîte de confirmation. Renvoie une promesse (true / false). */
function demander({ titre, texte = '', ok = 'Confirmer', annuler = 'Annuler', danger = false }) {
  return new Promise(resolve => {
    ouvrirModale(`<h2>${esc(titre)}</h2>${texte ? `<p>${texte}</p>` : ''}
      <div class="boutons"><button class="secondaire" data-r="0">${esc(annuler)}</button>
      <button class="${danger ? 'danger' : 'principal'}" data-r="1">${esc(ok)}</button></div>`);
    const f = e => {
      const btn = e.target.closest('[data-r], [data-act="voile"]');
      if (!btn) return;
      modale.removeEventListener('click', f);
      fermerModale(); resolve(btn.dataset.r === '1');
    };
    modale.addEventListener('click', f);
  });
}

/**
 * Suppression réservée aux responsables : demande le code d'accès « Suivi caisse »
 * (onglet Réglages du Google Sheet), vérifié par le script Google. Renvoie true si le code est bon.
 */
function demanderCodeResponsable(titre, texte) {
  return new Promise(resolve => {
    ouvrirModale(`<h2>${esc(titre)}</h2><p>${texte}</p>
      <label class="etiquette" for="code-resp">Code responsable</label>
      <input id="code-resp" class="code-chiffres" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="••••">
      <p class="txt-orange" id="code-erreur" hidden></p>
      <div class="boutons"><button class="secondaire" data-r="0">Annuler</button>
      <button class="danger" data-r="1" id="code-ok">Valider</button></div>`);
    setTimeout(() => { const i = $('#code-resp'); if (i) i.focus(); }, 50);
    const f = async e => {
      const btn = e.target.closest('[data-r], [data-act="voile"]');
      if (!btn) return;
      if (btn.dataset.r !== '1') { modale.removeEventListener('click', f); fermerModale(); resolve(false); return; }
      const code = ($('#code-resp').value || '').replace(/\D/g, '');
      const err = $('#code-erreur');
      if (!code) return;
      btn.disabled = true; btn.textContent = 'Vérification…';
      try {
        const cle = await db.get('cle');
        const r = await appelScript({ action: 'verifierResponsable', cle, code }, 20000);
        if (r && r.ok) { modale.removeEventListener('click', f); fermerModale(); resolve(true); return; }
        err.textContent = r && r.erreur === 'bloque' ? 'Trop d’essais : réessayez dans 15 minutes.' : 'Code incorrect.';
      } catch (x) {
        err.textContent = 'Connexion nécessaire pour vérifier le code. Réessayez avec du wifi.';
      }
      err.hidden = false; btn.disabled = false; btn.textContent = 'Valider';
    };
    modale.addEventListener('click', f);
  });
}

function ouvrirValidation() {
  const b = etat.brouillon;
  const t = totaux(b.quantites);
  const ouv = b.type === 'ouverture';
  let resumeTxt, alerte = false, confirmFond = '';
  if (ouv) {
    const e = ecart(t.total);
    alerte = e !== 0;
    resumeTxt = `<div class="ligne-total"><span>Total compté</span><b>${euros(t.total)}</b></div>
      <div class="ligne-total"><span>Écart</span><b class="${e ? 'txt-ecart' : 'txt-vert'}">${e ? euros(e, { signe: true }) : 'Caisse juste'}</b></div>`;
  } else {
    const { r } = calculRepartition();
    const it = infoTheorique(b, t.total);
    alerte = r.fond !== FOND_DE_CAISSE || !!it.ecart;
    resumeTxt = `<div class="ligne-total"><span>Total compté</span><b>${euros(t.total)}</b></div>
      <div class="ligne-total"><span>Caisse théorique</span><b>${it.theorique === null ? 'non calculée' : euros(it.theorique)}</b></div>
      <div class="ligne-total"><span>Écart de caisse</span><b class="${it.ecart ? 'txt-ecart' : it.ecart === 0 ? 'txt-vert' : ''}">${it.ecart === null ? '—' : it.ecart ? euros(it.ecart, { signe: true }) : 'Caisse juste'}</b></div>
      <div class="ligne-total"><span>Fond de caisse</span><b class="${r.fond !== FOND_DE_CAISSE ? 'txt-orange' : 'txt-vert'}">${euros(r.fond)}</b></div>
      <div class="ligne-total"><span>Enveloppe coffre</span><b class="txt-rouge">${euros(r.enveloppe)}</b></div>`;
    if (r.fond !== FOND_DE_CAISSE) confirmFond = `<label class="confirmer"><input type="checkbox" id="conf-fond">
      <span>Je confirme enregistrer avec un fond de caisse de <b>${euros(r.fond)}</b> au lieu de ${euros(FOND_DE_CAISSE)}.</span></label>`;
  }
  const choisi = etat.dernierPrenom;
  ouvrirModale(`<h2>Valider et enregistrer</h2>
    <div class="recap-modale">${badgeType(b.type)}<div class="recap-lignes">${resumeTxt}</div></div>
    <label class="etiquette">Qui a compté ?</label>
    <div class="prenoms" id="prenoms">
      ${etat.prenoms.map(p => `<button class="puce ${p === choisi ? 'choisie' : ''}" data-act="prenom" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
    </div>
    <input id="prenom-nouveau" type="text" placeholder="${etat.prenoms.length ? 'Autre prénom' : 'Votre prénom'}" autocomplete="off" autocapitalize="words" maxlength="40">
    <label class="etiquette ${alerte ? 'important' : ''}" for="observation">Observation</label>
    <textarea id="observation" rows="${alerte ? 3 : 2}" maxlength="1000" class="${alerte ? 'important' : ''}" placeholder="${alerte ? 'Ex. : recompté deux fois, il manque…' : ''}"></textarea>
    ${confirmFond}
    <div class="boutons"><button class="secondaire" data-act="fermerModale">Annuler</button>
    <button class="principal" data-act="enregistrer" id="btn-enregistrer">Enregistrer</button></div>`);
  modale.dataset.prenom = choisi || '';
}

modale.addEventListener('input', e => {
  if (e.target.id === 'prenom-nouveau') {
    $$('#prenoms .puce').forEach(p => p.classList.remove('choisie'));
    modale.dataset.prenom = e.target.value.trim();
  }
});

async function enregistrer() {
  if (etat.enregistrement) return;            // double appui : ignoré
  const b = etat.brouillon; if (!b) return;
  const conf = $('#conf-fond');
  if (conf && !conf.checked) { conf.closest('label').classList.add('secoue'); setTimeout(() => conf.closest('label').classList.remove('secoue'), 600); return; }
  etat.enregistrement = true;
  const btn = $('#btn-enregistrer'); if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  try {
    const prenom = (modale.dataset.prenom || '').trim().replace(/\s+/g, ' ');
    const observation = ($('#observation')?.value || '').trim();
    const maintenant = new Date();
    const p = parisMaintenant(maintenant);
    const q = {}; for (const v of COUPURES) q[v] = quantite(b.quantites[v]);
    const t = totaux(q);
    const c = {
      id: b.id, type: b.type, horodatage: maintenant.toISOString(), date: p.date, heure: p.heure,
      quantites: q, totalPieces: t.pieces, totalBillets: t.billets, total: t.total,
      attendu: FOND_DE_CAISSE, prenom, observation, version: CONFIG.VERSION, sync: 'attente',
    };
    if (b.type === 'ouverture') {
      c.ecart = ecart(t.total);
    } else {
      const r = resultat(q, b.garde || repartir(q).garde);
      Object.assign(c, { garde: r.garde, coffre: r.coffre, fond: r.fond, enveloppe: r.enveloppe, fondExact: r.fond === FOND_DE_CAISSE });
      const it = infoTheorique(b, t.total);
      Object.assign(c, {
        matin: it.matin.total, matinSource: it.matin.source,
        ventesEspeces: it.ventes, remboursementsEspeces: it.remb, nbVentesEspeces: it.nb,
        mouvements: it.mouvements.map(m => ({ montant: m.montant, motif: m.motif })),
        theorique: it.theorique, ecartTheorique: it.ecart,
      });
    }
    Object.freeze(c);
    const nouveau = await db.ajouter({ ...c });
    const enregistre = nouveau ? c : await db.lire(c.id);
    if (prenom) {
      etat.prenoms = [prenom, ...etat.prenoms.filter(x => x.toLowerCase() !== prenom.toLowerCase())].slice(0, 12);
      etat.dernierPrenom = prenom;
      await db.set('prenoms', etat.prenoms); await db.set('dernierPrenom', prenom);
    }
    etat.brouillon = null; clearTimeout(minuteur); await db.del('brouillon');
    etat.comptages = await db.tous();
    etat.selection = enregistre;
    fermerModale();
    aller('fin');
    synchroniser();
  } finally { etat.enregistrement = false; }
}

/* ---------------- Fin de comptage ---------------- */

function detailEnveloppe(c) {
  const lignes = COUPURES.slice().reverse().filter(v => c.coffre[v] > 0)
    .map(v => `<li><span>${c.coffre[v]} × ${libelle(v)}</span><b>${euros(v * c.coffre[v])}</b></li>`);
  return lignes.length ? `<ul class="detail-env">${lignes.join('')}</ul>` : '<p class="aide">L’enveloppe est vide.</p>';
}

function vueFin() {
  const c = etat.selection;
  if (!c) return vueAccueil();
  if (c.type === 'ouverture') {
    const juste = c.ecart === 0;
    return entete() + `<main class="fin">
      <div class="coche">✓</div>
      <h1>Comptage d’ouverture enregistré</h1>
      <p class="sous">${esc(dateLongue(c.date))} à ${c.heure.slice(0, 5)}${c.prenom ? ` · ${esc(c.prenom)}` : ''}</p>
      <div class="statut grand ${juste ? 'vert' : 'rouge'}">${juste ? 'Caisse juste : 100,00 €' : `Compté ${euros(c.total)} · écart ${euros(c.ecart, { signe: true })}`}</div>
      <div class="boutons-fin">
      <button class="principal" data-act="terminer">Terminer</button></div>
    </main>`;
  }
  const ch = etat.checklist[c.id] || {};
  const toutCoche = ['fond', 'coffre'].every(k => ch[k]);
  const aTheo = typeof c.theorique === 'number';
  const item = (k, txt) => `<label class="case"><input type="checkbox" data-act="cocher" data-k="${k}" ${ch[k] ? 'checked' : ''}><span>${txt}</span></label>`;
  return entete() + `<main class="fin cloture">
    <h1>Clôture enregistrée</h1>
    <p class="sous">${esc(dateLongue(c.date))} à ${c.heure.slice(0, 5)}${c.prenom ? ` · ${esc(c.prenom)}` : ''}</p>
    ${c.fondExact ? '' : `<div class="message orange">Fond de caisse laissé : ${euros(c.fond)} au lieu de ${euros(FOND_DE_CAISSE)}.</div>`}
    <div class="fin-grille">
      <section class="bloc square ${!aTheo ? '' : c.ecartTheorique ? 'ecart-rouge' : 'ecart-vert'}"><span>Écart de caisse</span>
        <b>${!aTheo ? 'non calculé' : c.ecartTheorique ? euros(c.ecartTheorique, { signe: true }) : 'Caisse juste'}</b>
        <small>${aTheo ? `Caisse théorique ${euros(c.theorique)} · comptée ${euros(c.total)}` : 'Ventes Square indisponibles : le Google Sheet fera le calcul.'}</small></section>
      <section class="bloc env">
        <span class="etiq">À écrire sur l’enveloppe</span>
        <div class="env-date">${esc(dateLongue(c.date))}</div>
        <div class="env-montant">${euros(c.enveloppe)}</div>
      </section>
    </div>
    <div class="fin-grille">
      <section class="bloc"><h2>Dans l’enveloppe</h2>${detailEnveloppe(c)}</section>
      <section class="bloc"><h2>Avant de partir</h2>
        ${item('fond', `${euros(c.fond)} laissés dans la caisse`)}
        ${item('coffre', 'Enveloppe datée, montant noté, rangée dans le coffre')}
      </section>
    </div>
    <div class="boutons-fin">
    <button class="principal" data-act="terminer" id="btn-terminer" ${toutCoche ? '' : 'disabled'}>Terminer</button></div>
    <p class="aide centre" id="aide-terminer" ${toutCoche ? 'hidden' : ''}>Cochez les 2 cases pour terminer.</p>
  </main>`;
}

/* ---------------- Historique ---------------- */

function vueHistorique() {
  const f = etat.filtreType;
  const seg = (v, t) => `<button data-act="filtreType" data-v="${v}" class="${f === v ? 'actif' : ''}">${t}</button>`;
  return entete() + `<main class="historique">
    <div class="filtres">
      <label class="champ-date"><span>Date</span><input type="date" id="f-date" value="${etat.filtreDate}">
        ${etat.filtreDate ? '<button class="lien" data-act="effacerDate">Effacer</button>' : ''}</label>
      <div class="segment">${seg('tous', 'Tous')}${seg('ouverture', 'Ouvertures')}${seg('cloture', 'Clôtures')}</div>
      <button class="secondaire" data-act="recap">Récapitulatif PDF</button>
    </div>
    <div id="liste"></div>
    <div class="pied-historique"><button class="lien" data-act="onglet" data-v="reglages">Réglages et sauvegarde</button>
      <span class="version">Version ${CONFIG.VERSION}</span></div>
  </main>`;
}

function infoEcart(c) {
  if (c.type === 'ouverture') return c.ecart ? `<span class="txt-ecart">Écart ${euros(c.ecart, { signe: true })}</span>` : '';
  const parts = [];
  if (typeof c.ecartTheorique === 'number') parts.push(c.ecartTheorique ? `<span class="txt-ecart">Écart ${euros(c.ecartTheorique, { signe: true })}</span>` : '<span class="txt-vert">Caisse juste</span>');
  if (c.fond !== FOND_DE_CAISSE) parts.push(`<span class="txt-orange">Fond ${euros(c.fond)}</span>`);
  return parts.join('');
}

function rendreListe() {
  const el = $('#liste'); if (!el) return;
  let l = etat.comptages.slice();
  if (etat.filtreDate) l = l.filter(c => c.date === etat.filtreDate);
  if (etat.filtreType !== 'tous') l = l.filter(c => c.type === etat.filtreType);
  if (!l.length) { el.innerHTML = `<p class="vide">${etat.comptages.length ? 'Aucun comptage ne correspond.' : 'Aucun comptage enregistré pour le moment.'}</p>`; return; }
  const jours = new Map();
  for (const c of l.sort((a, b) => b.horodatage.localeCompare(a.horodatage))) {
    if (!jours.has(c.date)) jours.set(c.date, []);
    jours.get(c.date).push(c);
  }
  el.innerHTML = [...jours].map(([d, cs]) => `<section class="jour"><h3>${esc(dateLongue(d))}</h3><div class="cartes">
    ${cs.sort((a, b) => a.horodatage.localeCompare(b.horodatage)).map(c => `<button class="carte-c" data-act="detail" data-id="${c.id}">
      <div class="haut">${badgeType(c.type)}<span class="heure">${c.heure.slice(0, 5)}</span>
        <span class="sync ${c.sync === 'envoye' ? 'ok' : 'att'}">${c.sync === 'envoye' ? 'envoyé' : 'en attente d’envoi'}</span></div>
      <div class="montant">${euros(c.total)}</div>
      <div class="infos">${c.type === 'cloture' ? `<span>Coffre <b>${euros(c.enveloppe)}</b></span>` : (c.ecart === 0 ? '<span class="txt-vert">Caisse juste</span>' : '')}
        ${infoEcart(c)}${c.prenom ? `<span>${esc(c.prenom)}</span>` : ''}</div>
    </button>`).join('')}</div></section>`).join('');
}

vue.addEventListener('change', e => {
  if (e.target.id === 'f-date') { etat.filtreDate = e.target.value; rendre(); }
});

/* ---------------- Détail ---------------- */

function tableauDetail(c) {
  const clo = c.type === 'cloture';
  const lignes = COUPURES.map(v => {
    const n = c.quantites[v] || 0;
    return `<tr class="${n ? '' : 'nul'}"><td class="val"><span class="vis-mini">${visuel(v)}</span>${libelle(v)}</td><td class="num">${n}</td><td class="num">${euros(v * n)}</td>
      ${clo ? `<td class="num">${c.garde[v]}</td><td class="num ${c.coffre[v] ? 'txt-rouge' : ''}">${c.coffre[v]}</td>` : ''}</tr>`;
  }).join('');
  return `<table class="table-detail">
    <thead><tr><th>Valeur</th><th class="num">Quantité</th><th class="num">Sous-total</th>${clo ? '<th class="num">Reste en caisse</th><th class="num">Coffre</th>' : ''}</tr></thead>
    <tbody>${lignes}</tbody>
    <tfoot>
      <tr><td>Total des pièces</td><td></td><td class="num">${euros(c.totalPieces)}</td>${clo ? '<td></td><td></td>' : ''}</tr>
      <tr><td>Total des billets</td><td></td><td class="num">${euros(c.totalBillets)}</td>${clo ? '<td></td><td></td>' : ''}</tr>
      <tr class="fort"><td>Total général</td><td></td><td class="num">${euros(c.total)}</td>${clo ? `<td class="num">${euros(c.fond)}</td><td class="num">${euros(c.enveloppe)}</td>` : ''}</tr>
    </tfoot></table>`;
}

/** Détail d'une clôture : calcul de la caisse théorique. */
function blocControleDetail(c) {
  if (typeof c.theorique !== 'number') return '<p class="aide">Caisse théorique non calculée pour ce comptage (ventes Square indisponibles au moment de la clôture).</p>';
  const mv = (c.mouvements || []).map(m => `<div class="ligne-total sous"><span>${esc(m.motif || 'sans motif')}</span><b>${euros(m.montant, { signe: true })}</b></div>`).join('');
  return `<div class="controle-detail">
    <div class="ligne-total"><span>Caisse du matin</span><b>${euros(c.matin)}</b></div>
    <div class="ligne-total"><span>Ventes en espèces (Square)</span><b>${euros(c.ventesEspeces, { signe: true })}</b></div>
    ${c.remboursementsEspeces ? `<div class="ligne-total"><span>Remboursements en espèces</span><b>${euros(-c.remboursementsEspeces, { signe: true })}</b></div>` : ''}
    <div class="ligne-total"><span>Mouvements exceptionnels</span><b>${euros(sommeMouvements(c.mouvements), { signe: true })}</b></div>${mv}
    <div class="ligne-total fort"><span>Caisse théorique</span><b>${euros(c.theorique)}</b></div>
    <div class="ligne-total"><span>Caisse comptée</span><b>${euros(c.total)}</b></div>
    <div class="ligne-total fort"><span>Écart de caisse</span><b class="${c.ecartTheorique ? 'txt-ecart' : 'txt-vert'}">${c.ecartTheorique ? euros(c.ecartTheorique, { signe: true }) : 'Caisse juste'}</b></div>
  </div>`;
}

function vueDetail() {
  const c = etat.selection;
  if (!c) return vueHistorique();
  const ouv = c.type === 'ouverture';
  return entete({ retour: { act: 'onglet', v: 'historique', texte: 'Historique' }, titre: `${typeLibelle(c.type)} du ${dateLongue(c.date, { jour: false })}` }) + `
  <main class="detail">
    <div class="infos-detail">
      <div><span>Type</span>${badgeType(c.type)}</div>
      <div><span>Date</span><b>${esc(dateLongue(c.date))}</b></div>
      <div><span>Heure</span><b>${c.heure}</b></div>
      <div><span>Compté par</span><b>${esc(c.prenom || '—')}</b></div>
      <div><span>Google Sheet</span><b class="${c.sync === 'envoye' ? 'txt-vert' : 'txt-gris'}">${c.sync === 'envoye' ? 'Envoyé' : 'En attente d’envoi'}</b></div>
    </div>
    ${ouv ? `<div class="trio grand-trio"><div><span>Attendu</span><b>${euros(c.attendu)}</b></div><div><span>Compté</span><b>${euros(c.total)}</b></div>
      <div><span>Écart</span><b class="${c.ecart ? 'txt-ecart' : 'txt-vert'}">${c.ecart ? euros(c.ecart, { signe: true }) : '0,00 € · juste'}</b></div></div>`
      : `<div class="trio grand-trio"><div><span>Total compté</span><b>${euros(c.total)}</b></div><div><span>Fond laissé</span><b class="${c.fondExact ? 'txt-vert' : 'txt-orange'}">${euros(c.fond)}</b></div>
      <div><span>Enveloppe coffre</span><b class="txt-rouge">${euros(c.enveloppe)}</b></div></div>
      ${blocControleDetail(c)}`}
    ${tableauDetail(c)}
    <div class="observation"><span>Observation</span><p>${c.observation ? esc(c.observation) : '<i>Aucune</i>'}</p></div>
    <p class="aide">Comptage enregistré : il ne peut plus être modifié. Identifiant ${esc(c.id)}.</p>
    <div class="boutons-fin"><button class="danger-lien" data-act="supprimer" data-id="${c.id}">Supprimer de l’iPad</button>
      <button class="principal" data-act="pdf" data-id="${c.id}">Exporter en PDF</button></div>
  </main>`;
}

/* ---------------- Réglages et sauvegarde ---------------- */

function vueReglages() {
  return entete({ retour: { act: 'onglet', v: 'historique', texte: 'Historique' }, titre: 'Réglages et sauvegarde' }) + `
  <main class="reglages">
    <section class="bloc">
      <h2>Envoi vers le Google Sheet</h2>
      ${CONFIG.SCRIPT_URL ? '' : '<p class="message orange">L’adresse du script Google n’est pas encore renseignée dans le fichier <code>js/config.js</code> (voir le guide, étape 2).</p>'}
      <label class="etiquette" for="cle">Clé secrète (onglet « Réglages » du Google Sheet)</label>
      <div class="rang"><input id="cle" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX">
      <button class="principal" data-act="sauverCle">Enregistrer</button></div>
      <p id="etat-envoi" class="aide"></p>
      <div class="rang"><button class="secondaire" data-act="tester">Tester la connexion</button>
      <button class="secondaire" data-act="envoyer">Envoyer maintenant</button></div>
    </section>
    <section class="bloc">
      <h2>Sauvegarde de l’historique</h2>
      <p class="aide">À faire de temps en temps, et avant de changer d’iPad. Le Google Sheet garde aussi une copie de tous les comptages.</p>
      <div class="rang"><button class="principal" data-act="sauvegarder">Exporter une sauvegarde</button>
      <label class="secondaire bouton-fichier">Restaurer une sauvegarde<input type="file" id="restaurer" accept=".json,application/json"></label></div>
      <p id="etat-stockage" class="aide"></p>
    </section>
    <section class="bloc">
      <h2>Prénoms enregistrés</h2>
      <div class="prenoms">${etat.prenoms.length ? etat.prenoms.map(p => `<span class="puce">${esc(p)} <button class="x" data-act="oublierPrenom" data-p="${esc(p)}" aria-label="Retirer ${esc(p)}">×</button></span>`).join('') : '<p class="aide">Aucun pour le moment.</p>'}</div>
    </section>
    <section class="bloc">
      <h2>Réservé aux responsables</h2>
      <p class="aide">Efface tous les comptages de cet iPad (par exemple après des essais). Demande le code responsable (onglet Réglages du Google Sheet). Le Google Sheet n’est pas modifié.</p>
      <button class="danger" data-act="effacerTout">Effacer tout l’historique de l’iPad</button>
    </section>
    <p class="aide centre">Caisse Joséphine · version ${CONFIG.VERSION} · données enregistrées sur cet iPad et copiées uniquement dans le Google Sheet du café.</p>
  </main>`;
}

async function majReglages() {
  const cle = await db.get('cle');
  const i = $('#cle'); if (i && cle) i.value = cle;
  const e = await etatEnvoi();
  const msg = { 'non-configure': 'Envoi non configuré.', reseau: 'Pas de connexion pour le moment : nouvel essai automatique.', cle: 'La clé secrète a été refusée par le Google Sheet : vérifiez-la.' };
  const el = $('#etat-envoi');
  if (el) el.innerHTML = `${e.attente ? `<b>${e.attente}</b> comptage(s) en attente d’envoi.` : 'Tous les comptages sont envoyés.'}
    ${e.erreur && msg[e.erreur] ? ` ${msg[e.erreur]}` : ''}${e.dernier ? ` Dernier envoi : ${new Date(e.dernier).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.` : ''}`;
  const st = $('#etat-stockage');
  if (st && navigator.storage && navigator.storage.persisted) {
    const p = await navigator.storage.persisted().catch(() => false);
    st.textContent = `${etat.comptages.length} comptage(s) sur cet iPad. ${p ? 'Stockage protégé (persistant).' : ''}`;
  }
}

$('#vue').addEventListener('change', async e => {
  if (e.target.id !== 'restaurer' || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (data.app !== 'caisse-josephine' || !Array.isArray(data.comptages)) throw new Error('format');
    let ajoutes = 0, presents = 0;
    for (const c of data.comptages) {
      if (!c || !c.id || !c.type || !c.quantites || !c.date) continue;
      if (await db.ajouter(c)) ajoutes++; else presents++;
    }
    if (Array.isArray(data.prenoms)) {
      etat.prenoms = [...new Set([...etat.prenoms, ...data.prenoms.filter(p => typeof p === 'string')])].slice(0, 12);
      await db.set('prenoms', etat.prenoms);
    }
    etat.comptages = await db.tous();
    await demander({ titre: 'Sauvegarde restaurée', texte: `${ajoutes} comptage(s) ajouté(s), ${presents} déjà présent(s).`, ok: 'OK', annuler: 'Fermer' });
    rendre(); majReglages(); synchroniser();
  } catch (err) {
    await demander({ titre: 'Fichier non reconnu', texte: 'Choisissez un fichier de sauvegarde « Josephine-sauvegarde-….json ».', ok: 'OK', annuler: 'Fermer' });
  }
  e.target.value = '';
});

/* ------------------------------------------------------------------ */
/* Actions (appuis sur les boutons)                                    */
/* ------------------------------------------------------------------ */

async function choisirType(type) {
  const b = etat.brouillon;
  if (b && aDesDonnees(b) && b.type === type) { etat.vue = b.etape || 'comptage'; rendre(); return; }
  if (b && aDesDonnees(b)) {
    const ok = await demander({ titre: 'Un comptage est en cours', texte: `Le comptage de ${typeLibelle(b.type).toLowerCase()} en cours (${euros(totaux(b.quantites).total)}) sera abandonné.`, ok: 'Abandonner et recommencer', danger: true });
    if (!ok) return;
  }
  etat.brouillon = { id: nouvelId(), type, quantites: quantitesVides(), garde: null, gardeAuto: true, gardePour: '', etape: 'comptage', debut: new Date().toISOString() };
  sauverBrouillon(true);
  aller('comptage');
}

const actions = {
  onglet: b => { if (['comptage', 'repartition'].includes(etat.vue)) sauverBrouillon(true); aller(b.dataset.v); if (b.dataset.v === 'reglages') majReglages(); },
  choisir: b => choisirType(b.dataset.v),
  reprendre: () => aller(etat.brouillon.etape || 'comptage'),
  plus: b => { const v = Number(b.dataset.v); changerQuantite(v, quantite(etat.brouillon.quantites[v]) + 1); },
  moins: b => { const v = Number(b.dataset.v); changerQuantite(v, quantite(etat.brouillon.quantites[v]) - 1); },
  raz: async () => {
    if (!aDesDonnees(etat.brouillon)) return;
    if (!await demander({ titre: 'Remettre à zéro ?', texte: 'Toutes les quantités saisies seront effacées.', ok: 'Remettre à zéro', danger: true })) return;
    Object.assign(etat.brouillon, { quantites: quantitesVides(), garde: null, gardeAuto: true, gardePour: '' });
    sauverBrouillon(true); rendre();
  },
  versRepartition: async () => {
    if (!aDesDonnees(etat.brouillon)) { await demander({ titre: 'Rien n’a été compté', texte: 'Saisissez d’abord les quantités de pièces et de billets.', ok: 'OK', annuler: 'Fermer' }); return; }
    etat.brouillon.etape = 'repartition'; sauverBrouillon(true); aller('repartition');
  },
  versComptage: () => { etat.brouillon.etape = 'comptage'; sauverBrouillon(true); aller('comptage'); },
  gPlus: b => ajusterGarde(Number(b.dataset.v), 1),
  gMoins: b => ajusterGarde(Number(b.dataset.v), -1),
  recalculer: () => { etat.brouillon.garde = null; sauverBrouillon(); rendre(); },
  valider: async () => {
    if (!aDesDonnees(etat.brouillon)) { await demander({ titre: 'Rien n’a été compté', texte: 'Saisissez d’abord les quantités de pièces et de billets.', ok: 'OK', annuler: 'Fermer' }); return; }
    document.activeElement && document.activeElement.blur();
    ouvrirValidation();
  },
  prenom: b => {
    const deja = b.classList.contains('choisie');
    $$('#prenoms .puce').forEach(p => p.classList.remove('choisie'));
    if (!deja) b.classList.add('choisie');
    modale.dataset.prenom = deja ? '' : b.dataset.p;
    const n = $('#prenom-nouveau'); if (n) n.value = '';
  },
  fermerModale: () => fermerModale(),
  voile: () => fermerModale(),
  enregistrer: () => enregistrer(),
  terminer: () => { etat.selection = null; aller('accueil'); },
  ajouterMouvement: () => ouvrirMouvement(),
  actualiserVentes: () => chargerVentes(true),
  mvtSens: b => { $$('.segment.sens button').forEach(x => x.classList.toggle('actif', x === b)); modale.dataset.sens = b.dataset.v; },
  validerMouvement: () => {
    const montant = centimesSaisis($('#mvt-montant').value);
    const motif = ($('#mvt-motif').value || '').trim().slice(0, 80);
    const err = !montant ? 'Saisissez un montant valide, par exemple 12,50.' : !motif ? 'Ajoutez un court commentaire pour expliquer le mouvement.' : '';
    if (err) { const e = $('#mvt-erreur'); e.textContent = err; e.hidden = false; return; }
    const b = etat.brouillon; if (!b) return;
    b.mouvements = [...(b.mouvements || []), { montant: Number(modale.dataset.sens) * montant, motif }];
    fermerModale(); sauverBrouillon(true); majTotaux();
  },
  supprimerMouvement: b => {
    const br = etat.brouillon; if (!br) return;
    br.mouvements = (br.mouvements || []).filter((_, i) => i !== Number(b.dataset.i));
    sauverBrouillon(true); majTotaux();
  },
  cocher: b => {
    const id = etat.selection.id;
    const ch = etat.checklist[id] = { ...(etat.checklist[id] || {}), [b.dataset.k]: b.checked };
    const ok = ['fond', 'coffre'].every(k => ch[k]);
    const btn = $('#btn-terminer'); if (btn) btn.disabled = !ok;
    const aide = $('#aide-terminer'); if (aide) aide.hidden = ok;
  },
  pdf: b => {
    const c = etat.comptages.find(x => x.id === b.dataset.id) || etat.selection;
    partagerFichier(pdfComptage(c), nomFichier(c));
  },
  detail: b => { etat.selection = etat.comptages.find(x => x.id === b.dataset.id); aller('detail'); },
  supprimer: async b => {
    const c = etat.comptages.find(x => x.id === b.dataset.id); if (!c) return;
    if (!await demanderCodeResponsable('Suppression réservée', 'Seuls les responsables peuvent supprimer un comptage.')) return;
    const nonEnvoye = c.sync !== 'envoye';
    const ok = await demander({
      titre: 'Supprimer ce comptage de l’iPad ?',
      texte: nonEnvoye ? '<b>Attention : ce comptage n’a pas encore été envoyé au Google Sheet.</b> Il sera définitivement perdu.'
        : 'Il reste conservé dans le Google Sheet (trace de contrôle).',
      ok: 'Supprimer', danger: true,
    });
    if (!ok) return;
    await db.supprimer(c.id);
    etat.comptages = await db.tous(); etat.selection = null; aller('historique');
  },
  filtreType: b => { etat.filtreType = b.dataset.v; rendre(); },
  effacerDate: () => { etat.filtreDate = ''; rendre(); },
  recap: () => {
    const p = parisMaintenant();
    ouvrirModale(`<h2>Récapitulatif sur une période</h2>
      <div class="rang dates"><label class="etiquette">Du<input type="date" id="r-debut" value="${p.date.slice(0, 8)}01"></label>
      <label class="etiquette">Au<input type="date" id="r-fin" value="${p.date}"></label></div>
      <p class="aide">Une ligne par comptage et, en bas, le total des enveloppes mises au coffre sur la période.</p>
      <div class="boutons"><button class="secondaire" data-act="fermerModale">Annuler</button>
      <button class="principal" data-act="creerRecap">Créer le PDF</button></div>`);
  },
  creerRecap: () => {
    let d = $('#r-debut').value, f = $('#r-fin').value;
    if (!d || !f) return;
    if (d > f) [d, f] = [f, d];
    const l = etat.comptages.filter(c => c.date >= d && c.date <= f);
    const blob = pdfRecap(l, d, f);
    fermerModale();
    partagerFichier(blob, `Josephine-recapitulatif-${d}-au-${f}.pdf`);
  },
  sauverCle: async () => {
    const v = ($('#cle').value || '').trim().toUpperCase();
    await db.set('cle', v); await db.set('syncErreur', null);
    await synchroniser(); majReglages(); majEnvoi();
  },
  tester: async b => {
    const el = $('#etat-envoi'); b.disabled = true;
    try {
      const cle = ($('#cle').value || '').trim().toUpperCase() || await db.get('cle');
      const r = await appelScript({ action: 'test', cle }, 20000);
      el.innerHTML = r && r.ok ? '<span class="txt-vert"><b>✓ Connexion réussie</b> avec le Google Sheet.</span>' : '<span class="txt-orange"><b>Clé refusée</b> : vérifiez la clé secrète.</span>';
    } catch (e) {
      el.innerHTML = `<span class="txt-orange"><b>Connexion impossible.</b> ${e.message === 'non-configure' ? 'Adresse du script non renseignée.' : 'Vérifiez le wifi et l’adresse du script.'}</span>`;
    } finally { b.disabled = false; }
  },
  envoyer: async () => { await synchroniser(); majReglages(); },
  effacerTout: async () => {
    if (!await demanderCodeResponsable('Effacer tout l’historique de l’iPad', 'Seuls les responsables peuvent effacer l’historique.')) return;
    const nonEnvoyes = etat.comptages.filter(c => c.sync !== 'envoye').length;
    const ok = await demander({
      titre: `Effacer les ${etat.comptages.length} comptage(s) de cet iPad ?`,
      texte: (nonEnvoyes ? `<b>Attention : ${nonEnvoyes} comptage(s) ne sont pas encore envoyés au Google Sheet et seront définitivement perdus.</b> ` : '')
        + 'Les comptages déjà envoyés restent dans le Google Sheet.',
      ok: 'Tout effacer', danger: true,
    });
    if (!ok) return;
    for (const c of etat.comptages) await db.supprimer(c.id);
    etat.brouillon = null; await db.del('brouillon');
    etat.comptages = await db.tous(); rendre(); majReglages();
  },
  sauvegarder: () => {
    const p = parisMaintenant();
    const data = { app: 'caisse-josephine', version: CONFIG.VERSION, exporteLe: new Date().toISOString(), prenoms: etat.prenoms, comptages: etat.comptages };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    partagerFichier(blob, `Josephine-sauvegarde-${p.date}.json`, 'application/json');
  },
  oublierPrenom: async b => {
    etat.prenoms = etat.prenoms.filter(p => p !== b.dataset.p);
    if (etat.dernierPrenom === b.dataset.p) { etat.dernierPrenom = ''; await db.set('dernierPrenom', ''); }
    await db.set('prenoms', etat.prenoms); rendre(); majReglages();
  },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const f = actions[b.dataset.act];
  if (!f) return;
  if (b.tagName === 'BUTTON') e.preventDefault();
  f(b, e);
});
// Les boutons + / − ne font pas disparaître le clavier pendant la saisie.
vue.addEventListener('mousedown', e => { if (e.target.closest('.pm')) e.preventDefault(); });

/* ------------------------------------------------------------------ */
/* Mises à jour automatiques (service worker)                          */
/* ------------------------------------------------------------------ */

let nouveauSW = null;
function appliquerMiseAJour() { if (nouveauSW) nouveauSW.postMessage('activer'); }

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const surveiller = w => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        nouveauSW = w; etat.majEnAttente = true;
        if (etat.vue === 'accueil' || etat.vue === 'historique') appliquerMiseAJour();
      }
    });
    if (reg.waiting && navigator.serviceWorker.controller) { nouveauSW = reg.waiting; etat.majEnAttente = true; if (etat.vue === 'accueil') appliquerMiseAJour(); }
    reg.addEventListener('updatefound', () => surveiller(reg.installing));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let recharge = false;
  const avaitUneVersion = !!navigator.serviceWorker.controller; // pas de rechargement à la toute première visite
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recharge || !avaitUneVersion) return; recharge = true;
    sauverBrouillon(true);
    setTimeout(() => location.reload(), 150);
  });
}

demarrer();
