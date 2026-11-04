/**
 * CAISSE JOSÉPHINE — script du Google Sheet « Caisse Joséphine ».
 *
 * - reçoit chaque comptage validé sur l'iPad (sans jamais l'enregistrer deux fois) ;
 * - envoie les alertes e-mail (écart, comptage oublié) ;
 * - fournit les données en lecture seule à la page « Suivi caisse ».
 *
 * Installation : voir le GUIDE (étape 1). Après avoir collé ce code, lancez
 * une fois la fonction « installer » (bouton ▶ Exécuter).
 * Les réglages se modifient dans l'onglet « Réglages » du Sheet, sans toucher au code.
 *
 * Tous les montants sont calculés en centimes entiers ; fuseau Europe/Paris.
 */

const TZ = 'Europe/Paris';
const FOND = 10000;                 // 100,00 € en centimes
const COUPURES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const JOURS_SUIVI = 120;            // nombre de jours envoyés à la page Suivi caisse

const ONGLET_COMPTAGES = 'Comptages';
const ONGLET_DETAIL = 'Détail';
const ONGLET_REGLAGES = 'Réglages';

const ENTETES_COMPTAGES = ['Identifiant', 'Date', 'Heure', 'Type', 'Prénom', 'Total compté', 'Montant attendu',
  'Écart', 'Fond laissé', 'Mis au coffre', 'Observation', 'Fond exact', 'Reçu le', 'Données (ne pas modifier)'];
const ENTETES_DETAIL = ['Identifiant', 'Date', 'Type', 'Valeur', 'Compté', 'Reste en caisse', 'Coffre', 'Sous-total compté'];

const R = {
  destinataires: 'Destinataires des alertes',
  seuil: "Seuil d'alerte écart (€)",
  heureOuverture: "Heure de vérification de l'ouverture",
  heureCloture: 'Heure de vérification de la clôture',
  jours: "Jours d'ouverture",
  lienSuivi: 'Adresse de la page Suivi caisse',
  cle: "Clé secrète de l'iPad",
  codeSuivi: "Code d'accès Suivi caisse",
  actives: 'Alertes activées',
  fermetures: 'Dates de fermeture exceptionnelle',
};

/* ================================================================== */
/* Installation                                                        */
/* ================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Caisse Joséphine')
    .addItem('Installer / réparer', 'installer')
    .addItem('Envoyer un e-mail de test', 'envoyerEmailTest')
    .addItem('Vérifier les comptages maintenant', 'verifierComptages')
    .addToUi();
}

function installer() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('fr_FR');

  // --- Comptages ---
  const c = feuille_(ONGLET_COMPTAGES, true);
  c.getRange(1, 1, 1, ENTETES_COMPTAGES.length).setValues([ENTETES_COMPTAGES])
    .setFontWeight('bold').setBackground('#1D1B1A').setFontColor('#FFFFFF');
  c.setFrozenRows(1);
  c.getRange('A:E').setNumberFormat('@');
  c.getRange('K:N').setNumberFormat('@');
  c.getRange('F:G').setNumberFormat('#,##0.00 "€"');
  c.getRange('I:J').setNumberFormat('#,##0.00 "€"');
  c.getRange('H:H').setNumberFormat('+#,##0.00 "€";-#,##0.00 "€";0.00 "€"');
  [150, 95, 75, 90, 110, 110, 110, 95, 100, 110, 300, 80, 150, 120].forEach((w, i) => c.setColumnWidth(i + 1, w));
  c.hideColumns(14);
  const regles = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($H2<>"",$H2<>0)')
      .setBackground('#FFE2BF').setFontColor('#8A4300').setRanges([c.getRange('H2:H')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($D2="Clôture",$I2<>100)')
      .setBackground('#FFE2BF').setFontColor('#8A4300').setRanges([c.getRange('I2:I')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Non')
      .setBackground('#FFE2BF').setRanges([c.getRange('L2:L')]).build(),
  ];
  c.setConditionalFormatRules(regles);

  // --- Détail ---
  const d = feuille_(ONGLET_DETAIL, true);
  d.getRange(1, 1, 1, ENTETES_DETAIL.length).setValues([ENTETES_DETAIL])
    .setFontWeight('bold').setBackground('#1D1B1A').setFontColor('#FFFFFF');
  d.setFrozenRows(1);
  d.getRange('A:D').setNumberFormat('@');
  d.getRange('E:G').setNumberFormat('0');
  d.getRange('H:H').setNumberFormat('#,##0.00 "€"');
  [150, 95, 90, 80, 80, 120, 80, 130].forEach((w, i) => d.setColumnWidth(i + 1, w));

  // --- Réglages ---
  const r = feuille_(ONGLET_REGLAGES, true);
  const existants = lireBrut_();
  const moi = Session.getEffectiveUser().getEmail();
  const lignes = [
    ['Réglage', 'Valeur', 'Explication'],
    [R.destinataires, existants[R.destinataires] || moi, 'Adresses e-mail qui reçoivent les alertes, séparées par des virgules (Nathalie, et éventuellement vous).'],
    [R.seuil, existants[R.seuil] || '0,01', 'Une alerte est envoyée dès que l’écart atteint ce montant (0,01 = dès 1 centime).'],
    [R.heureOuverture, existants[R.heureOuverture] || '09:45', 'Si aucune ouverture n’est reçue à cette heure : e-mail « Aucun comptage d’ouverture reçu ce matin ».'],
    [R.heureCloture, existants[R.heureCloture] || '17:55', 'Si aucune clôture n’est reçue à cette heure : e-mail « Aucune clôture de caisse reçue ce soir ».'],
    [R.jours, existants[R.jours] || 'lundi, mardi, mercredi, jeudi, vendredi, samedi', 'Jours où le café est ouvert (ex. : « lundi à samedi » ou une liste).'],
    [R.lienSuivi, existants[R.lienSuivi] || '', 'Adresse de la page Suivi caisse (mise dans les e-mails). Voir le guide, étape 4.'],
    [R.cle, existants[R.cle] || code_(), 'À saisir une fois sur l’iPad (Historique › Réglages). Ne la communiquez à personne d’autre.'],
    [R.codeSuivi, existants[R.codeSuivi] || code_(), 'Code d’accès de la page Suivi caisse (pour Nathalie et vous). Changez-le pour retirer un accès.'],
    [R.actives, existants[R.actives] || 'Oui', 'Mettez « Non » pour suspendre toutes les alertes (ex. : fermeture pour congés).'],
    ['', '', ''],
    [R.fermetures, '', 'Une date par ligne dans la colonne B, sous cette ligne (ex. : 25/12/2026). Aucune alerte ces jours-là.'],
  ];
  const anciennesFermetures = lireFermeturesBrutes_();
  r.getRange(1, 1, lignes.length, 3).setNumberFormat('@').setValues(lignes);
  r.getRange('B13:B200').setNumberFormat('@');
  if (anciennesFermetures.length) r.getRange(13, 2, anciennesFermetures.length, 1).setValues(anciennesFermetures.map(x => [x]));
  r.getRange('A1:C1').setFontWeight('bold').setBackground('#1D1B1A').setFontColor('#FFFFFF');
  r.getRange('A2:A12').setFontWeight('bold');
  r.getRange('B2:B10').setBackground('#FFF8DB');
  r.getRange('A12:C12').setBackground('#F4F2F0');
  r.setColumnWidth(1, 290); r.setColumnWidth(2, 330); r.setColumnWidth(3, 560);
  r.getRange('C:C').setWrap(true).setFontColor('#6E6864');
  r.setFrozenRows(1);
  ss.setActiveSheet(r);

  const s = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);

  // --- Déclencheur toutes les 5 minutes (vérification des oublis) ---
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'verifierComptages').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('verifierComptages').timeBased().everyMinutes(5).create();

  // Message discret (non bloquant) dans le Sheet.
  ss.toast('Installation terminée. Étape suivante : Déployer › Nouveau déploiement › Application Web.', 'Caisse Joséphine', 10);
}

function feuille_(nom, creer) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(nom) || (creer ? ss.insertSheet(nom) : null);
}

/** Code aléatoire lisible : XXXX-XXXX-XXXX-XXXX (sans 0/O ni 1/I). */
function code_() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 16; i++) { s += a[Math.floor(Math.random() * a.length)]; if (i % 4 === 3 && i < 15) s += '-'; }
  return s;
}

/* ================================================================== */
/* Réglages                                                            */
/* ================================================================== */

function lireBrut_() {
  const r = feuille_(ONGLET_REGLAGES, false);
  const o = {};
  if (!r) return o;
  r.getRange(1, 1, Math.min(Math.max(r.getLastRow(), 1), 12), 2).getDisplayValues().forEach(l => { if (l[0]) o[l[0]] = String(l[1]).trim(); });
  return o;
}

function lireFermeturesBrutes_() {
  const r = feuille_(ONGLET_REGLAGES, false);
  if (!r || r.getLastRow() < 13) return [];
  return r.getRange(13, 2, r.getLastRow() - 12, 1).getDisplayValues().map(l => String(l[0]).trim()).filter(Boolean);
}

function lireReglages_() {
  const b = lireBrut_();
  return {
    destinataires: (b[R.destinataires] || '').split(/[,;\s]+/).filter(x => x.indexOf('@') > 0).join(','),
    seuil: Math.max(1, centimes_(b[R.seuil] || '0,01')),
    heureOuverture: heure_(b[R.heureOuverture] || '09:45'),
    heureCloture: heure_(b[R.heureCloture] || '17:55'),
    jours: jours_(b[R.jours] || 'lundi à samedi'),
    lienSuivi: b[R.lienSuivi] || '',
    cle: (b[R.cle] || '').toUpperCase(),
    codeSuivi: (b[R.codeSuivi] || '').toUpperCase(),
    actives: !/^non/i.test(b[R.actives] || 'Oui'),
    fermetures: lireFermeturesBrutes_().map(dateIso_).filter(Boolean),
  };
}

/** "0,01" ou "1,50 €" -> centimes (entier). */
function centimes_(t) {
  const s = String(t).replace(/[^\d,.\-]/g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) : 1;
}

/** "9:45", "09h45" -> "09:45" */
function heure_(t) {
  const m = String(t).match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (!m) return '23:59';
  return ('0' + m[1]).slice(-2) + ':' + (m[2] || '00');
}

/** "lundi, mardi" ou "lundi à samedi" -> [1, 2, ...] (1 = lundi … 7 = dimanche). */
function jours_(t) {
  const noms = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const s = String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = s.match(/([a-z]{3})[a-z]*\s+(?:a|au|-)\s+([a-z]{3})/);
  if (m && noms.indexOf(m[1]) >= 0 && noms.indexOf(m[2]) >= 0) {
    const res = [];
    for (let i = noms.indexOf(m[1]); ; i = (i + 1) % 7) { res.push(i + 1); if (i === noms.indexOf(m[2])) break; }
    return res;
  }
  return noms.map((n, i) => (new RegExp('\\b' + n).test(s) ? i + 1 : 0)).filter(Boolean);
}

/** "25/12/2026", "25/12/26" ou "2026-12-25" -> "2026-12-25" */
function dateIso_(t) {
  let m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = String(t).match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/* ================================================================== */
/* Réception des données                                               */
/* ================================================================== */

function doGet() {
  return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Caisse Joséphine : le script fonctionne.</p>');
}

function doPost(e) {
  let corps;
  try { corps = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erreur: 'format' }); }
  const r = lireReglages_();

  if (corps.action === 'suivi') {
    if (!r.codeSuivi || !egal_(String(corps.code || '').toUpperCase().trim(), r.codeSuivi)) return json_({ ok: false, erreur: 'code' });
    return json_(donneesSuivi_(r));
  }

  if (!r.cle || !egal_(String(corps.cle || '').toUpperCase().trim(), r.cle)) return json_({ ok: false, erreur: 'cle' });
  if (corps.action === 'test') return json_({ ok: true });
  if (corps.action === 'enregistrer') return json_(enregistrer_(corps.comptage, r));
  return json_({ ok: false, erreur: 'action' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function egal_(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function entier_(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

/** Contrôle le comptage reçu (entiers, totaux cohérents). Renvoie un message d'erreur ou ''. */
function controler_(c) {
  if (!c || typeof c.id !== 'string' || !/^[A-Za-z0-9\-]{4,60}$/.test(c.id)) return 'id';
  if (c.type !== 'ouverture' && c.type !== 'cloture') return 'type';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !/^\d{2}:\d{2}:\d{2}$/.test(c.heure)) return 'date';
  let total = 0;
  for (const v of COUPURES) {
    const n = c.quantites && c.quantites[v];
    if (!entier_(n) || n < 0) return 'quantites';
    total += v * n;
  }
  if (total !== c.total) return 'total';
  if (c.type === 'cloture') {
    let fond = 0, env = 0;
    for (const v of COUPURES) {
      const g = c.garde && c.garde[v], k = c.coffre && c.coffre[v];
      if (!entier_(g) || !entier_(k) || g < 0 || k < 0 || g + k !== c.quantites[v]) return 'repartition';
      fond += v * g; env += v * k;
    }
    if (fond !== c.fond || env !== c.enveloppe) return 'repartition';
  } else if (c.ecart !== total - FOND) return 'ecart';
  return '';
}

function enregistrer_(c, r) {
  const err = controler_(c);
  if (err) return { ok: false, erreur: 'donnees-' + err };
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let nouveau = false;
  try {
    const sh = feuille_(ONGLET_COMPTAGES, false) || (installer(), feuille_(ONGLET_COMPTAGES, false));
    if (sh.getLastRow() > 1 && sh.getRange('A2:A').createTextFinder(c.id).matchEntireCell(true).findNext()) {
      return { ok: true, doublon: true };      // déjà reçu : jamais deux fois
    }
    const ouv = c.type === 'ouverture';
    const ecart = ouv ? c.ecart : c.fond - FOND;
    const recu = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
    sh.appendRow([
      c.id, dateFr_(c.date), c.heure, ouv ? 'Ouverture' : 'Clôture', texte_(c.prenom),
      c.total / 100, FOND / 100, ecart / 100, ouv ? '' : c.fond / 100, ouv ? '' : c.enveloppe / 100,
      texte_(c.observation), ouv ? '' : (c.fond === FOND ? 'Oui' : 'Non'), recu, JSON.stringify(c),
    ]);
    const d = feuille_(ONGLET_DETAIL, false);
    const lignes = COUPURES.map(v => [c.id, dateFr_(c.date), ouv ? 'Ouverture' : 'Clôture', libelle_(v),
      c.quantites[v], ouv ? '' : c.garde[v], ouv ? '' : c.coffre[v], (v * c.quantites[v]) / 100]);
    d.getRange(d.getLastRow() + 1, 1, lignes.length, lignes[0].length).setValues(lignes);
    SpreadsheetApp.flush();
    nouveau = true;
  } finally { lock.releaseLock(); }
  if (nouveau) { try { alerteEcart_(c, r); } catch (e) { console.error(e); } }
  return { ok: true };
}

/* ================================================================== */
/* Alertes e-mail                                                      */
/* ================================================================== */

function alerteEcart_(c, r) {
  const ouv = c.type === 'ouverture';
  const ecart = ouv ? c.ecart : c.fond - FOND;
  if (!r.actives || !r.destinataires || Math.abs(ecart) < r.seuil) return;
  const props = PropertiesService.getScriptProperties();
  const cle = 'alerte_ecart_' + c.id;
  if (props.getProperty(cle)) return;           // jamais deux fois pour le même comptage
  const quand = (ouv ? 'ouverture du ' : 'clôture du ') + dateCourteFr_(c.date);
  const sujet = ouv
    ? 'Joséphine – Écart de caisse : ' + euros_(ecart, true) + ' (' + quand + ')'
    : 'Joséphine – Fond de caisse : ' + euros_(c.fond) + ' au lieu de ' + euros_(FOND) + ' (' + quand + ')';
  const lignes = [
    ['Date', dateLongueFr_(c.date)], ['Heure', c.heure], ['Comptage', ouv ? 'Ouverture (matin)' : 'Clôture (soir)'],
    ['Prénom', c.prenom || '—'],
    [ouv ? 'Montant attendu' : 'Fond de caisse attendu', euros_(FOND)],
    [ouv ? 'Montant compté' : 'Fond de caisse laissé', euros_(ouv ? c.total : c.fond)],
    ['Écart', euros_(ecart, true)],
  ];
  if (!ouv) { lignes.push(['Total compté (caisse entière)', euros_(c.total)]); lignes.push(['Enveloppe mise au coffre', euros_(c.enveloppe)]); }
  lignes.push(['Observation', c.observation || '—']);
  envoyer_(r, sujet, (ouv ? 'Un écart a été constaté au comptage d’ouverture.' : 'Le fond de caisse laissé ce soir n’est pas de 100,00 €.'), lignes);
  props.setProperty(cle, new Date().toISOString());
}

function verifierComptages() {
  const r = lireReglages_();
  if (!r.actives || !r.destinataires) return;
  const now = new Date();
  const date = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  const hm = Utilities.formatDate(now, TZ, 'HH:mm');
  const jour = Number(Utilities.formatDate(now, TZ, 'u')); // 1 = lundi … 7 = dimanche
  if (r.jours.indexOf(jour) < 0 || r.fermetures.indexOf(date) >= 0) return;
  const props = PropertiesService.getScriptProperties();
  const verifs = [
    { type: 'ouverture', heure: r.heureOuverture, sujet: 'Joséphine – Aucun comptage d’ouverture reçu ce matin', texte: 'Aucun comptage d’ouverture reçu ce matin.' },
    { type: 'cloture', heure: r.heureCloture, sujet: 'Joséphine – Aucune clôture de caisse reçue ce soir', texte: 'Aucune clôture de caisse reçue ce soir.' },
  ];
  let recus = null;
  for (const v of verifs) {
    if (hm < v.heure) continue;
    const cle = 'oubli_' + v.type + '_' + date;
    if (props.getProperty(cle)) continue;          // une seule fois par jour
    if (!recus) recus = typesRecus_(date);
    if (recus[v.type]) continue;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;
    try {
      if (props.getProperty(cle)) continue;
      envoyer_(r, v.sujet + ' (' + dateCourteFr_(date) + ')',
        v.texte + '<br><br><i>Le comptage a peut-être été fait mais pas encore reçu, si l’iPad est hors connexion : il sera envoyé automatiquement dès le retour du wifi.</i>',
        [['Date', dateLongueFr_(date)], ['Heure de vérification', v.heure]]);
      props.setProperty(cle, now.toISOString());
    } finally { lock.releaseLock(); }
  }
}

function typesRecus_(date) {
  const sh = feuille_(ONGLET_COMPTAGES, false);
  const res = { ouverture: false, cloture: false };
  if (!sh || sh.getLastRow() < 2) return res;
  const debut = Math.max(2, sh.getLastRow() - 400);
  const fr = dateFr_(date);
  sh.getRange(debut, 2, sh.getLastRow() - debut + 1, 3).getDisplayValues().forEach(l => {
    if (l[0] === fr) { if (l[2] === 'Ouverture') res.ouverture = true; if (l[2] === 'Clôture') res.cloture = true; }
  });
  return res;
}

function envoyer_(r, sujet, intro, lignes) {
  const tr = lignes.map(l => '<tr><td style="padding:6px 14px 6px 0;color:#6E6864">' + echap_(l[0]) +
    '</td><td style="padding:6px 0;font-weight:600">' + echap_(l[1]).replace(/\n/g, '<br>') + '</td></tr>').join('');
  const lien = r.lienSuivi ? '<p style="margin-top:22px"><a href="' + echap_(r.lienSuivi) +
    '" style="background:#D11F19;color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ouvrir la page Suivi caisse</a></p>' : '';
  const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#1D1B1A;font-size:15px;max-width:560px">' +
    '<p style="color:#D11F19;font-weight:700;font-size:13px;letter-spacing:.06em;margin:0 0 6px">JOSÉPHINE · CAISSE</p>' +
    '<p style="font-size:17px;margin:0 0 14px">' + intro + '</p><table style="border-collapse:collapse">' + tr + '</table>' + lien +
    '<p style="color:#A39D98;font-size:12px;margin-top:26px">E-mail automatique envoyé par le Google Sheet « Caisse Joséphine ».</p></div>';
  const texte = intro.replace(/<[^>]+>/g, '') + '\n\n' + lignes.map(l => l[0] + ' : ' + l[1]).join('\n') + (r.lienSuivi ? '\n\nSuivi caisse : ' + r.lienSuivi : '');
  MailApp.sendEmail({ to: r.destinataires, subject: sujet, body: texte, htmlBody: html, name: 'Caisse Joséphine' });
}

function envoyerEmailTest() {
  const r = lireReglages_();
  if (!r.destinataires) throw new Error('Renseignez les destinataires dans l’onglet Réglages.');
  envoyer_(r, 'Joséphine – E-mail de test', 'Ceci est un e-mail de test : les alertes de caisse arriveront ainsi.', [['Destinataires', r.destinataires]]);
}

/* ================================================================== */
/* Données pour la page Suivi caisse (lecture seule)                   */
/* ================================================================== */

function donneesSuivi_(r) {
  const sh = feuille_(ONGLET_COMPTAGES, false);
  const limite = Utilities.formatDate(new Date(Date.now() - JOURS_SUIVI * 86400000), TZ, 'yyyy-MM-dd');
  const comptages = [];
  if (sh && sh.getLastRow() > 1) {
    const debut = Math.max(2, sh.getLastRow() - 1500);
    sh.getRange(debut, 14, sh.getLastRow() - debut + 1, 1).getValues().forEach(l => {
      try { const c = JSON.parse(l[0]); if (c && c.date >= limite) comptages.push(c); } catch (e) { /* ligne ignorée */ }
    });
  }
  const now = new Date();
  return {
    ok: true, comptages: comptages,
    maintenant: { date: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), heure: Utilities.formatDate(now, TZ, 'HH:mm') },
    reglages: { jours: r.jours, fermetures: r.fermetures, heureOuverture: r.heureOuverture, heureCloture: r.heureCloture, seuil: r.seuil },
  };
}

/* ================================================================== */
/* Formats                                                             */
/* ================================================================== */

function euros_(cents, signe) {
  const neg = cents < 0, a = Math.abs(Math.round(cents));
  const ent = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '–' : (signe && cents > 0 ? '+' : '')) + ent + ',' + ('0' + (a % 100)).slice(-2) + ' €';
}
function libelle_(v) { return v % 100 === 0 ? (v / 100) + ' €' : '0,' + ('0' + v).slice(-2) + ' €'; }
function dateFr_(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
const MOIS_ = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_ = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function dateCourteFr_(iso) { const p = iso.split('-').map(Number); return (p[2] === 1 ? '1er' : p[2]) + ' ' + MOIS_[p[1] - 1]; }
function dateLongueFr_(iso) {
  const p = iso.split('-').map(Number);
  return JOURS_[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + dateCourteFr_(iso) + ' ' + p[0];
}
/** Texte saisi : jamais interprété comme une formule. */
function texte_(s) { s = String(s || ''); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function echap_(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
