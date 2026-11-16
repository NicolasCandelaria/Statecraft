import test from "node:test";
import assert from "node:assert/strict";
import { sample } from "./measure-balance.mjs";

const NATIONS = ["CAN", "SGP", "KAZ"];

function wins(rows) {
  return rows.filter(r => r.won).length;
}

test("random play loses most terms in every nation", () => {
  const rows = sample("random", 36);
  let total = 0;
  for (const key of NATIONS) {
    const errors = rows[key].filter(r => r.error);
    assert.equal(errors.length, 0, `${key} ${errors[0] && errors[0].error}`);
    const won = wins(rows[key]);
    total += won;
    assert.ok(won < 18, `${key} random won ${won}/36`);
  }
  assert.ok(total <= 43, `random won ${total}/108 overall`);
});

test("reading the stat chips wins more often than clicking at random", () => {
  const random = sample("random", 24);
  const chips = sample("chips", 24);
  for (const key of NATIONS) {
    const rw = wins(random[key]);
    const cw = wins(chips[key]);
    assert.ok(cw > rw, `${key} chips ${cw}/24, random ${rw}/24`);
  }
  const canada = wins(chips.CAN);
  assert.ok(canada >= 16, `a chip-reading Canada won ${canada}/24`);
});
