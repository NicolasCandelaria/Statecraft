/**
 * A full term has to reach a verdict. The balance suite only noticed the
 * turn-12 crash because it counts thrown errors.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./measure-balance.mjs";

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

function playToVerdict(key) {
  const sandbox = load(() => 0.42);
  const { G, launchNewTerm } = sandbox.__game;
  const document = sandbox.__doc;
  launchNewTerm(key, true);
  let steps = 0;
  while (steps < 160 && G.nation && !G.over) {
    steps++;
    const modal = document.getElementById("confirm-modal");
    if (modal.style.display === "flex") { document.getElementById("confirm-ok").onclick(); continue; }
    const cable = document.getElementById("cable");
    const opts = byClass(cable, "opt");
    if (opts.length) { opts[0].onclick(); continue; }
    const btns = byClass(cable, "btn");
    if (btns.length) { btns[btns.length - 1].onclick(); continue; }
    assert.fail(`${key} had no button at step ${steps}`);
  }
  assert.equal(G.over, true, `${key} was still in office after ${steps} steps`);
  const titleEl = document.getElementById("verdict-title");
  const before = titleEl._html;
  const seq = document.getElementById("ending-seq");
  for (let i = 0; i < 24 && titleEl._html === before; i++) seq.onclick();
  document.getElementById("btn-epilogue").onclick();
  const ep = document.getElementById("verdict-epilogue");
  const heading = (ep.children || []).find(c => String(c.className || "").includes("ep-label"));
  return { title: titleEl._html, record: heading && heading._html, stored: G.endInfo && G.endInfo.title };
}

test("a finished term shows one title on the verdict and the record", () => {
  for (const key of ["CAN", "SGP", "KAZ"]) {
    const end = playToVerdict(key);
    assert.match(end.title, /<em>/, `${key} verdict was ${end.title}`);
    assert.equal(end.stored, end.title, key);
    assert.equal(end.record, end.title, key);
  }
});
