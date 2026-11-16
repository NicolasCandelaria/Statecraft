/**
 * Play the desktop build through the real buttons.
 * Reports how often a random player, and a player who reads the stat chips, keeps the mandate.
 */
import fs from "node:fs";
import vm from "node:vm";

const GAME = new URL("./index.html", import.meta.url);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeEl(tag) {
  const el = {
    tagName: tag || "div",
    id: "",
    className: "",
    textContent: "",
    _html: "",
    style: { display: "" },
    children: [],
    dataset: {},
    tabIndex: 0,
    offsetWidth: 0,
    parent: null,
    width: 0,
    height: 0,
    onclick: null,
    scrollTop: 0,
  };
  el.classList = {
    add(...c) { c.forEach(x => el.classList._s.add(x)); },
    remove(...c) { c.forEach(x => el.classList._s.delete(x)); },
    toggle(c, force) {
      const on = force === undefined ? !el.classList._s.has(c) : !!force;
      if (on) el.classList._s.add(c); else el.classList._s.delete(c);
      return on;
    },
    contains(c) { return el.classList._s.has(c); },
    _s: new Set(),
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(v) { el._html = String(v ?? ""); if (el._html === "") el.children = []; },
  });
  el.appendChild = child => { el.children.push(child); child.parent = el; return child; };
  el.remove = () => { if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el); };
  el.focus = () => {};
  el.setAttribute = () => {};
  el.getAttribute = () => null;
  el.getContext = () => ctx2d;
  const hasClass = (node, name) => String(node.className || "").split(/\s+/).includes(name);
  const walk = (node, pred, out) => {
    for (const child of node.children || []) {
      if (pred(child)) out.push(child);
      walk(child, pred, out);
    }
  };
  el.querySelector = sel => {
    const found = [];
    if (sel.startsWith(".")) walk(el, n => hasClass(n, sel.slice(1)), found);
    return found[0] || null;
  };
  el.querySelectorAll = sel => {
    const found = [];
    if (sel.startsWith(".")) walk(el, n => hasClass(n, sel.slice(1)), found);
    return found;
  };
  el.closest = () => null;
  return el;
}

const ctx2d = {
  createRadialGradient() { return { addColorStop() {} }; },
  fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, fillText() {},
  measureText() { return { width: 80 }; },
  font: "", fillStyle: "", strokeStyle: "", lineWidth: 1, textAlign: "", textBaseline: "",
};

function loadGame(random) {
  const html = fs.readFileSync(GAME, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const source = scripts.join("\n").replace("initGlobe(()=>{", "if(false) initGlobe(()=>{") + `
    function __group(){
      const g={children:[]};
      g.add=o=>{ g.children.push(o); return g; };
      g.remove=o=>{ g.children=g.children.filter(c=>c!==o); };
      return g;
    }
    markerGroup=__group();
    arcGroup=__group();
    globalThis.__game={ G, NATIONS, TERM, launchNewTerm, audio, EVENTS, buildDeck, externalizeEffects, GATE_EVENTS, reorderPromiseTests };
  `;
  const elements = new Map();
  const store = new Map();
  class Color {
    constructor(hex) { this.hex = hex ?? 0; }
    clone() { return new Color(this.hex); }
    lerp() { return this; }
    getHexString() { return "888888"; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    normalize() { return this; }
    distanceTo() { return 1; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { this.x = this.y = this.z = s; return this; }
  }
  const mat = () => ({ opacity: 1, color: new Color(), dispose() {}, map: { dispose() {} } });
  class Obj { constructor() { this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.material = mat(); this.geometry = { dispose() {} }; this.userData = {}; this.type = "Mesh"; } }
  const gsap = {
    to(_t, vars = {}) { vars.onUpdate && vars.onUpdate(); vars.onComplete && vars.onComplete(); return { then(fn) { fn(); } }; },
    from() {},
    fromTo(_a, _b, vars = {}) { vars.onComplete && vars.onComplete(); },
    set() {},
    killTweensOf() {},
    delayedCall(_t, fn) { fn(); },
    globalTimeline: { timeScale() {} },
  };
  const document = {
    body: makeEl("body"),
    getElementById(id) {
      if (!elements.has(id)) { const node = makeEl("div"); node.id = id; elements.set(id, node); }
      return elements.get(id);
    },
    createElement: tag => tag === "canvas" ? Object.assign(makeEl("canvas"), { getContext: () => ctx2d }) : makeEl(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    console, Date, Math: Object.assign(Object.create(Math), { random }),
    JSON, Object, Array, String, Number, Boolean, RegExp, parseInt, parseFloat, Infinity, NaN, undefined,
    document, gsap,
    THREE: {
      Color, Vector3,
      Mesh: class extends Obj {},
      Sprite: class extends Obj { constructor() { super(); this.type = "Sprite"; } },
      Line: class extends Obj { constructor() { super(); this.type = "Line"; } },
      SphereGeometry: class {},
      BufferGeometry: class { setFromPoints() { return this; } },
      MeshBasicMaterial: class { constructor() { Object.assign(this, mat()); } },
      LineBasicMaterial: class { constructor(o) { Object.assign(this, mat(), o); } },
      SpriteMaterial: class { constructor() { Object.assign(this, mat()); } },
      CanvasTexture: class { dispose() {} },
      QuadraticBezierCurve3: class { getPoints() { return [new Vector3()]; } },
    },
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ display: "none" }),
    addEventListener() {},
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    AudioContext: class {
      constructor() { this.currentTime = 0; this.destination = {}; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      createOscillator() { return { type: "", frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.webkitAudioContext = sandbox.AudioContext;
  sandbox.Math.random = random;
  vm.createContext(sandbox);
  sandbox.localStorage.setItem("statecraft.prefs.v1", JSON.stringify({ skipOnboarding: true, sound: false }));
  vm.runInContext(source, sandbox, { filename: "index.html" });
  sandbox.__game.audio.on = false;
  sandbox.__doc = document;
  return sandbox;
}

function byClass(root, name) {
  const out = [];
  const walk = node => {
    for (const child of node.children || []) {
      if (String(child.className || "").split(/\s+/).includes(name)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

function openingScore(stats) {
  return stats.a * .35 + stats.s * .30 + stats.t * .20 + stats.m * .15;
}

function play(kind, key, seed) {
  const random = mulberry32(seed);
  const sandbox = loadGame(random);
  const { G, launchNewTerm } = sandbox.__game;
  const document = sandbox.__doc;
  const pick = list => list[Math.floor(random() * list.length)];
  launchNewTerm(key, true);
  let steps = 0;
  let error = null;
  try {
    while (steps < 120 && G.nation && !G.over) {
      steps++;
      const modal = document.getElementById("confirm-modal");
      if (modal.style.display === "flex") { document.getElementById("confirm-ok").onclick(); continue; }
      const cable = document.getElementById("cable");
      const opts = byClass(cable, "opt");
      if (opts.length) {
        const choice = kind === "chips" ? opts[smartIndex(G, opts)] : pick(opts);
        choice.onclick();
        continue;
      }
      const btns = byClass(cable, "btn");
      if (btns.length) { btns[btns.length - 1].onclick(); continue; }
      error = "no buttons";
      break;
    }
  } catch (e) {
    error = e.stack || String(e);
  }
  const info = G.endInfo || null;
  const won = !!(info && info.win && !info.collapse);
  return {
    won, error, steps,
    campaign: G.nation ? (G.campaign && G.campaign.complete ? "governed" : "campaign") : "lost-campaign",
    score: info ? info.score : null,
    collapse: info ? info.collapse : null,
    stats: G.stats ? { ...G.stats } : null,
    open: G.nation ? openingScore(G.startStats || {}) : null,
  };
}

function wordMag(d) {
  const a = Math.abs(d);
  if (a >= 15) return 4;
  if (a >= 8) return 3;
  if (a >= 4) return 2;
  return 1;
}
function relMag(d) {
  const a = Math.abs(d);
  if (a >= 20) return 4;
  if (a >= 12) return 3;
  if (a >= 6) return 2;
  return 1;
}
/* The cable does not show the integer. It shows a band: slight, real, strong, sweeping. */
function fxValue(fx) {
  fx = fx || {};
  const w = { a: .35, s: .30, t: .20, m: .15 };
  let n = 0;
  for (const [k, v] of Object.entries(fx)) {
    if (!v || !w[k]) continue;
    n += Math.sign(v) * wordMag(v) * w[k];
  }
  return n;
}
function relValue(rel) {
  return Object.values(rel || {}).reduce((n, v) => n + (v ? Math.sign(v) * relMag(v) * .12 : 0), 0);
}
/* Score only what the cable shows: the four stats, named capitals, and a
   delayed bill at half weight. Hidden standing is not a stat and is ignored.
   A thin treasury or a collapsing approval makes that cost count twice, the
   way a player reading the chips would refuse the option that finishes them. */
function visibleValue(o, stats) {
  o = o || {};
  const fx = { ...(o.fx || {}) };
  delete fx.st;
  let v = fxValue(fx) + relValue(o.rel) + relValue(o.relKey);
  if (o.delay) {
    const dfx = { ...(o.delay.fx || {}) };
    delete dfx.st;
    v += .5 * (fxValue(dfx) + relValue(o.delay.rel));
  }
  if (stats) {
    if (stats.t < 40 && (fx.t || 0) < 0) v -= wordMag(fx.t) * .22;
    if (stats.a < 36 && (fx.a || 0) < 0) v -= wordMag(fx.a) * .2;
    if (stats.s < 36 && (fx.s || 0) < 0) v -= wordMag(fx.s) * .2;
    if (stats.m < 30 && (fx.m || 0) < 0) v -= wordMag(fx.m) * .15;
  }
  if (o.risk && o.risk.fail) {
    const p = o.risk.p == null ? .5 : o.risk.p;
    const fail = visibleValue(o.risk.fail, stats);
    v = p * v + (1 - p) * fail;
  }
  return v;
}
function smartIndex(G, opts) {
  const brief = G.currentBriefing;
  let values = null;
  if (brief && brief.kind === "event" && brief.ev && brief.ev.opts && brief.ev.opts.length === opts.length) {
    values = brief.ev.opts.map(o => visibleValue(o, G.stats));
  } else if (brief && brief.kind === "consequence" && brief.q && brief.q.cable.resp && brief.q.cable.resp.length === opts.length) {
    values = brief.q.cable.resp.map(o => visibleValue(o, G.stats));
  }
  if (!values) {
    values = opts.map(btn => {
      const text = btn._html || btn.innerHTML || "";
      const m = text.match(/projected vote ([+-]?\d+)/);
      return m ? Number(m[1]) : 0;
    });
  }
  let best = 0;
  values.forEach((v, i) => { if (v > values[best]) best = i; });
  return best;
}

export function load(random = Math.random) {
  return loadGame(random);
}

export function sample(kind, games) {
  const out = {};
  for (const key of ["CAN", "SGP", "KAZ"]) {
    const rows = [];
    for (let i = 0; i < games; i++) rows.push(play(kind, key, (key.charCodeAt(0) * 1000) + i + 1));
    out[key] = rows;
  }
  return out;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("measure-balance.mjs");
if (invokedDirectly) {
const games = Number(process.argv[2] || 24);
const kind = process.argv[3] || "random";
const all = sample(kind, games);
for (const key of ["CAN", "SGP", "KAZ"]) {
  const rows = all[key];
  const wins = rows.filter(r => r.won).length;
  const errors = rows.filter(r => r.error);
  const scored = rows.filter(r => r.score != null);
  const avg = scored.length ? (scored.reduce((n, r) => n + r.score, 0) / scored.length).toFixed(1) : "n/a";
  const opens = rows.filter(r => r.open).map(r => r.open);
  const openAvg = opens.length ? (opens.reduce((n, v) => n + v, 0) / opens.length).toFixed(1) : "n/a";
  console.log(`  term-start score avg ${openAvg}`);
  const collapses = rows.filter(r => r.collapse).length;
  const camp = rows.filter(r => r.campaign === "lost-campaign").length;
  const scores = scored.map(r => r.score).sort((a, b) => a - b);
  const mid = scores.length ? scores[Math.floor(scores.length / 2)] : "n/a";
  const kinds = {};
  rows.forEach(r => { if (r.collapse) kinds[r.collapse] = (kinds[r.collapse] || 0) + 1; });
  console.log(`${kind} ${key}: ${wins}/${rows.length} wins, avg ${avg}, median ${mid}, range ${scores[0] ?? "-"}–${scores.at(-1) ?? "-"}, campaign losses ${camp}, collapses ${collapses} ${JSON.stringify(kinds)}, errors ${errors.length}`);
  if (errors[0]) console.log(String(errors[0].error).split("\n").slice(0, 8).join("\n"));
}
}
