/* Page « Suivi caisse » (lecture seule) pour Nathalie. */
import { FOND_DE_CAISSE, COUPURES, euros, libelle, dateLongue, typeLibelle } from '../js/calc.js';
import { CONFIG } from '../js/config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = $('#page'), modale = $('#modale');
const CLE_CODE = 'suivi-code', CLE_CACHE = 'suivi-cache';
const stock = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};

let donnees = null, misAJour = null, horsLigne = false, filtreEcarts = false, nbJours = 21;

/* ---------- Code d'accès ---------- */
function codeDepuisLien() {
  const m = location.hash.match(/code=([A-Za-z0-9\-]+)/);
  return m ? m[1].toUpperCase() : null;
}
function code() { return codeDepuisLien() || stock.get(CLE_CODE); }

function formulaireCode(erreur = '') {
  $('#actualiser').hidden = true;
  page.innerHTML = `<section class="acces">
    <h1>Accès réservé</h1>
    <p>Saisissez le code d’accès « Suivi caisse » (onglet Réglages du Google Sheet).</p>
    <form id="f-code"><input id="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required>
    <button class="principal">Ouvrir</button></form>
    ${erreur ? `<p class="erreur">${esc(erreur)}</p>` : ''}
  </section>`;
  $('#f-code').addEventListener('submit', e => {
    e.preventDefault();
    stock.set(CLE_CODE, $('#code').value.trim().toUpperCase());
    charger();
  });
}

/* ---------- Chargement ---------- */
async function charger() {
  const c = code();
  if (!CONFIG.SCRIPT_URL) { page.innerHTML = '<p class="attente">L’adresse du script Google n’est pas encore renseignée (js/config.js).</p>'; return; }
  if (!c) { formulaireCode(); return; }
  $('#actualiser').hidden = false; $('#actualiser').disabled = true; $('#actualiser').textContent = 'Actualisation…';
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(CONFIG.SCRIPT_URL, {
      method: 'POST', body: JSON.stringify({ action: 'suivi', code: c }), signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store',
    });
    clearTimeout(t);
    const d = await r.json();
    if (!d.ok) {
      stock.del(CLE_CODE); stock.del(CLE_CACHE); donnees = null;
      if (codeDepuisLien()) history.replaceState(null, '', location.pathname);
      formulaireCode('Code refusé. Vérifiez le code d’accès.');
      return;
    }
    stock.set(CLE_CODE, c);
    donnees = d; misAJour = new Date(); horsLigne = false;
    stock.set(CLE_CACHE, JSON.stringify({ d, t: misAJour.toISOString() }));
  } catch (e) {
    const cache = stock.get(CLE_CACHE);
    if (cache) { const x = JSON.parse(cache); donnees = x.d; misAJour = new Date(x.t); horsLigne = true; }
    else { page.innerHTML = '<p class="attente">Connexion impossible. Vérifiez la connexion internet puis actualisez.</p>'; }
  } finally {
    $('#actualiser').disabled = false; $('#actualiser').textContent = 'Actualiser';
  }
  if (donnees) rendre();
}

/* ---------- Calculs d'affichage ---------- */
const jourSemaine = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; };
function decaler(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}
const estOuvert = (iso, r) => r.jours.includes(jourSemaine(iso)) && !r.fermetures.includes(iso);
/** Écart affiché : ouverture = compté – 100 € ; clôture = compté – caisse théorique. */
const ecartDe = c => c.type === 'ouverture' ? c.ecart : (typeof c.ecartTheorique === 'number' ? c.ecartTheorique : 0);
/** Anomalie : écart, ou fond de caisse du soir différent de 100 €. */
const anomalie = c => !!ecartDe(c) || (c.type === 'cloture' && c.fond !== FOND_DE_CAISSE);

function parJour() {
  const m = new Map();
  for (const c of donnees.comptages) {
    if (!m.has(c.date)) m.set(c.date, []);
    m.get(c.date).push(c);
  }
  for (const l of m.values()) l.sort((a, b) => a.heure.localeCompare(b.heure));
  return m;
}

/* ---------- Rendu ---------- */
function tuile(type, liste, date, r, now) {
  const c = liste.filter(x => x.type === type).pop();
  const nom = type === 'ouverture' ? 'Ouverture' : 'Clôture';
  if (!c) {
    const heureLimite = type === 'ouverture' ? r.heureOuverture : r.heureCloture;
    const ouvert = estOuvert(date, r);
    const enRetard = ouvert && (date < now.date || now.heure >= heureLimite);
    return `<div class="tuile ${enRetard ? 'oubli' : 'vide'}"><span class="t-type">${nom}</span>
      <b>${!ouvert ? 'Café fermé' : enRetard ? 'Non reçue' : 'Pas encore faite'}</b>
      <small>${!ouvert ? '' : enRetard ? 'Peut-être faite mais pas encore envoyée si l’iPad est hors connexion.' : `Vérification à ${heureLimite.replace(':', ' h ')}`}</small></div>`;
  }
  const e = ecartDe(c);
  return `<button class="tuile ${anomalie(c) ? 'ecart' : 'ok'}" data-id="${esc(c.id)}"><span class="t-type">${nom}</span>
    <b>${c.heure.slice(0, 5)}${c.prenom ? ` · ${esc(c.prenom)}` : ''}</b>
    ${type === 'ouverture'
      ? `<span class="t-montant">${e ? `Écart ${euros(e, { signe: true })}` : 'Caisse juste'}</span><small>Compté ${euros(c.total)}</small>`
      : `<span class="t-montant">${typeof c.ecartTheorique !== 'number' ? 'Écart non calculé' : e ? `Écart ${euros(e, { signe: true })}` : 'Caisse juste'}</span>
         <small>Coffre ${euros(c.enveloppe)} · fond ${c.fond !== FOND_DE_CAISSE ? `<em>${euros(c.fond)}</em>` : euros(c.fond)}</small>`}
    ${liste.filter(x => x.type === type).length > 1 ? '<small>plusieurs comptages ce jour</small>' : ''}
  </button>`;
}

function ligneJour(c) {
  const e = ecartDe(c);
  return `<button class="ligne-c ${anomalie(c) ? 'ecart' : ''}" data-id="${esc(c.id)}">
    <span class="badge ${c.type === 'ouverture' ? 'ouv' : 'clo'}">${typeLibelle(c.type)}</span>
    <span class="h">${c.heure.slice(0, 5)}</span>
    <span class="p">${esc(c.prenom || '')}</span>
    <span class="m">${c.type === 'cloture' ? `coffre <b>${euros(c.enveloppe)}</b>` : euros(c.total)}</span>
    <span class="e">${e ? `écart ${euros(e, { signe: true })}` : (c.type === 'cloture' && c.fond !== FOND_DE_CAISSE ? `fond ${euros(c.fond)}` : '✓')}</span>
  </button>`;
}

function rendre() {
  const r = donnees.reglages, now = donnees.maintenant;
  const jours = parJour();
  const auj = jours.get(now.date) || [];

  // Totaux du coffre : semaine en cours (depuis lundi) et mois en cours.
  const lundi = decaler(now.date, 1 - jourSemaine(now.date));
  const debutMois = now.date.slice(0, 8) + '01';
  let semaine = 0, mois = 0;
  for (const c of donnees.comptages) {
    if (c.type !== 'cloture' || c.date > now.date) continue;
    if (c.date >= lundi) semaine += c.enveloppe;
    if (c.date >= debutMois) mois += c.enveloppe;
  }

  // Jours précédents : depuis le premier comptage reçu.
  const premiers = [...jours.keys()].sort();
  const cartes = [];
  let d = decaler(now.date, -1), vus = 0;
  while (premiers.length && d >= premiers[0] && vus < nbJours) {
    const l = jours.get(d) || [];
    const ouvert = estOuvert(d, r);
    if (l.length || ouvert) {
      vus++;
      const oublis = ouvert ? ['ouverture', 'cloture'].filter(t => !l.some(c => c.type === t)) : [];
      const ecarts = l.some(c => anomalie(c));
      if (!filtreEcarts || ecarts || oublis.length) {
        cartes.push(`<section class="carte-jour ${ecarts || oublis.length ? 'alerte' : ''}">
          <h3>${esc(dateLongue(d, { annee: false }))}</h3>
          ${l.map(ligneJour).join('')}
          ${oublis.map(t => `<div class="ligne-c oubli"><span class="badge ${t === 'ouverture' ? 'ouv' : 'clo'}">${typeLibelle(t)}</span><span>Non reçue</span></div>`).join('')}
        </section>`);
      }
    }
    d = decaler(d, -1);
  }
  const reste = premiers.length && d >= premiers[0];

  page.innerHTML = `
    ${horsLigne ? '<p class="bandeau">Hors connexion : affichage des dernières données reçues.</p>' : ''}
    <section class="aujourdhui">
      <h1>Aujourd’hui <span>${esc(dateLongue(now.date, { annee: false }))}</span></h1>
      <div class="tuiles">${tuile('ouverture', auj, now.date, r, now)}${tuile('cloture', auj, now.date, r, now)}</div>
    </section>
    <section class="totaux">
      <div><span>Coffre · semaine en cours</span><b>${euros(semaine)}</b></div>
      <div><span>Coffre · ${esc(dateLongue(debutMois, { jour: false }).replace(/^1er /, ''))}</span><b>${euros(mois)}</b></div>
    </section>
    <div class="filtre"><h2>Jours précédents</h2>
      <label class="interrupteur"><input type="checkbox" id="f-ecarts" ${filtreEcarts ? 'checked' : ''}><span></span>Uniquement les écarts</label></div>
    ${cartes.join('') || `<p class="attente">${filtreEcarts ? 'Aucun écart ni oubli sur la période.' : 'Pas encore de jours précédents.'}</p>`}
    ${reste ? '<button class="secondaire plus" id="plus">Afficher les jours plus anciens</button>' : ''}
    <p class="maj">Mis à jour ${misAJour ? misAJour.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''} · lecture seule</p>`;
}

/* ---------- Détail d'un comptage ---------- */
function controle(c) {
  const l = (a, b, cls = '') => `<div class="ctl ${cls}"><span>${a}</span><b>${b}</b></div>`;
  if (typeof c.theorique !== 'number') return `<div class="controle">${l('Fond de caisse laissé', euros(c.fond), c.fond !== FOND_DE_CAISSE ? 'orange' : '')}<p class="sous">Caisse théorique non calculée.</p></div>`;
  return `<div class="controle">
    ${l('Caisse du matin', euros(c.matin))}
    ${l('Ventes en espèces', euros(c.ventesEspeces, { signe: true }) + (c.nbVentesEspeces ? ` <small>(${c.nbVentesEspeces})</small>` : ''))}
    ${c.remboursementsEspeces ? l('Remboursements', euros(-c.remboursementsEspeces, { signe: true })) : ''}
    ${(c.mouvements || []).map(m => l('· ' + esc(m.motif || 'mouvement'), euros(m.montant, { signe: true }))).join('')}
    ${l('Caisse théorique', euros(c.theorique), 'fort')}
    ${l('Écart de caisse', c.ecartTheorique ? euros(c.ecartTheorique, { signe: true }) : 'juste', c.ecartTheorique ? 'orange fort' : 'vert fort')}
    ${l('Fond de caisse laissé', euros(c.fond), c.fond !== FOND_DE_CAISSE ? 'orange' : '')}
  </div>`;
}
function detail(c) {
  const clo = c.type === 'cloture';
  const e = ecartDe(c);
  const lignes = COUPURES.filter(v => c.quantites[v] || (clo && c.coffre[v])).map(v => `<tr><td>${libelle(v)}</td><td class="n">${c.quantites[v]}</td><td class="n">${euros(v * c.quantites[v])}</td>
    ${clo ? `<td class="n">${c.garde[v]}</td><td class="n ${c.coffre[v] ? 'rouge' : ''}">${c.coffre[v]}</td>` : ''}</tr>`).join('');
  modale.innerHTML = `<div class="voile" data-fermer></div><div class="carte-modale">
    <button class="fermer" data-fermer aria-label="Fermer">×</button>
    <span class="badge ${clo ? 'clo' : 'ouv'}">${typeLibelle(c.type)}</span>
    <h2>${esc(dateLongue(c.date))}</h2>
    <p class="sous">${c.heure}${c.prenom ? ` · ${esc(c.prenom)}` : ''}</p>
    <div class="chiffres">
      <div><span>Total compté</span><b>${euros(c.total)}</b></div>
      ${clo ? `<div><span>Écart</span><b class="${e ? 'orange' : 'vert'}">${typeof c.ecartTheorique !== 'number' ? '—' : e ? euros(e, { signe: true }) : 'juste'}</b></div><div><span>Coffre</span><b class="rouge">${euros(c.enveloppe)}</b></div>`
        : `<div><span>Attendu</span><b>${euros(c.attendu)}</b></div><div><span>Écart</span><b class="${e ? 'orange' : 'vert'}">${e ? euros(e, { signe: true }) : 'juste'}</b></div>`}
    </div>
    ${clo ? controle(c) : ''}
    <table><thead><tr><th>Valeur</th><th class="n">Qté</th><th class="n">Sous-total</th>${clo ? '<th class="n">Caisse</th><th class="n">Coffre</th>' : ''}</tr></thead>
    <tbody>${lignes}</tbody>
    <tfoot><tr><td>Pièces</td><td></td><td class="n">${euros(c.totalPieces)}</td>${clo ? '<td></td><td></td>' : ''}</tr>
    <tr><td>Billets</td><td></td><td class="n">${euros(c.totalBillets)}</td>${clo ? '<td></td><td></td>' : ''}</tr></tfoot></table>
    <div class="obs"><span>Observation</span><p>${c.observation ? esc(c.observation) : '<i>Aucune</i>'}</p></div>
  </div>`;
  modale.hidden = false;
}

/* ---------- Événements ---------- */
page.addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) { const c = donnees.comptages.find(x => x.id === b.dataset.id); if (c) detail(c); return; }
  if (e.target.id === 'plus') { nbJours += 30; rendre(); }
});
page.addEventListener('change', e => { if (e.target.id === 'f-ecarts') { filtreEcarts = e.target.checked; rendre(); } });
modale.addEventListener('click', e => { if (e.target.closest('[data-fermer]')) { modale.hidden = true; modale.innerHTML = ''; } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { modale.hidden = true; } });
$('#actualiser').addEventListener('click', charger);
document.addEventListener('visibilitychange', () => { if (!document.hidden && code()) charger(); });
setInterval(() => { if (!document.hidden && code()) charger(); }, 120000);
window.addEventListener('hashchange', charger);

charger();
