/**
 * The nation's own cables have to stay in the deck after the storyline is chosen,
 * and a storyline ending must not consume the turn-10 reckoning.
 *
 * Loads the desktop index.html in a stubbed browser and plays the real turn engine.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const GAME = new URL("./index.html", import.meta.url);

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
    classList: null,
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
    set(v) {
      el._html = String(v ?? "");
      if (el._html === "") el.children = [];
    },
  });
  el.appendChild = child => { el.children.push(child); child.parent = el; return child; };
  el.remove = () => {
    if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el);
  };
  el.focus = () => {};
  el.setAttribute = () => {};
  el.getAttribute = () => null;
  const matches = (node, sel) => {
    if (sel.startsWith(".")) return String(node.className || "").split(/\s+/).includes(sel.slice(1));
    return false;
  };
  const walk = (node, sel) => {
    for (const child of node.children || []) {
      if (matches(child, sel)) return child;
      const found = walk(child, sel);
      if (found) return found;
    }
    return null;
  };
  el.querySelector = sel => walk(el, sel);
  el.querySelectorAll = () => [];
  el.closest = () => null;
  return el;
}

function loadGame() {
  const html = fs.readFileSync(GAME, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (scripts.length !== 3) throw new Error(`expected 3 inline scripts, found ${scripts.length}`);
  const source = scripts.join("\n")
    .replace("initGlobe(()=>{", "if(false) initGlobe(()=>{") + `
      arcGroup = arcGroup || { children: [] };
      markerGroup = markerGroup || { children: [] };
      globalThis.__game = {
        EVENTS, RECKONINGS, NATIONS, PROMISE_EVENT_IDS, STORYLINE_GATES, GATE_EVENTS, G, TERM,
        setupTermState, reorderPromiseTests, pruneDeckForStoryline, applyChains,
        mainBeat, resolveOption, pickReckoning, threadLines, freshAdv
      };
    `;
  const elements = new Map();
  const store = new Map();
  class Color {
    constructor(hex) { this.hex = hex; }
    clone() { return new Color(this.hex); }
    lerp() { return this; }
    getHexString() { return "888888"; }
  }
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
      if (!elements.has(id)) {
        const node = makeEl("div");
        node.id = id;
        elements.set(id, node);
      }
      return elements.get(id);
    },
    createElement: tag => makeEl(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    parseInt,
    parseFloat,
    Infinity,
    NaN,
    undefined,
    document,
    gsap,
    THREE: { Color, Vector3: class {}, Scene: class {}, PerspectiveCamera: class {}, WebGLRenderer: class {} },
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
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    AudioContext: class {
      constructor() { this.currentTime = 0; this.destination = {}; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      createOscillator() { return { type: "", frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.webkitAudioContext = sandbox.AudioContext;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "index.html" });
  return sandbox.__game;
}

function homeIds(deck, key) {
  return deck.filter(e => e.nation === key && !e.requires).map(e => e.id);
}

function begin(game, key) {
  game.setupTermState(key);
  game.G.campaign = { complete: true, votes: 60 };
  game.reorderPromiseTests();
  game.G.beat = 1;
  game.G.over = false;
  game.G.reckoningDone = false;
  if (game.G.audio) game.G.audio.on = false;
}

test("choosing a storyline keeps the rest of that nation's cables in the deck", () => {
  const game = loadGame();
  for (const key of ["CAN", "SGP", "KAZ"]) {
    begin(game, key);
    const gate = game.G.deck[0];
    assert.equal(gate.id, game.GATE_EVENTS[key], `${key} should still open on its storyline cable`);
    const before = homeIds(game.G.deck, key);
    game.G.deck.shift();
    const surviving = homeIds(game.G.deck, key);
    game.applyChains(gate.opts[0]);
    const after = homeIds(game.G.deck, key);
    const lost = surviving.filter(id => !after.includes(id));
    assert.equal(lost.length, 0, `${key} lost home cables when the storyline was chosen: ${lost.join(", ")}`);
    assert.ok(before.includes(gate.id));
    assert.ok(game.G.scheduled.length > 0, `${key} storyline follow-up should still be scheduled`);
    for (const id of { CAN: ["can_grid", "can_icebreaker", "can_doctors"], SGP: ["sgp_land", "sgp_port_auto", "sgp_heat"], KAZ: ["kaz_fuel", "kaz_water", "kaz_graft"] }[key]) {
      assert.ok(after.includes(id), `${key} deck no longer contains ${id}`);
    }
  }
});

test("a full term deals the storyline ending and then the term reckoning", () => {
  const game = loadGame();
  for (const key of ["CAN", "SGP", "KAZ"]) {
    begin(game, key);
    const seen = [];
    for (let turn = 0; turn < game.TERM; turn++) {
      game.G.turn = turn;
      game.G.beat += 1;
      game.G.over = false;
      game.mainBeat();
      const ev = game.G.currentBriefing && game.G.currentBriefing.ev;
      assert.ok(ev, `${key} turn ${turn + 1} dealt no cable`);
      seen.push(ev.id || ev.title);
      if (String(ev.id || "").startsWith("rk_")) break;
      assert.ok(ev.opts && ev.opts.length, `${key} cable ${ev.id} has no options`);
      game.resolveOption(ev, ev.opts[0]);
    }
    const climax = seen.filter(id => String(id).startsWith("rk_"));
    const storyEnd = seen.filter(id => game.EVENTS.some(e => e.id === id && e.cls === "RECKONING"));
    assert.equal(climax.length, 1, `${key} cables: ${seen.join(" → ")}`);
    assert.equal(storyEnd.length, 1, `${key} storyline ending missing from: ${seen.join(" → ")}`);
    assert.ok(seen.indexOf(storyEnd[0]) < seen.indexOf(climax[0]), `${key} dealt the climax before the storyline ending`);
  }
});

test("a storyline ending does not consume the term reckoning", () => {
  const game = loadGame();
  begin(game, "CAN");
  game.G.turn = 10;
  game.G.scheduled = [{ at: 10, id: "can_ret_spine_end" }];
  game.mainBeat();
  const ending = game.G.currentBriefing.ev;
  assert.equal(ending.id, "can_ret_spine_end");
  assert.equal(ending.cls, "RECKONING");
  assert.equal(game.G.reckoningDone, false, "storyline endings share the RECKONING label and must not close the slot");

  game.resolveOption(ending, ending.opts[0]);
  assert.equal(game.G.history.at(-1).reck, false, "a storyline ending is not the term reckoning in the record");
  /* The gesture in that ending repairs Washington. The climax is chosen from the state after it. */
  game.G.rel.USA = 40;

  game.G.turn = 11;
  game.G.scheduled = [];
  game.G.beat += 1;
  game.mainBeat();
  const climax = game.G.currentBriefing.ev;
  assert.equal(climax.id, "rk_can_usa", "the climax should be the one the term's relations earned");
  assert.equal(game.G.reckoningDone, true);

  game.resolveOption(climax, climax.opts[0]);
  assert.equal(game.G.history.at(-1).reck, true);
  const spine = game.threadLines().find(line => line.startsWith("Then came"));
  assert.ok(spine && spine.includes(climax.title), spine);
  assert.equal(game.threadLines().filter(line => line.startsWith("Then came")).length, 1);
});

test("every nation reaches a term reckoning after its storyline ending", () => {
  const game = loadGame();
  const gates = {
    CAN: "can_ret_spine_end",
    SGP: "sgp_neutral_armed_end",
    KAZ: "kaz_rus_junior_end",
  };
  for (const [key, endingId] of Object.entries(gates)) {
    begin(game, key);
    game.G.turn = 10;
    game.G.scheduled = [{ at: 10, id: endingId }];
    game.mainBeat();
    assert.equal(game.G.currentBriefing.ev.id, endingId);
    assert.equal(game.G.reckoningDone, false, key);
    game.G.turn = 11;
    game.G.scheduled = [];
    game.G.beat += 1;
    game.mainBeat();
    const climax = game.G.currentBriefing.ev;
    const ids = game.RECKONINGS[key].map(r => r.ev.id);
    assert.ok(ids.includes(climax.id), `${key} presented ${climax.id}, expected one of ${ids.join(", ")}`);
    assert.equal(game.G.reckoningDone, true);
  }
});

test("the Kazakhstan stability reckoning, including its line-crossing order, can be dealt", () => {
  const game = loadGame();
  begin(game, "KAZ");
  game.G.turn = 10;
  game.G.scheduled = [{ at: 10, id: "kaz_multi_split_end" }];
  game.mainBeat();
  assert.equal(game.G.reckoningDone, false);
  game.G.turn = 11;
  game.G.stats.s = 40;
  game.G.scheduled = [];
  game.G.beat += 1;
  game.mainBeat();
  const climax = game.G.currentBriefing.ev;
  assert.equal(climax.id, "rk_kaz_january");
  assert.ok(climax.opts.some(o => o.label === "Declare emergency and hold the line."));
});
