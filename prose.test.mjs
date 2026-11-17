/**
 * The writing pass joined new sentences with a comma. A term can still
 * finish, and the player still reads the break.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("a new sentence is not joined on with a comma", () => {
  const hits = [...html.matchAll(/, (The|That|Two|A|Opinion) [a-z]/g)].map(m => {
    const at = m.index;
    return html.slice(Math.max(0, at - 48), at + m[0].length + 24).replace(/\s+/g, " ");
  });
  assert.deepEqual(hits, []);
});

test("the damaged lines are whole sentences", () => {
  assert.equal(html.includes("mill town with a shuttered plant does not want to hear it in a mill town"), false);
  assert.equal(html.includes("protected zone,."), false);
  assert.equal(html.includes("Balance, not theatrically"), false);
});
