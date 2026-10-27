// Sohbet partneri karakterleri: görünüş, kişilik, Canlı mod sesi ve Klasik moddaki ses tonu.
// Hepsi aynı iskeleti kullanır (kaşlar, gözler, ağız, eller); duruma göre CSS canlandırır:
// dinlerken eli kulağında, düşünürken eli çenesinde, konuşurken eller ve kaşlar sesle oynar.
export const CHARACTERS = [
  {
    id: 'sam',
    name: 'Sam',
    kind: 'human',
    hair: 'short',
    desc: 'Sıcak ve meraklı. Her konuda sohbet eder.',
    voice: 'Puck',
    pitch: 1,
    persona: 'a warm, curious and well-informed English conversation partner',
    colors: { skin: '#f3c9a6', shade: '#e0a882', hair: '#3a2a22', shirt: '#5a78f5', shirt2: '#3f5bd6', eye: '#1e2330', cheek: '#f4988a', mouth: '#4a2430' },
  },
  {
    id: 'mia',
    name: 'Mia',
    kind: 'human',
    hair: 'bun',
    desc: 'Enerjik ve neşeli. Seyahat, müzik ve yemek sever.',
    voice: 'Aoede',
    pitch: 1.12,
    persona: 'an energetic, cheerful and encouraging English conversation partner who loves travel, music and food',
    colors: { skin: '#eebd96', shade: '#d69c74', hair: '#7c3a1d', shirt: '#ef6f6c', shirt2: '#cf4f4c', eye: '#2a1d18', cheek: '#f38b8b', mouth: '#5a2430' },
  },
  {
    id: 'robo',
    name: 'Robo',
    kind: 'robot',
    desc: 'Esprili bir robot. Bilim, teknoloji ve ilginç bilgiler anlatır.',
    voice: 'Charon',
    pitch: 0.85,
    persona: 'a friendly, nerdy robot and English conversation partner with a dry sense of humour who loves science, technology and fun facts. Now and then make a light robot joke, but keep the focus on the learner',
    colors: { skin: '#cfd8e6', shade: '#93a1b8', hair: '#3a4456', shirt: '#7f8ca6', shirt2: '#5f6b85', eye: '#3fe0ff', cheek: '#3fe0ff', mouth: '#3fe0ff' },
  },
  {
    id: 'mochi',
    name: 'Mochi',
    kind: 'cat',
    desc: 'Şakacı bir kedi. Yemeğe ve uykuya bayılır.',
    voice: 'Leda',
    pitch: 1.25,
    persona: 'a playful, witty cat and English conversation partner who loves food and naps. Now and then make a light cat joke, but keep the focus on the learner',
    colors: { skin: '#f3a65c', shade: '#d9853a', hair: '#b4652a', shirt: '#f3a65c', shirt2: '#4f6ef7', eye: '#2b2118', cheek: '#ff9aa2', mouth: '#5a2a2a' },
  },
];

export const characterOf = (settings) => CHARACTERS.find((c) => c.id === settings?.character) || CHARACTERS[0];

// ---------- Parçalar ----------

const HUMAN_BODY = `
  <rect x="104" y="166" width="32" height="40" rx="12" fill="var(--shade)"/>
  <path d="M30 280c0-54 40-82 90-82s90 28 90 82z" fill="var(--shirt)"/>
  <path d="M98 199l22 24 22-24" fill="none" stroke="var(--shirt2)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;

const BODIES = {
  human: HUMAN_BODY,
  robot: `
    <rect x="106" y="172" width="28" height="32" rx="6" fill="var(--shade)"/>
    <path d="M34 280c0-50 30-80 86-80s86 30 86 80z" fill="var(--shirt)"/>
    <rect x="88" y="222" width="64" height="36" rx="12" fill="var(--shirt2)"/>
    <circle class="robo-light" cx="104" cy="240" r="6" fill="var(--eye)"/>
    <circle cx="122" cy="240" r="6" fill="#ffd25a"/>
    <circle cx="140" cy="240" r="6" fill="#ff6b6b"/>`,
  cat: `
    <path d="M34 280c0-54 36-84 86-84s86 30 86 84z" fill="var(--skin)"/>
    <ellipse cx="120" cy="256" rx="42" ry="24" fill="#fff3e6"/>
    <path d="M80 200q40 26 80 0l-6 16q-34 22-68 0z" fill="var(--shirt2)"/>
    <circle cx="120" cy="224" r="7" fill="#ffd25a"/>`,
};

function headBack(c) {
  if (c.kind === 'robot') {
    return `
      <line x1="120" y1="52" x2="120" y2="22" stroke="var(--shade)" stroke-width="5" stroke-linecap="round"/>
      <circle class="robo-antenna" cx="120" cy="17" r="8" fill="#ff6b6b"/>
      <rect x="34" y="100" width="20" height="44" rx="8" fill="var(--shade)"/>
      <rect x="186" y="100" width="20" height="44" rx="8" fill="var(--shade)"/>`;
  }
  if (c.kind === 'cat') {
    return `
      <path d="M54 96l6-64 50 36z" fill="var(--skin)"/>
      <path d="M186 96l-6-64-50 36z" fill="var(--skin)"/>
      <path d="M66 82l4-34 28 22z" fill="#ffb4b8"/>
      <path d="M174 82l-4-34-28 22z" fill="#ffb4b8"/>`;
  }
  const ears = `
    <circle cx="49" cy="124" r="13" fill="var(--skin)"/>
    <circle cx="191" cy="124" r="13" fill="var(--skin)"/>`;
  if (c.hair === 'bun') {
    return `
      <path d="M50 116c-2 46 8 76 24 92h92c16-16 26-46 24-92z" fill="var(--hair)"/>
      <circle cx="120" cy="40" r="27" fill="var(--hair)"/>
      ${ears}`;
  }
  return ears;
}

function face(c, id) {
  if (c.kind === 'robot') {
    return `
      <defs>
        <linearGradient id="${id}-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:#eef2f8"/>
          <stop offset="1" style="stop-color:var(--skin)"/>
        </linearGradient>
      </defs>
      <rect x="50" y="50" width="140" height="138" rx="40" fill="url(#${id}-metal)"/>
      <rect x="64" y="90" width="112" height="44" rx="22" fill="#18202e"/>`;
  }
  return '<circle cx="120" cy="118" r="72" fill="var(--skin)"/>';
}

function headFront(c) {
  if (c.kind === 'cat') {
    return `
      <path d="M108 52l4 16M120 48v18M132 52l-4 16" stroke="var(--shade)" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="107" cy="148" rx="16" ry="12" fill="#fff3e6"/>
      <ellipse cx="133" cy="148" rx="16" ry="12" fill="#fff3e6"/>
      <path d="M113 136h14l-7 8z" fill="#ff8fa3"/>
      <path d="M86 142l-26-4M86 150l-26 4M154 142l26-4M154 150l26 4" stroke="var(--shade)" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  if (c.kind === 'robot') return '';
  const nose = '<ellipse cx="120" cy="130" rx="5" ry="4" fill="var(--shade)"/>';
  if (c.hair === 'bun') {
    return `
      <path d="M50 118c-6-54 32-80 72-78 42 2 76 30 68 78-8-20-22-34-38-40-6 14-26 22-46 20-14-1-26-8-32-16-12 8-20 20-24 36z" fill="var(--hair)"/>
      ${nose}`;
  }
  return `
    <path d="M49 112c-5-52 35-74 73-72 40 2 74 26 69 68-15-20-35-32-61-32-26 0-48 10-64 24-7 6-12 9-17 12z" fill="var(--hair)"/>
    <path d="M100 78q16-16 38-6-18 2-28 16z" fill="var(--hair)"/>
    ${nose}`;
}

function hand(c, side) {
  const mirror = side === 'r' ? ' transform="scale(-1 1)"' : '';
  let shape;
  if (c.kind === 'robot') {
    shape = `
      <circle r="17" fill="var(--skin)" stroke="var(--shade)" stroke-width="3"/>
      <circle r="6" fill="var(--shade)"/>
      <rect x="9" y="-18" width="8" height="14" rx="4" fill="var(--skin)" stroke="var(--shade)" stroke-width="2.5"/>`;
  } else if (c.kind === 'cat') {
    shape = `
      <circle r="17" fill="var(--skin)"/>
      <ellipse cx="0" cy="4" rx="7" ry="6" fill="#ffb4b8"/>
      <circle cx="-8" cy="-6" r="3.4" fill="#ffb4b8"/>
      <circle cx="0" cy="-9" r="3.4" fill="#ffb4b8"/>
      <circle cx="8" cy="-6" r="3.4" fill="#ffb4b8"/>`;
  } else {
    shape = `
      <ellipse cx="13" cy="-6" rx="6" ry="9" fill="var(--skin)" transform="rotate(30 13 -6)"/>
      <circle r="17" fill="var(--skin)"/>
      <path d="M-8-5v9M0-8v11M8-5v9" stroke="var(--shade)" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  return `<g class="hand hand-${side}"><g class="hand-shape"><g${mirror}>${shape}</g></g></g>`;
}

let instances = 0;

export function characterSVG(c) {
  const id = `char${++instances}`;
  const vars = Object.entries(c.colors).map(([key, value]) => `--${key}:${value}`).join(';');
  return `
<svg class="char char-${c.kind}" viewBox="0 0 240 280" style="${vars}" aria-hidden="true">
  <circle class="char-glow" cx="120" cy="140" r="112"/>
  <g class="char-all">
    ${BODIES[c.kind]}
    <g class="char-head">
      ${headBack(c)}
      ${face(c, id)}
      ${headFront(c)}
      <g class="char-brows">
        <rect class="brow brow-l" x="80" y="${c.kind === 'robot' ? 76 : 82}" width="28" height="7" rx="3.5"/>
        <rect class="brow brow-r" x="132" y="${c.kind === 'robot' ? 76 : 82}" width="28" height="7" rx="3.5"/>
      </g>
      <g class="char-look">
        <g class="char-eyes">
          <ellipse cx="96" cy="111" rx="8.5" ry="10.5"/>
          <ellipse cx="144" cy="111" rx="8.5" ry="10.5"/>
          <circle class="eye-shine" cx="99" cy="106" r="3"/>
          <circle class="eye-shine" cx="147" cy="106" r="3"/>
        </g>
      </g>
      <g class="char-cheeks"><ellipse cx="76" cy="138" rx="11" ry="7"/><ellipse cx="164" cy="138" rx="11" ry="7"/></g>
      <path class="char-smile" d="M106 152q14 12 28 0" fill="none" stroke="var(--mouth)" stroke-width="4.5" stroke-linecap="round"/>
      <g class="char-mouth">
        <ellipse cx="120" cy="157" rx="15" ry="14" fill="var(--mouth)"/>
        <ellipse class="tongue" cx="120" cy="165" rx="8" ry="5" fill="#e8737f"/>
      </g>
    </g>
  </g>
  ${hand(c, 'l')}
  ${hand(c, 'r')}
  <g class="char-think"><circle cx="180" cy="56" r="4"/><circle cx="194" cy="40" r="6"/><circle cx="212" cy="20" r="8"/></g>
  <g class="char-zzz"><text x="176" y="58">z</text><text x="192" y="40">z</text><text x="210" y="20">Z</text></g>
</svg>`;
}
