// Sohbet partneri karakterleri: görünüş, kişilik, Canlı mod sesi ve Klasik moddaki ses tonu.
// Hepsi aynı iskeleti kullanır (kaşlar, gözler, ağız, eller); duruma göre CSS canlandırır:
// dinlerken eli kulağında, düşünürken eli çenesinde, konuşurken eller ve kaşlar sesle oynar.
// Her karakterin Canlı mod sesi farklıdır (live.js LIVE_VOICES).
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
    id: 'emma',
    name: 'Emma',
    kind: 'human',
    hair: 'long',
    glasses: true,
    desc: 'Sakin bir öğretmen. Net ve kibar İngilizce, iş hayatı ve mülakatlar.',
    voice: 'Kore',
    pitch: 1.05,
    persona: 'a calm, patient and articulate English teacher who helps with clear, polite and professional English, especially for work, meetings and job interviews',
    colors: { skin: '#b07650', shade: '#8f5a3a', hair: '#231a16', shirt: '#2fb59a', shirt2: '#1f8f78', eye: '#1a1210', cheek: '#e0806e', mouth: '#4a1f24' },
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
    id: 'tiko',
    name: 'Tiko',
    kind: 'cat',
    desc: 'Şakacı bir kedi. Yemeğe ve uykuya bayılır.',
    voice: 'Leda',
    pitch: 1.25,
    persona: 'a playful, witty cat and English conversation partner who loves food and naps. Now and then make a light cat joke, but keep the focus on the learner',
    colors: { skin: '#f3a65c', shade: '#d9853a', hair: '#b4652a', shirt: '#f3a65c', shirt2: '#4f6ef7', eye: '#2b2118', cheek: '#ff9aa2', mouth: '#5a2a2a' },
  },
  {
    id: 'max',
    name: 'Max',
    kind: 'dog',
    desc: 'Enerjik bir köpek. Spor, doğa ve yolculukları sever.',
    voice: 'Fenrir',
    pitch: 1.05,
    persona: 'an energetic, loyal and upbeat dog and English conversation partner who loves sports, the outdoors and road trips. Now and then make a light dog joke, but keep the focus on the learner',
    colors: { skin: '#d9a066', shade: '#b47b46', hair: '#6b4226', shirt: '#d9a066', shirt2: '#e5484d', eye: '#2a1d14', cheek: '#f2998e', mouth: '#4a2420' },
  },
  {
    id: 'ollie',
    name: 'Ollie',
    kind: 'owl',
    desc: 'Bilge bir baykuş. Deyimler, tarih ve kelimelerin hikâyeleri.',
    voice: 'Orus',
    pitch: 0.92,
    persona: 'a wise, gentle owl and English conversation partner who loves history, idioms and the stories behind words. Now and then share a short idiom or word origin that fits the conversation, but keep the focus on the learner',
    colors: { skin: '#8b6b4f', shade: '#6b5039', hair: '#4e3a2a', shirt: '#8b6b4f', shirt2: '#2f8f87', eye: '#1e1a16', cheek: '#f0a080', mouth: '#c8701f' },
  },
  {
    id: 'zip',
    name: 'Zip',
    kind: 'alien',
    desc: 'Dünya\'yı merak eden bir uzaylı. Her şeyi ona sen anlatırsın.',
    voice: 'Zephyr',
    pitch: 1.15,
    persona: 'a curious, friendly alien visiting Earth who is fascinated by everyday human life and often asks the learner to explain ordinary things such as food, traffic, holidays and jobs. Keep it playful and let the learner do most of the talking',
    colors: { skin: '#8fdc7a', shade: '#5fb85a', hair: '#3f8f4a', shirt: '#6c5ce7', shirt2: '#a29bfe', eye: '#14213d', cheek: '#ff9ecb', mouth: '#3a1f3d' },
  },
];

export const characterOf = (settings) => CHARACTERS.find((c) => c.id === settings?.character) || CHARACTERS[0];

// ---------- Parçalar ----------

const HUMAN_BODY = `
  <rect x="104" y="166" width="32" height="40" rx="12" fill="var(--shade)"/>
  <path d="M30 280c0-54 40-82 90-82s90 28 90 82z" fill="var(--shirt)"/>
  <path d="M98 199l22 24 22-24" fill="none" stroke="var(--shirt2)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;

const CREAM = '#f6e6cf';

const BODIES = {
  human: HUMAN_BODY,
  robot: `
    <rect x="106" y="172" width="28" height="32" rx="6" fill="var(--shade)"/>
    <path d="M34 280c0-50 30-80 86-80s86 30 86 80z" fill="var(--shirt)"/>
    <rect x="88" y="222" width="64" height="36" rx="12" fill="var(--shirt2)"/>
    <circle class="blink-light" cx="104" cy="240" r="6" fill="var(--eye)"/>
    <circle cx="122" cy="240" r="6" fill="#ffd25a"/>
    <circle cx="140" cy="240" r="6" fill="#ff6b6b"/>`,
  cat: `
    <path d="M34 280c0-54 36-84 86-84s86 30 86 84z" fill="var(--skin)"/>
    <ellipse cx="120" cy="256" rx="42" ry="24" fill="#fff3e6"/>
    <path d="M80 200q40 26 80 0l-6 16q-34 22-68 0z" fill="var(--shirt2)"/>
    <circle cx="120" cy="224" r="7" fill="#ffd25a"/>`,
  dog: `
    <path d="M34 280c0-54 36-84 86-84s86 30 86 84z" fill="var(--skin)"/>
    <ellipse cx="120" cy="256" rx="40" ry="24" fill="${CREAM}"/>
    <path d="M80 198q40 26 80 0l-5 15q-35 22-70 0z" fill="var(--shirt2)"/>
    <path d="M114 218h12l2 10-8 6-8-6z" fill="#ffd25a"/>`,
  owl: `
    <path d="M40 280c0-58 34-88 80-88s80 30 80 88z" fill="var(--skin)"/>
    <ellipse cx="120" cy="252" rx="46" ry="34" fill="${CREAM}"/>
    <path d="M99 234l7 7 7-7M127 234l7 7 7-7M113 250l7 7 7-7M99 266l7 7 7-7M127 266l7 7 7-7" fill="none" stroke="var(--shade)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M100 194l20 10 20-10v22l-20-10-20 10z" fill="var(--shirt2)"/>
    <circle cx="120" cy="205" r="5.5" fill="var(--shirt2)"/>`,
  alien: `
    <rect x="106" y="166" width="28" height="40" rx="12" fill="var(--shade)"/>
    <path d="M30 280c0-54 40-82 90-82s90 28 90 82z" fill="var(--shirt)"/>
    <path d="M86 206q34 18 68 0" fill="none" stroke="var(--shirt2)" stroke-width="8" stroke-linecap="round"/>
    <path d="M120 226l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#ffd25a"/>`,
};

function headBack(c) {
  if (c.kind === 'robot') {
    return `
      <line x1="120" y1="52" x2="120" y2="22" stroke="var(--shade)" stroke-width="5" stroke-linecap="round"/>
      <circle class="blink-light" cx="120" cy="17" r="8" fill="#ff6b6b"/>
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
  if (c.kind === 'owl') {
    return `
      <path d="M62 78l-14-48 46 30z" fill="var(--shade)"/>
      <path d="M178 78l14-48-46 30z" fill="var(--shade)"/>`;
  }
  if (c.kind === 'alien') {
    return `
      <path d="M98 54q-8-20-26-30M142 54q8-20 26-30" fill="none" stroke="var(--shade)" stroke-width="5" stroke-linecap="round"/>
      <circle class="blink-light" cx="70" cy="22" r="9" fill="#ffd25a"/>
      <circle class="blink-light late" cx="170" cy="22" r="9" fill="#ffd25a"/>`;
  }
  if (c.kind === 'dog') return '';
  const ears = `
    <circle cx="49" cy="124" r="13" fill="var(--skin)"/>
    <circle cx="191" cy="124" r="13" fill="var(--skin)"/>`;
  if (c.hair === 'bun') {
    return `
      <path d="M50 116c-2 46 8 76 24 92h92c16-16 26-46 24-92z" fill="var(--hair)"/>
      <circle cx="120" cy="40" r="27" fill="var(--hair)"/>
      ${ears}`;
  }
  if (c.hair === 'long') {
    return `
      <path d="M46 118c-6 58 2 94 18 112h112c16-18 24-54 18-112z" fill="var(--hair)"/>
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
  if (c.kind === 'dog') {
    // Sarkık kulaklar yüzün önünde; sağ gözün çevresinde koyu bir leke.
    return `
      <ellipse cx="146" cy="106" rx="21" ry="19" fill="var(--shade)"/>
      <ellipse cx="120" cy="148" rx="31" ry="23" fill="${CREAM}"/>
      <ellipse cx="120" cy="134" rx="12" ry="8.5" fill="#2a1d14"/>
      <ellipse cx="116" cy="131" rx="4" ry="2.2" fill="#fff" opacity=".55"/>
      <path d="M62 60c-26 4-36 32-31 64 3 18 11 32 23 33 12 1 18-11 20-25 3-26 2-50-12-72z" fill="var(--hair)"/>
      <path d="M178 60c26 4 36 32 31 64-3 18-11 32-23 33-12 1-18-11-20-25-3-26-2-50 12-72z" fill="var(--hair)"/>`;
  }
  if (c.kind === 'owl') {
    // Gözlerin çevresindeki açık renkli yüz diski, altın renkli iris ve gaga.
    return `
      <circle cx="96" cy="110" r="27" fill="${CREAM}"/>
      <circle cx="144" cy="110" r="27" fill="${CREAM}"/>
      <circle cx="96" cy="111" r="15.5" fill="#f5b83d"/>
      <circle cx="144" cy="111" r="15.5" fill="#f5b83d"/>
      <path d="M110 128h20l-10 17z" fill="#f59e2a"/>`;
  }
  if (c.kind === 'alien') {
    return `
      <circle cx="103" cy="64" r="5" fill="var(--shade)"/>
      <circle cx="121" cy="57" r="3.5" fill="var(--shade)"/>
      <circle cx="138" cy="66" r="4" fill="var(--shade)"/>
      <ellipse cx="96" cy="110" rx="17" ry="19" fill="#fff"/>
      <ellipse cx="144" cy="110" rx="17" ry="19" fill="#fff"/>`;
  }
  if (c.kind === 'robot') return '';
  const nose = '<ellipse cx="120" cy="130" rx="5" ry="4" fill="var(--shade)"/>';
  if (c.hair === 'bun') {
    return `
      <path d="M50 118c-6-54 32-80 72-78 42 2 76 30 68 78-8-20-22-34-38-40-6 14-26 22-46 20-14-1-26-8-32-16-12 8-20 20-24 36z" fill="var(--hair)"/>
      ${nose}`;
  }
  if (c.hair === 'long') {
    // Yana taranmış perçem
    return `
      <path d="M47 124c-7-54 28-84 73-84 46 0 80 30 73 84-5-24-16-42-34-52-24 8-58 6-84 14-14 6-23 20-28 38z" fill="var(--hair)"/>
      ${nose}`;
  }
  return `
    <path d="M49 112c-5-52 35-74 73-72 40 2 74 26 69 68-15-20-35-32-61-32-26 0-48 10-64 24-7 6-12 9-17 12z" fill="var(--hair)"/>
    <path d="M100 78q16-16 38-6-18 2-28 16z" fill="var(--hair)"/>
    ${nose}`;
}

// Gözlerin üstüne gelen parçalar (gözlük)
function overEyes(c) {
  if (!c.glasses) return '';
  return `
      <g class="char-glasses">
        <circle cx="96" cy="111" r="17"/>
        <circle cx="144" cy="111" r="17"/>
        <path d="M113 108q7-5 14 0M79 108l-27 8M161 108l27 8"/>
      </g>`;
}

function hand(c, side) {
  const mirror = side === 'r' ? ' transform="scale(-1 1)"' : '';
  let shape;
  if (c.kind === 'robot') {
    shape = `
      <circle r="17" fill="var(--skin)" stroke="var(--shade)" stroke-width="3"/>
      <circle r="6" fill="var(--shade)"/>
      <rect x="9" y="-18" width="8" height="14" rx="4" fill="var(--skin)" stroke="var(--shade)" stroke-width="2.5"/>`;
  } else if (c.kind === 'cat' || c.kind === 'dog') {
    const pad = c.kind === 'dog' ? '#7a5235' : '#ffb4b8';
    shape = `
      <circle r="17" fill="var(--skin)"/>
      <ellipse cx="0" cy="4" rx="7" ry="6" fill="${pad}"/>
      <circle cx="-8" cy="-6" r="3.4" fill="${pad}"/>
      <circle cx="0" cy="-9" r="3.4" fill="${pad}"/>
      <circle cx="8" cy="-6" r="3.4" fill="${pad}"/>`;
  } else if (c.kind === 'owl') {
    shape = `
      <ellipse rx="15" ry="21" fill="var(--skin)" transform="rotate(-14)"/>
      <path d="M-9 2q4.5 7 9 0q4.5 7 9 0M-7 11q3.5 5 7 0q3.5 5 7 0" fill="none" stroke="var(--shade)" stroke-width="2.5" stroke-linecap="round"/>`;
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
  const browY = { robot: 76, owl: 78 }[c.kind] ?? 82;
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
        <rect class="brow brow-l" x="80" y="${browY}" width="28" height="7" rx="3.5"/>
        <rect class="brow brow-r" x="132" y="${browY}" width="28" height="7" rx="3.5"/>
      </g>
      <g class="char-look">
        <g class="char-eyes">
          <ellipse cx="96" cy="111" rx="8.5" ry="10.5"/>
          <ellipse cx="144" cy="111" rx="8.5" ry="10.5"/>
          <circle class="eye-shine" cx="99" cy="106" r="3"/>
          <circle class="eye-shine" cx="147" cy="106" r="3"/>
        </g>
      </g>
      ${overEyes(c)}
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
