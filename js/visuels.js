/* Représentations sobres des pièces et billets (SVG, sans reproduire les vrais). */

const PIECE = {
  1: { r: 15, t: 'cuivre', txt: '1', u: 'c' },
  2: { r: 17, t: 'cuivre', txt: '2', u: 'c' },
  5: { r: 19, t: 'cuivre', txt: '5', u: 'c' },
  10: { r: 17.5, t: 'or', txt: '10', u: 'c' },
  20: { r: 19.5, t: 'or', txt: '20', u: 'c' },
  50: { r: 21.5, t: 'or', txt: '50', u: 'c' },
  100: { r: 20.5, t: 'bi1', txt: '1', u: '€' },
  200: { r: 23, t: 'bi2', txt: '2', u: '€' },
};
const TEINTES = {
  cuivre: ['#E7A77E', '#B8683D', '#7E3F1E'],
  or: ['#F3DC8B', '#CFA640', '#7D5E14'],
  argent: ['#EEF0F1', '#B9BEC2', '#5D6368'],
};

function disque(id, cx, cy, r, [clair, fonce]) {
  return `<defs><radialGradient id="${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${clair}"/><stop offset="1" stop-color="${fonce}"/></radialGradient></defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
}

export function svgPiece(v) {
  const p = PIECE[v];
  const c = 25, id = 'p' + v;
  let corps;
  if (p.t === 'bi1' || p.t === 'bi2') {
    const ext = p.t === 'bi1' ? TEINTES.or : TEINTES.argent;
    const int = p.t === 'bi1' ? TEINTES.argent : TEINTES.or;
    corps = disque(id + 'e', c, c, p.r, ext) + disque(id + 'i', c, c, p.r * 0.68, int) +
      `<circle cx="${c}" cy="${c}" r="${p.r * 0.68}" fill="none" stroke="${ext[2]}" stroke-opacity=".35" stroke-width=".8"/>`;
  } else {
    const t = TEINTES[p.t];
    corps = disque(id, c, c, p.r, t) +
      `<circle cx="${c}" cy="${c}" r="${p.r - 2.2}" fill="none" stroke="${t[2]}" stroke-opacity=".35" stroke-width=".8"/>`;
  }
  const encre = p.t === 'bi1' ? '#3F4448' : p.t === 'bi2' ? '#5A4410' : TEINTES[p.t][2];
  const fs = p.txt.length > 1 ? p.r * 0.72 : p.r * 0.95;
  return `<svg viewBox="0 0 50 50" aria-hidden="true" class="visuel piece">${corps}
    <circle cx="${c}" cy="${c}" r="${p.r}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1"/>
    <text x="${c}" y="${c + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${encre}" font-family="-apple-system,system-ui,sans-serif">${p.txt}<tspan font-size="${fs * 0.55}" dx="0.5">${p.u}</tspan></text></svg>`;
}

const BILLET = {
  500: ['#A9B3B8', '#6F7C83'],
  1000: ['#E39A8E', '#B54B3E'],
  2000: ['#8FB1E0', '#3E67A8'],
  5000: ['#F1B27A', '#C46A22'],
};

export function svgBillet(v) {
  const [clair, fonce] = BILLET[v];
  const n = v / 100;
  return `<svg viewBox="0 0 80 46" aria-hidden="true" class="visuel billet">
    <rect x="1" y="3" width="78" height="40" rx="4" fill="${clair}"/>
    <rect x="1" y="3" width="20" height="40" rx="4" fill="${fonce}" opacity=".85"/>
    <rect x="17" y="3" width="4" height="40" fill="${fonce}" opacity=".85"/>
    <circle cx="58" cy="23" r="13" fill="#fff" opacity=".28"/>
    <rect x="1" y="3" width="78" height="40" rx="4" fill="none" stroke="#000" stroke-opacity=".15"/>
    <text x="11" y="28.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="-apple-system,system-ui,sans-serif">€</text>
    <text x="50" y="30.5" text-anchor="middle" font-size="20" font-weight="800" fill="${fonce}" font-family="-apple-system,system-ui,sans-serif">${n}</text>
    <text x="73" y="12.5" text-anchor="end" font-size="6.5" font-weight="700" fill="${fonce}" font-family="-apple-system,system-ui,sans-serif">${n}</text></svg>`;
}

export function visuel(v) { return v >= 500 ? svgBillet(v) : svgPiece(v); }
