import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load } from "./measure-balance.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dealt(key, seed) {
  const game = load(rng(seed)).__game;
  game.G.nation = game.NATIONS[key];
  game.G.deck = game.buildDeck(key);
  game.reorderPromiseTests();
  return game.G.deck.map(e => e.id);
}

test("two terms open on the same gate and then diverge", () => {
  for (const key of ["CAN", "SGP", "KAZ"]) {
    const second = new Set();
    const third = new Set();
    const probeAt = new Set();
    for (let i = 1; i <= 24; i++) {
      const ids = dealt(key, i * 17 + key.charCodeAt(0));
      const game = load(() => 0).__game;
      assert.equal(ids[0], game.GATE_EVENTS[key], `${key} must still open on its storyline`);
      second.add(ids[1]);
      third.add(ids[2]);
      probeAt.add(ids.indexOf("gen_cyber"));
    }
    assert.ok(second.size >= 4, `${key} second cable was ${[...second].join(", ")}`);
    assert.ok(third.size >= 4, `${key} third cable had only ${third.size} versions`);
    assert.ok(probeAt.size >= 3, `${key} The Probe was fixed at ${[...probeAt].join(", ")}`);
  }
});

test("one seed deals one deck", () => {
  const a = dealt("CAN", 42).join();
  const b = dealt("CAN", 42).join();
  const c = dealt("CAN", 99).join();
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("standing is not a stat and is not copied onto every capital", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.equal(/(?<![A-Za-z])st:/.test(html), false, "an option still carries a standing stat");
  const game = load(() => 0.4).__game;
  game.G.nation = game.NATIONS.CAN;
  game.G.rel = { ...game.NATIONS.CAN.relations };
  const ext = game.externalizeEffects({ a: 2, st: 8 }, { USA: 1 });
  assert.deepEqual({ ...ext.fx }, { a: 2 });
  assert.deepEqual({ ...ext.rel }, { USA: 1 });
});

function effectValues(chunk) {
  const values = [];
  const re = /(?:fx|rel|relKey):(\{[^{}]*\})/g;
  let m;
  while ((m = re.exec(chunk))) {
    const body = m[1];
    for (const n of body.matchAll(/:(-?\d+)/g)) values.push(Number(n[1]));
  }
  return values.filter(v => v);
}

test("every governing choice shows a cost and a benefit", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const region = html.slice(html.indexOf("const EVENTS"));
  let i = 0;
  const bad = [];
  while (i < region.length) {
    const at = region.indexOf("{label:", i);
    if (at < 0) break;
    let depth = 0;
    let end = at;
    for (let k = at; k < region.length; k++) {
      const c = region[k];
      if (c === '"' || c === "'") {
        const q = c;
        k++;
        while (k < region.length) {
          if (region[k] === "\\") { k += 2; continue; }
          if (region[k] === q) break;
          k++;
        }
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { end = k + 1; break; }
      }
    }
    let own = region.slice(at, end);
    let nested = own.indexOf("{label:", 1);
    while (nested >= 0) {
      let d = 0;
      let stop = nested;
      for (let k = nested; k < own.length; k++) {
        const c = own[k];
        if (c === '"' || c === "'") {
          const q = c;
          k++;
          while (k < own.length) {
            if (own[k] === "\\") { k += 2; continue; }
            if (own[k] === q) break;
            k++;
          }
          continue;
        }
        if (c === "{") d++;
        else if (c === "}") {
          d--;
          if (d === 0) { stop = k + 1; break; }
        }
      }
      own = own.slice(0, nested) + own.slice(stop);
      nested = own.indexOf("{label:", 1);
    }
    const choice = own.split("fail:")[0];
    const values = effectValues(choice);
    if (values.length) {
      const pos = values.some(v => v > 0);
      const neg = values.some(v => v < 0);
      if (!pos || !neg) {
        const label = (choice.match(/label:"((?:\\.|[^"\\])*)"/) || [])[1] || "choice";
        bad.push(label.slice(0, 60));
      }
    }
    i = end;
  }
  assert.deepEqual(bad, []);
});
