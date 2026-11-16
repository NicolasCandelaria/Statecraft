import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("the page does not request a third-party host", () => {
  const urls = html.match(/https?:\/\/[^"'()\s]+/g) || [];
  assert.deepEqual(urls, []);
});

test("every local file the page names is present", () => {
  const refs = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (ref.startsWith("vendor/")) refs.add(ref);
  }
  for (const match of html.matchAll(/url\("([^"]+)"\)/g)) refs.add(match[1]);
  for (const match of html.matchAll(/vendor\/(?:earth|music)\/[A-Za-z0-9._-]+/g)) refs.add(match[0]);
  assert.ok(refs.size >= 20, `found ${refs.size} local assets`);
  const missing = [...refs].filter(ref => !fs.existsSync(path.join(root, ref)));
  assert.deepEqual(missing, []);
  for (const name of ["Ambiment.ogg", "Atlantean-Twilight.ogg", "Aftermath.ogg", "Arcane.ogg"]) {
    assert.ok(fs.existsSync(path.join(root, "vendor/music", name)), name);
  }
});
