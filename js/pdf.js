/*
 * Export PDF (A4) avec jsPDF, inclus dans le projet (lib/jspdf.umd.min.js).
 * Les PDF reproduisent exactement le comptage enregistré.
 */
import {
  PIECES, BILLETS, COUPURES, FOND_DE_CAISSE, euros, dateLongue, dateCourte, typeLibelle
} from './calc.js';

const ROUGE = [209, 31, 25], ENCRE = [29, 27, 26], GRIS = [110, 104, 100], LIGNE = [225, 220, 215],
  FOND_GRIS = [246, 244, 242], ORANGE = [196, 96, 0], VERT = [30, 130, 72];
const LOGO_RATIO = 1504 / 1595;
let logo = null;

/** Charge le logo une fois pour toutes (appelé au démarrage). */
export async function prechargerLogo(url = 'img/logo-pdf.png') {
  try {
    const b = await (await fetch(url)).blob();
    logo = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  } catch (e) { logo = null; }
}

// Montants pour le PDF : espace simple comme séparateur des milliers.
const m = (c, o = {}) => euros(c, { sep: ' ', ...o }).replace(/ /g, ' ');
const lib = v => (v % 100 === 0 ? `${v / 100} €` : `0,${String(v).padStart(2, '0')} €`);

function nouveauDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'Joséphine – Caisse', creator: 'Caisse Joséphine' });
  return doc;
}

function couleur(doc, c) { doc.setTextColor(c[0], c[1], c[2]); }

function entete(doc, titre, sousTitre) {
  const h = 17, w = h * LOGO_RATIO;
  if (logo) doc.addImage(logo, 'PNG', 15, 12, w, h, 'logo', 'FAST');
  couleur(doc, ENCRE);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(titre, 15 + w + 5, 19.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); couleur(doc, ROUGE);
  doc.text(sousTitre, 15 + w + 5, 26);
  doc.setDrawColor(...ROUGE); doc.setLineWidth(0.6); doc.line(15, 33, 195, 33);
  return 41;
}

function piedDePage(doc, texte) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); couleur(doc, GRIS);
    doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2); doc.line(15, 284, 195, 284);
    doc.text(texte, 15, 288.5);
    if (n > 1) doc.text(`Page ${i} / ${n}`, 195, 288.5, { align: 'right' });
  }
}

function info(doc, x, y, label, valeur) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); couleur(doc, GRIS);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); couleur(doc, ENCRE);
  doc.text(valeur, x, y + 5.5);
}

/**
 * Tableau simple. cols = [{ titre, x, align, w }] ; lignes = [[...]] ;
 * options : rowH, gras (index des lignes en gras), fond (index des lignes grisées).
 */
function tableau(doc, y, cols, lignes, { rowH = 6.6, gras = [], fond = [], x0 = 15, x1 = 195, couleurs = {} } = {}) {
  doc.setFillColor(...ENCRE); doc.rect(x0, y, x1 - x0, 7.2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(255, 255, 255);
  for (const c of cols) doc.text(c.titre, c.align === 'right' ? c.x : c.x, y + 4.9, { align: c.align || 'left' });
  y += 7.2;
  lignes.forEach((l, i) => {
    if (fond.includes(i)) { doc.setFillColor(...FOND_GRIS); doc.rect(x0, y, x1 - x0, rowH, 'F'); }
    doc.setFont('helvetica', gras.includes(i) ? 'bold' : 'normal'); doc.setFontSize(9.6);
    l.forEach((txt, j) => {
      const c = cols[j];
      const coul = couleurs[`${i},${j}`] || ENCRE;
      couleur(doc, coul);
      doc.text(String(txt), c.x, y + rowH / 2 + 1.3, { align: c.align || 'left' });
    });
    doc.setDrawColor(...LIGNE); doc.setLineWidth(0.15); doc.line(x0, y + rowH, x1, y + rowH);
    y += rowH;
  });
  return y;
}

function encadre(doc, y, label, valeur, { couleurValeur = ENCRE, h = 15, x0 = 15, x1 = 195, taille = 17 } = {}) {
  doc.setFillColor(...FOND_GRIS); doc.setDrawColor(...LIGNE); doc.roundedRect(x0, y, x1 - x0, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); couleur(doc, ENCRE);
  doc.text(label, x0 + 5, y + h / 2 + 1.5);
  doc.setFontSize(taille); couleur(doc, couleurValeur);
  doc.text(valeur, x1 - 5, y + h / 2 + 2.2, { align: 'right' });
  return y + h;
}

function observations(doc, y, texte) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); couleur(doc, GRIS);
  doc.text('OBSERVATIONS', 15, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); couleur(doc, ENCRE);
  const lignes = doc.splitTextToSize(texte && texte.trim() ? texte.trim() : 'Aucune observation.', 180).slice(0, 8);
  doc.text(lignes, 15, y + 5.5);
  return y + 5.5 + lignes.length * 4.6;
}

export function nomFichier(c) {
  return `Josephine-caisse-${c.date}-${c.type === 'ouverture' ? 'ouverture' : 'cloture'}-${c.heure.slice(0, 5).replace(':', 'h')}.pdf`;
}

/** Fiche de comptage d'un comptage enregistré. Renvoie un Blob PDF. */
export function pdfComptage(c) {
  const doc = nouveauDoc();
  const ouv = c.type === 'ouverture';
  let y = entete(doc, 'JOSÉPHINE – FICHE DE COMPTAGE DE CAISSE',
    ouv ? "Comptage d'ouverture (matin)" : 'Comptage de clôture (soir) et mise au coffre');

  info(doc, 15, y, 'Type de comptage', typeLibelle(c.type));
  info(doc, 62, y, 'Date', dateLongue(c.date));
  info(doc, 128, y, 'Heure', c.heure);
  info(doc, 153, y, 'Compté par', c.prenom || '—');
  y += 15;

  const q = c.quantites;
  const lignesComptage = COUPURES.map(v => [lib(v), String(q[v] || 0), m(v * (q[v] || 0))]);
  const totauxLignes = [
    ['Total des pièces', '', m(c.totalPieces)],
    ['Total des billets', '', m(c.totalBillets)],
  ];

  if (ouv) {
    const cols = [{ titre: 'Valeur', x: 20 }, { titre: 'Quantité', x: 130, align: 'right' }, { titre: 'Sous-total', x: 190, align: 'right' }];
    y = tableau(doc, y, cols, [...lignesComptage, ...totauxLignes],
      { gras: [12, 13], fond: [12, 13], rowH: 7.4 });
    y += 4;
    y = encadre(doc, y, 'TOTAL GÉNÉRAL DE LA CAISSE', m(c.total));
    y += 4;
    const juste = c.ecart === 0;
    const w = 180 / 3;
    [['Attendu', m(c.attendu), ENCRE], ['Compté', m(c.total), ENCRE],
      ['Écart', juste ? '0,00 € – caisse juste' : m(c.ecart, { signe: true }), juste ? VERT : ORANGE]]
      .forEach(([l, v, col], i) => {
        const x = 15 + i * w;
        doc.setDrawColor(...LIGNE); doc.roundedRect(x + (i ? 1.5 : 0), y, w - 1.5, 16, 2, 2, 'S');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); couleur(doc, GRIS);
        doc.text(l.toUpperCase(), x + 5, y + 5.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); couleur(doc, col);
        doc.text(v, x + 5, y + 12);
      });
    y += 24;
  } else {
    // Deux tableaux côte à côte : comptage (gauche) / répartition (droite)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); couleur(doc, GRIS);
    doc.text('COMPTAGE', 15, y); doc.text('RÉPARTITION CAISSE / COFFRE', 111, y);
    y += 2.5;
    const g = c.garde, k = c.coffre;
    const colsG = [{ titre: 'Valeur', x: 18 }, { titre: 'Quantité', x: 72, align: 'right' }, { titre: 'Sous-total', x: 104, align: 'right' }];
    const colsD = [{ titre: 'Valeur', x: 114 }, { titre: 'Reste en caisse', x: 164, align: 'right' }, { titre: 'Coffre', x: 192, align: 'right' }];
    const lignesD = COUPURES.map(v => [lib(v), String(g[v] || 0), String(k[v] || 0)]);
    const y1 = tableau(doc, y, colsG, [...lignesComptage, ...totauxLignes], { gras: [12, 13], fond: [12, 13], x1: 107, rowH: 7 });
    const couleursD = {};
    COUPURES.forEach((v, i) => { if (k[v]) couleursD[`${i},2`] = ROUGE; });
    tableau(doc, y, colsD, [...lignesD,
      ['Fond laissé', '', ''], ['Enveloppe', '', '']].map((l, i) => {
      if (i === 12) return ['Fond laissé', m(c.fond), ''];
      if (i === 13) return ['Enveloppe coffre', '', m(c.enveloppe)];
      return l;
    }), { gras: [12, 13], fond: [12, 13], x0: 111, rowH: 7, couleurs: { ...couleursD, '12,1': c.fondExact ? VERT : ORANGE, '13,2': ROUGE } });
    y = y1 + 4;
    y = encadre(doc, y, 'TOTAL GÉNÉRAL DE LA CAISSE (comptée)', m(c.total), { h: 13, taille: 15 });
    y += 3;
    y = encadre(doc, y, `FOND DE CAISSE LAISSÉ (attendu ${m(FOND_DE_CAISSE)})`, m(c.fond),
      { h: 13, taille: 15, couleurValeur: c.fondExact ? VERT : ORANGE });
    y += 3;
    doc.setFillColor(...ROUGE); doc.roundedRect(15, y, 180, 18, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(255, 255, 255);
    doc.text("MONTANT DE L'ENVELOPPE MISE AU COFFRE", 20, y + 10.5);
    doc.setFontSize(20); doc.text(m(c.enveloppe), 190, y + 11.8, { align: 'right' });
    y += 18;
    // Contrôle de caisse : caisse théorique et écart
    y += 4;
    doc.setDrawColor(...LIGNE); doc.roundedRect(15, y, 180, 17, 2, 2, 'S');
    const aTheo = typeof c.theorique === 'number';
    const cases = aTheo ? [
      ['Caisse du matin', m(c.matin), ENCRE],
      ['Ventes espèces', m(c.ventesEspeces - (c.remboursementsEspeces || 0), { signe: true }), ENCRE],
      ['Mouvements', m((c.mouvements || []).reduce((a, x) => a + x.montant, 0), { signe: true }), ENCRE],
      ['Caisse théorique', m(c.theorique), ENCRE],
      ['Écart de caisse', c.ecartTheorique ? m(c.ecartTheorique, { signe: true }) : 'juste', c.ecartTheorique ? ORANGE : VERT],
    ] : [['Écart de caisse', 'non calculé (ventes Square indisponibles)', GRIS]];
    const lw = 180 / cases.length;
    cases.forEach(([l, v, col], i) => {
      const x = 15 + i * lw + 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); couleur(doc, GRIS);
      doc.text(l.toUpperCase(), x, y + 5.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); couleur(doc, col);
      doc.text(v, x, y + 12.5);
    });
    y += 17;
    if (aTheo && c.mouvements && c.mouvements.length) {
      y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); couleur(doc, GRIS);
      doc.text(doc.splitTextToSize('Mouvements exceptionnels : ' + c.mouvements.map(x => m(x.montant, { signe: true }) + (x.motif ? ' ' + x.motif : '')).join(' ; '), 180).slice(0, 2), 15, y);
      y += 3;
    }
    if (!c.fondExact) {
      y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); couleur(doc, ORANGE);
      doc.text(`Attention : fond de caisse de ${m(c.fond)} au lieu de ${m(FOND_DE_CAISSE)} (enregistré après confirmation).`, 15, y);
    }
    y += 9;
  }
  observations(doc, y, c.observation);
  piedDePage(doc, `Caisse Joséphine · comptage ${c.id} · enregistré le ${dateCourte(c.date)} à ${c.heure} (heure de Paris) · document non modifiable`);
  return doc.output('blob');
}

/** Récapitulatif sur une période : une ligne par comptage, total des enveloppes. */
export function pdfRecap(liste, debut, fin) {
  const doc = nouveauDoc();
  const titre = 'JOSÉPHINE – RÉCAPITULATIF DES COMPTAGES DE CAISSE';
  const st = `Du ${dateLongue(debut)} au ${dateLongue(fin)}`;
  let y = entete(doc, titre, st);
  const tri = [...liste].sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  const cols = [
    { titre: 'Date', x: 17 }, { titre: 'Heure', x: 42 }, { titre: 'Type', x: 58 }, { titre: 'Personne', x: 80 },
    { titre: 'Total compté', x: 136, align: 'right' }, { titre: 'Écart', x: 162, align: 'right' }, { titre: 'Mis au coffre', x: 193, align: 'right' },
  ];
  let totalCoffre = 0, nbEcarts = 0;
  const lignes = tri.map(c => {
    const e = c.type === 'ouverture' ? c.ecart : (typeof c.ecartTheorique === 'number' ? c.ecartTheorique : 0);
    if (e) nbEcarts++;
    if (c.type === 'cloture') totalCoffre += c.enveloppe;
    return {
      cells: [dateCourte(c.date), c.heure.slice(0, 5), typeLibelle(c.type), (c.prenom || '—').slice(0, 22),
        m(c.total), e ? m(e, { signe: true }) : '—', c.type === 'cloture' ? m(c.enveloppe) : ''],
      ecart: !!e,
    };
  });
  const parPage = 30;
  if (!lignes.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); couleur(doc, GRIS);
    doc.text('Aucun comptage sur cette période.', 15, y + 6); y += 14;
  }
  for (let i = 0; i < lignes.length; i += parPage) {
    if (i > 0) { doc.addPage(); y = entete(doc, titre, st); }
    const bloc = lignes.slice(i, i + parPage);
    const couleurs = {};
    bloc.forEach((l, j) => { if (l.ecart) couleurs[`${j},5`] = ORANGE; });
    y = tableau(doc, y, cols, bloc.map(l => l.cells), { fond: bloc.map((_, j) => j).filter(j => j % 2), couleurs, rowH: 7 });
  }
  if (y > 250) { doc.addPage(); y = entete(doc, titre, st); }
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); couleur(doc, GRIS);
  doc.text(`${tri.length} comptage(s) · ${nbEcarts} écart(s) · pour une clôture, l'écart est la différence entre la caisse comptée et la caisse théorique.`, 15, y);
  y += 5;
  doc.setFillColor(...ROUGE); doc.roundedRect(15, y, 180, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(255, 255, 255);
  doc.text('TOTAL DES ENVELOPPES MISES AU COFFRE SUR LA PÉRIODE', 20, y + 10.5);
  doc.setFontSize(18); doc.text(m(totalCoffre), 190, y + 11.5, { align: 'right' });
  piedDePage(doc, `Caisse Joséphine · récapitulatif du ${dateCourte(debut)} au ${dateCourte(fin)} · heure de Paris`);
  return doc.output('blob');
}

/** Feuille de partage de l'iPad (Fichiers, e-mail, AirDrop) ; téléchargement en secours. */
export async function partagerFichier(blob, nom, type = 'application/pdf') {
  const fichier = new File([blob], nom, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: nom });
      return 'partage';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'annule';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  return 'telecharge';
}
