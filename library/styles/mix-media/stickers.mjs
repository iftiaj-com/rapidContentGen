// Vintage collage stickers for the mix-media pack: illustrated, never photographic (Hi.Boly rule:
// props are illustrated, Boly is the only photograph). Each kind returns { w, h, art } in its own
// viewBox units; the pack wraps it in one SVG with a shared filter (hand-cut wobble, paper grain,
// white die-cut border) and scales it to the requested size. Inks and fills follow the pack's
// palette zones (style.json): warm accents for stickers, cool accents for highlights, vintage
// sepia / faded red / old gold for printed matter. Fully deterministic: variation comes from
// the seeded rnd passed in.

export const C = {
  ink: '#3a2a1f', paper: '#f7f0dd', cream: '#f2e6c8', white: '#fbf8f1', pink: '#eaa5b2', rose: '#d9788b',
  butter: '#f2d06b', peach: '#f0b089', mint: '#9fcfb4', sage: '#8fa878', blue: '#8eadd0', dusty: '#7d97b8',
  lavender: '#b7a5d9', red: '#c45a4b', gold: '#c9a24c', sepia: '#a47d55', brown: '#7a5536', kraft: '#c49a6c',
  grey: '#8a8580', dark: '#3b3531', black: '#2b2622',
};

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fillOf = (color, fallback) => (color && C[color] ? C[color] : (/^#|^rgb/.test(String(color || '')) ? color : fallback));
const S = (w = 4) => `stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function starPts(cx, cy, R, r, n, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rr = i % 2 ? r : R;
    pts.push(`${r1(cx + Math.cos(a) * rr)},${r1(cy + Math.sin(a) * rr)}`);
  }
  return pts.join(' ');
}

/** An image inside a clip shape (polaroid, stamp, frame). href is a job-relative path. */
const image = (id, href, x, y, w, h, clip, tone = 'sepia(0.18) saturate(0.9) contrast(0.96)') => `
    <clipPath id="${id}"><${clip}/></clipPath>
    <image href="${esc(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" style="filter: ${tone}"/>`;

export const KINDS = {
  star: ({ color, id }) => {
    const pat = color === 'gingham'
      ? `<defs><pattern id="${id}-g" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#fbf1f1"/><rect width="9" height="18" fill="${C.pink}" opacity="0.6"/><rect width="18" height="9" fill="${C.pink}" opacity="0.6"/></pattern></defs>`
      : color === 'glitter'
        ? `<defs><pattern id="${id}-g" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${C.butter}"/><circle cx="3" cy="3" r="1.6" fill="${C.gold}"/><circle cx="8" cy="7" r="1.1" fill="#fff6d0"/></pattern></defs>`
        : '';
    const fill = pat ? `url(#${id}-g)` : fillOf(color, C.butter);
    return { w: 200, h: 200, art: `${pat}
    <polygon points="${starPts(100, 106, 92, 40, 5)}" fill="${fill}" ${S(4.5)}/>
    <polygon points="${starPts(100, 106, 70, 30, 5)}" fill="none" ${S(2.2)} stroke-dasharray="7 6" opacity="0.65"/>` };
  },
  heart: ({ color }) => ({ w: 200, h: 190, art: `
    <path d="M100 178 C 40 132 8 98 18 60 C 28 22 78 16 100 54 C 122 16 172 22 182 60 C 192 98 160 132 100 178 Z" fill="${fillOf(color, C.pink)}" ${S(4.5)}/>
    <path d="M44 62 C 48 46 62 38 76 42" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.55"/>` }),
  flower: ({ color }) => {
    const petals = Array.from({ length: 6 }, (_, k) => `<ellipse cx="100" cy="54" rx="27" ry="44" transform="rotate(${k * 60} 100 100)" fill="${fillOf(color, C.peach)}" ${S(3.5)}/>`).join('');
    return { w: 200, h: 200, art: `${petals}
    <circle cx="100" cy="100" r="25" fill="${C.butter}" ${S(3.5)}/>
    ${[0, 72, 144, 216, 288].map((a) => `<circle cx="${r1(100 + Math.cos(a * Math.PI / 180) * 11)}" cy="${r1(100 + Math.sin(a * Math.PI / 180) * 11)}" r="3" fill="${C.ink}"/>`).join('')}` };
  },
  pressed: ({ color }) => ({ w: 160, h: 250, art: `
    <path d="M82 246 C 78 200 90 150 82 92" fill="none" stroke="${C.sage}" stroke-width="5" stroke-linecap="round"/>
    <path d="M82 190 C 50 182 34 158 38 140 C 60 146 78 166 82 190 Z" fill="${C.sage}" opacity="0.9" ${S(2)}/>
    <path d="M84 158 C 112 150 128 128 124 110 C 102 118 88 136 84 158 Z" fill="${C.sage}" opacity="0.9" ${S(2)}/>
    <path d="M60 158 L 80 184 M104 128 L 86 154" stroke="${C.ink}" stroke-width="1.5" opacity="0.6"/>
    ${Array.from({ length: 5 }, (_, k) => `<ellipse cx="82" cy="58" rx="14" ry="27" transform="rotate(${k * 72} 82 80)" fill="${fillOf(color, C.lavender)}" opacity="0.92" ${S(2.2)}/>`).join('')}
    <circle cx="82" cy="80" r="10" fill="${C.butter}" ${S(2.2)}/>` }),
  sparkle: ({ color }) => ({ w: 200, h: 200, art: `
    <path d="M100 8 C 108 72 128 92 192 100 C 128 108 108 128 100 192 C 92 128 72 108 8 100 C 72 92 92 72 100 8 Z" fill="${fillOf(color, C.butter)}" ${S(4)}/>` }),
  camera: () => ({ w: 250, h: 180, art: `
    <rect x="150" y="16" width="56" height="30" rx="5" fill="${C.cream}" ${S(3.5)}/>
    <rect x="40" y="26" width="30" height="16" rx="3" fill="${C.red}" ${S(3)}/>
    <rect x="10" y="40" width="230" height="128" rx="16" fill="${C.dark}" ${S(4)}/>
    <rect x="10" y="40" width="230" height="36" rx="12" fill="${C.cream}" ${S(3.5)}/>
    ${Array.from({ length: 12 }, (_, k) => `<path d="M${22 + k * 18} 96 l 8 0 M${16 + k * 18} 120 l 8 0 M${22 + k * 18} 144 l 8 0" stroke="#5a4c42" stroke-width="2"/>`).join('')}
    <circle cx="125" cy="112" r="50" fill="${C.black}" ${S(4)}/>
    <circle cx="125" cy="112" r="36" fill="${C.grey}" ${S(3)}/>
    <circle cx="125" cy="112" r="23" fill="${C.dusty}" ${S(3)}/>
    <ellipse cx="116" cy="102" rx="8" ry="5" fill="#fff" opacity="0.7" transform="rotate(-30 116 102)"/>
    <circle cx="214" cy="58" r="7" fill="${C.butter}" ${S(2.5)}/>` }),
  boat: ({ color }) => ({ w: 250, h: 180, art: `
    <polygon points="125,12 125,98 58,98" fill="${C.paper}" ${S(4)}/>
    <polygon points="125,12 192,98 125,98" fill="${C.cream}" ${S(4)}/>
    <polygon points="14,98 236,98 190,162 60,162" fill="${fillOf(color, C.blue)}" ${S(4)}/>
    <path d="M60 162 L 125 98 L 190 162" fill="none" ${S(2.5)} opacity="0.6"/>` }),
  plane: () => ({ w: 250, h: 160, art: `
    <polygon points="10,70 240,16 96,102" fill="${C.white}" ${S(4)}/>
    <polygon points="96,102 240,16 118,150" fill="${C.cream}" ${S(4)}/>
    <polygon points="96,102 240,16 104,122" fill="#e6dcc6" ${S(3)}/>` }),
  balloon: ({ id }) => ({ w: 200, h: 270, art: `
    <defs><clipPath id="${id}-env"><path d="M100 10 C 40 10 14 58 22 104 C 30 146 70 170 82 198 L 118 198 C 130 170 170 146 178 104 C 186 58 160 10 100 10 Z"/></clipPath></defs>
    <g clip-path="url(#${id}-env)">
      <rect x="0" y="0" width="200" height="210" fill="${C.cream}"/>
      <ellipse cx="100" cy="104" rx="82" ry="118" fill="${C.red}"/>
      <ellipse cx="100" cy="104" rx="58" ry="118" fill="${C.cream}"/>
      <ellipse cx="100" cy="104" rx="34" ry="118" fill="${C.butter}"/>
      <ellipse cx="100" cy="104" rx="12" ry="118" fill="${C.cream}"/>
    </g>
    <path d="M100 10 C 40 10 14 58 22 104 C 30 146 70 170 82 198 L 118 198 C 130 170 170 146 178 104 C 186 58 160 10 100 10 Z" fill="none" ${S(4.5)}/>
    <path d="M84 198 L 86 226 M116 198 L 114 226" ${S(2.5)}/>
    <rect x="78" y="226" width="44" height="34" rx="4" fill="${C.brown}" ${S(3.5)}/>
    <path d="M80 238 H 120 M80 249 H 120" stroke="#5c3d26" stroke-width="2"/>` }),
  map: () => ({ w: 250, h: 190, art: `
    <polygon points="10,22 88,10 88,178 10,166" fill="${C.cream}" ${S(3.5)}/>
    <polygon points="88,10 164,24 164,180 88,178" fill="#e7d9b5" ${S(3.5)}/>
    <polygon points="164,24 240,12 240,168 164,180" fill="${C.cream}" ${S(3.5)}/>
    <path d="M150 40 C 190 36 218 60 230 52 L 236 98 C 210 104 184 86 160 96 Z" fill="${C.blue}" opacity="0.6"/>
    <path d="M14 120 C 50 100 70 140 110 120 S 180 140 236 118" fill="none" stroke="${C.sepia}" stroke-width="3"/>
    <path d="M20 60 C 60 70 100 40 140 66" fill="none" stroke="${C.sepia}" stroke-width="2.5"/>
    <path d="M34 150 C 70 120 110 160 150 110 S 196 70 212 80" fill="none" stroke="${C.red}" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"/>
    <circle cx="34" cy="150" r="6" fill="${C.red}"/>
    <path d="M204 70 l 16 16 M220 70 l -16 16" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/>` }),
  stamp: ({ id, img, text }) => {
    const holes = [];
    for (let x = 10; x <= 170; x += 16) holes.push(`<circle cx="${x}" cy="0" r="6"/><circle cx="${x}" cy="220" r="6"/>`);
    for (let y = 10; y <= 210; y += 16) holes.push(`<circle cx="0" cy="${y}" r="6"/><circle cx="180" cy="${y}" r="6"/>`);
    const inner = img ? image(`${id}-si`, img, 18, 18, 144, 184, 'rect x="18" y="18" width="144" height="184"')
      : `<rect x="18" y="18" width="144" height="184" fill="${C.blue}"/><circle cx="120" cy="70" r="20" fill="${C.butter}"/><path d="M18 170 C 60 120 90 150 120 128 S 150 120 162 132 V 202 H 18 Z" fill="${C.sage}"/>`;
    return { w: 180, h: 220, art: `
    <defs><mask id="${id}-pm"><rect width="180" height="220" fill="#fff"/><g fill="#000">${holes.join('')}</g></mask></defs>
    <rect width="180" height="220" fill="${C.white}" mask="url(#${id}-pm)"/>
    ${inner}
    <rect x="18" y="18" width="144" height="184" fill="none" ${S(2.5)}/>
    <text x="28" y="50" font-family="EB Garamond" font-weight="700" font-size="30" fill="${C.ink}">${esc(text || '25')}</text>
    <g fill="none" stroke="${C.ink}" stroke-width="2" opacity="0.45"><circle cx="150" cy="178" r="34"/><circle cx="150" cy="178" r="26"/><path d="M96 168 q 10 -8 20 0 t 20 0 t 20 0 M96 184 q 10 -8 20 0 t 20 0 t 20 0"/></g>` };
  },
  ticket: ({ id, color, text }) => {
    const [main, num] = String(text || 'ADMIT ONE|No. 0417').split('|');
    return { w: 270, h: 120, art: `
    <defs><mask id="${id}-tm"><rect width="270" height="120" fill="#fff"/><circle cx="0" cy="60" r="16" fill="#000"/><circle cx="270" cy="60" r="16" fill="#000"/></mask></defs>
    <rect width="270" height="120" rx="6" fill="${fillOf(color, '#dc9a7e')}" mask="url(#${id}-tm)"/>
    <rect x="12" y="10" width="246" height="100" rx="4" fill="none" stroke="${C.ink}" stroke-width="1.6" opacity="0.7"/>
    <path d="M196 14 V 106" stroke="${C.ink}" stroke-width="2" stroke-dasharray="6 6" opacity="0.7"/>
    <text x="104" y="66" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="28" letter-spacing="2" fill="${C.ink}">${esc(main)}</text>
    <text x="104" y="92" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="15" letter-spacing="3" fill="${C.ink}" opacity="0.8">${esc(num || '')}</text>
    <text x="233" y="60" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="16" fill="${C.ink}" transform="rotate(-90 233 60)">${esc((num || '').replace(/[^0-9]/g, '') || '0417')}</text>` };
  },
  polaroid: ({ id, img, text, family }) => ({ w: 220, h: 262, art: `
    <rect width="220" height="262" rx="3" fill="#fbfaf5"/>
    <rect x="0.75" y="0.75" width="218.5" height="260.5" rx="3" fill="none" stroke="#d6cfbf" stroke-width="1.5"/>
    ${img ? image(`${id}-pi`, img, 14, 14, 192, 192, 'rect x="14" y="14" width="192" height="192"') : `<rect x="14" y="14" width="192" height="192" fill="${C.dusty}"/><circle cx="150" cy="70" r="22" fill="${C.butter}"/>`}
    <rect x="14" y="14" width="192" height="192" fill="none" stroke="#00000022" stroke-width="1"/>
    ${text ? `<text x="110" y="244" text-anchor="middle" font-family="${family}" font-weight="500" font-size="28" fill="${C.ink}">${esc(text)}</text>` : ''}` }),
  postcard: ({ text, family }) => ({ w: 300, h: 200, art: `
    <rect width="300" height="200" rx="4" fill="${C.cream}" ${S(2.5)}/>
    <text x="16" y="30" font-family="EB Garamond" font-weight="700" font-size="16" letter-spacing="5" fill="${C.sepia}">POST CARD</text>
    <path d="M160 46 V 184" stroke="${C.sepia}" stroke-width="2"/>
    <path d="M176 120 H 284 M176 146 H 284 M176 172 H 284" stroke="${C.sepia}" stroke-width="1.8"/>
    <rect x="240" y="14" width="46" height="56" fill="${C.pink}" ${S(2)} stroke-dasharray="4 3"/>
    ${text ? `<text x="18" y="88" font-family="${family}" font-weight="500" font-size="26" fill="${C.ink}">${esc(text)}</text>` : ''}` }),
  film: () => ({ w: 210, h: 170, art: `
    <rect x="100" y="54" width="104" height="54" fill="${C.dark}" ${S(3)}/>
    ${Array.from({ length: 6 }, (_, k) => `<rect x="${108 + k * 16}" y="58" width="8" height="8" fill="${C.cream}"/><rect x="${108 + k * 16}" y="96" width="8" height="8" fill="${C.cream}"/>`).join('')}
    <rect x="20" y="32" width="88" height="118" rx="8" fill="${C.black}" ${S(4)}/>
    <rect x="20" y="62" width="88" height="54" fill="${C.butter}" ${S(3)}/>
    <rect x="20" y="80" width="88" height="14" fill="${C.red}"/>
    <rect x="48" y="14" width="32" height="20" rx="4" fill="${C.grey}" ${S(3)}/>` }),
  envelope: ({ color }) => ({ w: 240, h: 160, art: `
    <rect x="8" y="8" width="224" height="144" rx="4" fill="${fillOf(color, C.cream)}" ${S(4)}/>
    <path d="M8 12 L 120 92 L 232 12" fill="none" ${S(3.5)}/>
    <path d="M8 152 L 92 74 M232 152 L 148 74" fill="none" ${S(2.5)} opacity="0.55"/>
    <circle cx="120" cy="92" r="15" fill="${C.red}" ${S(3)}/>
    <rect x="190" y="24" width="30" height="36" fill="${C.pink}" ${S(2)}/>` }),
  clock: () => ({ w: 200, h: 200, art: `
    <circle cx="100" cy="100" r="92" fill="${C.butter}" ${S(4.5)}/>
    <circle cx="100" cy="100" r="74" fill="${C.cream}" ${S(2.5)}/>
    ${[['12', 100, 50], ['3', 154, 109], ['6', 100, 166], ['9', 46, 109]].map(([t, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="24" fill="${C.red}">${t}</text>`).join('')}
    ${Array.from({ length: 12 }, (_, k) => { const a = k * 30 * Math.PI / 180; return `<path d="M${r1(100 + Math.sin(a) * 64)} ${r1(100 - Math.cos(a) * 64)} L ${r1(100 + Math.sin(a) * 70)} ${r1(100 - Math.cos(a) * 70)}" stroke="${C.ink}" stroke-width="2.5"/>`; }).join('')}
    <path d="M100 100 L 100 56" stroke="${C.red}" stroke-width="6" stroke-linecap="round"/>
    <path d="M100 100 L 138 112" stroke="${C.red}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="6" fill="${C.ink}"/>` }),
  cup: () => ({ w: 170, h: 240, art: `
    <path d="M58 34 C 50 18 70 14 64 2 M100 34 C 92 16 114 12 106 0" fill="none" stroke="${C.sepia}" stroke-width="3.5" stroke-linecap="round" opacity="0.8"/>
    <polygon points="30,62 140,62 124,226 46,226" fill="${C.white}" ${S(4)}/>
    <polygon points="38,112 132,112 127,166 43,166" fill="${C.kraft}" ${S(3.5)}/>
    <path d="M85 150 C 70 140 72 126 80 126 C 84 126 85 130 85 132 C 85 130 86 126 90 126 C 98 126 100 140 85 150 Z" fill="${C.red}" opacity="0.85"/>
    <rect x="22" y="44" width="126" height="20" rx="6" fill="#efe9de" ${S(3.5)}/>
    <path d="M40 44 C 44 32 126 32 130 44" fill="#efe9de" ${S(3.5)}/>` }),
  phone: () => ({ w: 190, h: 250, art: `
    <path d="M26 70 q -10 20 0 40 M12 60 q -14 30 0 60 M164 70 q 10 20 0 40 M178 60 q 14 30 0 60" fill="none" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round" opacity="0.75"/>
    <rect x="34" y="10" width="122" height="230" rx="20" fill="${C.dark}" ${S(4)}/>
    <rect x="44" y="34" width="102" height="176" rx="6" fill="#d8ebe0"/>
    <rect x="54" y="52" width="72" height="30" rx="12" fill="${C.pink}" ${S(2)}/>
    <rect x="66" y="94" width="70" height="26" rx="11" fill="${C.white}" ${S(2)}/>
    <rect x="54" y="132" width="60" height="26" rx="11" fill="${C.pink}" ${S(2)}/>
    <circle cx="95" cy="224" r="6" fill="${C.grey}"/>` }),
  oval: ({ id, img }) => ({ w: 180, h: 232, art: `
    <ellipse cx="90" cy="116" rx="86" ry="112" fill="${C.gold}" ${S(3.5)}/>
    <ellipse cx="90" cy="116" rx="76" ry="102" fill="none" stroke="#f3dc93" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
    ${img ? image(`${id}-oi`, img, 22, 26, 136, 180, 'ellipse cx="90" cy="116" rx="66" ry="90"') : `<ellipse cx="90" cy="116" rx="66" ry="90" fill="${C.cream}"/>`}
    <ellipse cx="90" cy="116" rx="66" ry="90" fill="none" ${S(3)}/>` }),
  label: ({ text, color }) => ({ w: 270, h: 110, art: `
    <rect x="4" y="4" width="262" height="102" rx="22" fill="${fillOf(color, C.cream)}" ${S(3.5)}/>
    <rect x="14" y="14" width="242" height="82" rx="15" fill="none" stroke="${C.red}" stroke-width="2.5"/>
    <text x="135" y="68" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="32" letter-spacing="1" fill="${C.ink}">${esc(text || 'MEMORIES')}</text>` }),
  calendar: ({ text, color }) => {
    const [day, num] = String(text || 'MON|12').split('|');
    return { w: 180, h: 210, art: `
    <rect x="8" y="16" width="164" height="186" rx="8" fill="${C.white}" ${S(4)}/>
    <path d="M8 66 V 28 a 12 12 0 0 1 12 -12 H 160 a 12 12 0 0 1 12 12 V 66 Z" fill="${fillOf(color, C.red)}" ${S(4)}/>
    <text x="90" y="54" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="30" letter-spacing="4" fill="${C.white}">${esc(day)}</text>
    <text x="90" y="166" text-anchor="middle" font-family="EB Garamond" font-weight="700" font-size="88" fill="${C.ink}">${esc(num || '')}</text>
    <rect x="44" y="4" width="12" height="26" rx="6" fill="${C.grey}" ${S(2.5)}/>
    <rect x="124" y="4" width="12" height="26" rx="6" fill="${C.grey}" ${S(2.5)}/>` };
  },
  flag: ({ color }) => ({ w: 170, h: 60, art: `
    <rect x="4" y="4" width="112" height="52" fill="${fillOf(color, C.mint)}"/>
    <rect x="116" y="4" width="50" height="52" fill="${fillOf(color, C.mint)}" opacity="0.45"/>` }),
  cloud: ({ color }) => ({ w: 240, h: color === 'rain' ? 230 : 160, art: `
    <path d="M48 132 C 14 132 8 92 36 84 C 30 46 76 30 98 54 C 110 20 168 18 176 60 C 214 54 234 96 206 120 C 214 136 196 140 186 132 Z" fill="#e9eef2" ${S(4)}/>
    ${color === 'rain' ? [40, 80, 120, 160, 200].map((x, k) => `<path d="M${x} ${158 + (k % 2) * 22} c -6 10 -6 16 0 18 c 6 -2 6 -8 0 -18 Z" fill="${C.blue}" ${S(2)}/>`).join('') : ''}` }),
  butterfly: ({ color }) => ({ w: 230, h: 180, art: `
    <path d="M115 90 C 70 10 10 20 24 74 C 32 104 86 100 115 90 Z" fill="${fillOf(color, C.pink)}" ${S(3.5)}/>
    <path d="M115 90 C 160 10 220 20 206 74 C 198 104 144 100 115 90 Z" fill="${fillOf(color, C.pink)}" ${S(3.5)}/>
    <path d="M115 92 C 80 104 44 120 60 150 C 76 172 104 130 115 92 Z" fill="${C.lavender}" ${S(3.5)}/>
    <path d="M115 92 C 150 104 186 120 170 150 C 154 172 126 130 115 92 Z" fill="${C.lavender}" ${S(3.5)}/>
    <circle cx="60" cy="60" r="8" fill="${C.white}" ${S(2)}/><circle cx="170" cy="60" r="8" fill="${C.white}" ${S(2)}/>
    <ellipse cx="115" cy="96" rx="7" ry="36" fill="${C.ink}"/>
    <path d="M112 62 C 104 40 92 34 86 36 M118 62 C 126 40 138 34 144 36" fill="none" ${S(2.5)}/>` }),
};

export const KIND_NAMES = Object.keys(KINDS);

/** The shared sticker filter: hand-cut wobble, paper grain, white die-cut border (rounded). */
export function stickerFilter(fid, seed, border = 7, grain = true) {
  return `
    <filter id="${fid}" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed}" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="art"/>
      ${grain ? `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed + 11}" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 -1.6 0.62" result="speck"/>
      <feComposite in="speck" in2="art" operator="in" result="grain"/>
      <feMerge result="tex"><feMergeNode in="art"/><feMergeNode in="grain"/></feMerge>` : '<feMerge result="tex"><feMergeNode in="art"/></feMerge>'}
      <feGaussianBlur in="art" stdDeviation="${r1(border * 0.55)}" result="soft"/>
      <feComponentTransfer in="soft" result="dil"><feFuncA type="linear" slope="14" intercept="-0.6"/></feComponentTransfer>
      <feFlood flood-color="#fbf8f1" result="white"/>
      <feComposite in="white" in2="dil" operator="in" result="border"/>
      <feMerge><feMergeNode in="border"/><feMergeNode in="tex"/></feMerge>
    </filter>`;
}
