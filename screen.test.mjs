import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(root, "index.html"), "utf8");

export function findChrome(env = process.env, exists = existsSync) {
  const local = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe");
  const candidates = [
    env.CHROME,
    env.GOOGLE_CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/local/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    local,
  ];
  return candidates.find(p => p && exists(p)) || null;
}

const CHROME = findChrome();
const needsChrome = CHROME ? false : "set CHROME to a Chrome or Chromium binary";

test("the browser path follows CHROME, then the usual install locations", () => {
  assert.equal(findChrome({ CHROME: "/opt/custom-chrome" }, p => p === "/opt/custom-chrome"), "/opt/custom-chrome");
  assert.equal(findChrome({ CHROME: "/missing", GOOGLE_CHROME_BIN: "" }, () => false), null);
  if (CHROME) assert.equal(existsSync(CHROME), true);
});

test("the globe loader does not mark same-folder images as cross-origin", () => {
  assert.equal(html.includes('crossOrigin="anonymous"'), false);
  assert.match(html, /EARTH_DATA/);
  assert.match(html, /vendor\/earth-data\.js/);
  assert.equal(/<script[^>]*src="vendor\/earth-data\.js"/.test(html), false);
  assert.match(html, /location\.protocol==="file:"/);
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      }
    });
  }
  send(method, params = {}, ms = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout ${method}`));
      }, ms);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: err => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function launchChrome(startUrl) {
  const bin = findChrome();
  if (!bin) throw new Error("set CHROME to a Chrome or Chromium binary");
  const dir = mkdtempSync(path.join(tmpdir(), "statecraft-chrome-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(bin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--force-prefers-reduced-motion",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + dir,
    "--no-first-run",
    "--disable-extensions",
    "--window-size=1280,720",
    "about:blank"
  ], { stdio: "ignore" });
  let version = null;
  for (let i = 0; i < 50; i++) {
    try {
      version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
      break;
    } catch {
      await sleep(100);
    }
  }
  if (!version) {
    proc.kill("SIGKILL");
    throw new Error("Chrome did not open a debugging port");
  }
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browser.addEventListener("open", resolve);
    browser.addEventListener("error", reject);
  });
  const bcdp = new Cdp(browser);
  const created = await bcdp.send("Target.createTarget", { url: "about:blank" });
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const page = list.find(target => target.id === created.targetId);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await cdp.send("Page.navigate", { url: startUrl });
  return {
    proc, cdp, dir,
    async close() {
      try { ws.close(); } catch { /* already gone */ }
      try { browser.close(); } catch { /* already gone */ }
      proc.kill("SIGKILL");
      await sleep(50);
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result ? result.result.value : undefined;
}

async function waitFor(cdp, expression, ms = 12000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    last = await evaluate(cdp, `(() => { try { return (${expression}); } catch (e) { return false; } })()`);
    if (last) return last;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for ${expression.slice(0, 160)} (last ${JSON.stringify(last)})`);
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 900
  });
  await sleep(80);
}

async function screenshot(cdp, file) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(shot.data, "base64"));
}

function samplePatch(file, width, height, x0, y0, x1, y1) {
  const rawPath = file + ".rgb";
  execFileSync("ffmpeg", ["-y", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", rawPath], { stdio: "ignore" });
  const raw = readFileSync(rawPath);
  let n = 0, lum = 0, maxSpread = 0;
  const xStart = Math.max(0, x0), yStart = Math.max(0, y0);
  const xEnd = Math.min(width, x1), yEnd = Math.min(height, y1);
  for (let y = yStart; y < yEnd; y += 2) {
    for (let x = xStart; x < xEnd; x += 2) {
      const i = (y * width + x) * 3;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      maxSpread = Math.max(maxSpread, Math.max(r, g, b) - Math.min(r, g, b));
      n++;
    }
  }
  return { lum: lum / n, maxSpread, n };
}

const MEASURE = `(() => {
  const box = el => {
    if (!el) return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 1 && h > 1 ? Math.round(w * h) : 0;
  };
  const visible = el => {
    const r = el.getBoundingClientRect();
    let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      const clips = /(auto|scroll|hidden)/.test(style.overflow + style.overflowY + style.overflowX);
      if (clips) {
        const pr = p.getBoundingClientRect();
        top = Math.max(top, pr.top);
        bottom = Math.min(bottom, pr.bottom);
        left = Math.max(left, pr.left);
        right = Math.min(right, pr.right);
      }
    }
    const vh = window.innerHeight, vw = window.innerWidth;
    top = Math.max(top, 0); left = Math.max(left, 0);
    bottom = Math.min(bottom, vh); right = Math.min(right, vw);
    const height = bottom - top, width = right - left;
    return {
      height: Math.round(height),
      width: Math.round(width),
      ownH: Math.round(r.height),
      ownW: Math.round(r.width),
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      full: height >= r.height - 2 && width >= r.width - 2 && r.top >= -1 && r.bottom <= vh + 1
    };
  };
  const covered = (x, y) => ["hud", "mandate", "cable-wrap", "relations", "term-log", "gear", "open-files"].some(id => {
    const r = box(document.getElementById(id));
    return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const body = document.querySelector(".cable-body");
  const promise = document.querySelector(".plank-promise");
  const opts = [...document.querySelectorAll(".opt")].map(visible);
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    body: body ? body.clientHeight : 0,
    bodyText: body ? body.scrollHeight : 0,
    options: opts,
    optionCount: opts.length,
    mandate: box(document.getElementById("mandate")),
    cable: box(document.getElementById("cable-wrap")),
    overlap: overlap(box(document.getElementById("mandate")), box(document.getElementById("cable-wrap"))),
    promiseDisplay: promise ? getComputedStyle(promise).display : null,
    promiseSize: promise ? parseFloat(getComputedStyle(promise).fontSize) : 0,
    globeFree: !covered(window.innerWidth * 0.32, window.innerHeight * 0.78)
  };
})()`;

async function openGoverningBriefing(cdp) {
  await evaluate(cdp, `localStorage.clear()`);
  await waitFor(cdp, `document.querySelector("#btn-begin") && getComputedStyle(document.querySelector("#title-screen")).display !== "none"`);
  await evaluate(cdp, `document.querySelector("#btn-begin").click()`);
  await waitFor(cdp, `getComputedStyle(document.querySelector("#select-screen")).display === "flex"`);
  await evaluate(cdp, `document.querySelector(".dossier").click()`);
  await waitFor(cdp, `[...document.querySelectorAll("button")].some(b => /Begin the campaign/.test(b.textContent))`);
  await evaluate(cdp, `[...document.querySelectorAll("button")].find(b => /Begin the campaign/.test(b.textContent)).click()`);
  for (let stop = 0; stop < 5; stop++) {
    await waitFor(cdp, `document.querySelectorAll("#cable .opt").length >= 3`);
    await evaluate(cdp, `document.querySelector("#cable .opt").click()`);
    await waitFor(cdp, `[...document.querySelectorAll("#cable button")].some(b => /Next stop|See the count/.test(b.textContent))`);
    await evaluate(cdp, `[...document.querySelectorAll("#cable button")].find(b => /Next stop|See the count/.test(b.textContent)).click()`);
  }
  await waitFor(cdp, `[...document.querySelectorAll("#cable button")].some(b => /Form the government/.test(b.textContent))`);
  await evaluate(cdp, `[...document.querySelectorAll("#cable button")].find(b => /Form the government/.test(b.textContent)).click()`);
  await waitFor(cdp, `document.querySelector("#onboarding") && getComputedStyle(document.querySelector("#onboarding")).display === "flex"`);
  await evaluate(cdp, `document.querySelector("#btn-onboarding-start").click()`);
  await waitFor(cdp, `document.querySelectorAll("#cable .opt").length >= 3 && getComputedStyle(document.querySelector("#cable .opt")).opacity === "1"`);
  await sleep(120);
}

test("opening index.html from disk draws the earth and keeps a failure on screen", { skip: needsChrome }, async () => {
  const live = await launchChrome("file://" + path.join(root, "index.html"));
  try {
    await waitFor(live.cdp, `document.querySelector("#title-screen") && getComputedStyle(document.querySelector("#title-screen")).display === "flex" && !document.getElementById("loading")`, 15000);
    const note = await evaluate(live.cdp, `document.getElementById("load-note") && document.getElementById("load-note").textContent`);
    assert.equal(note, null);
    await setViewport(live.cdp, 1280, 720);
    await sleep(400);
    const shot = path.join(tmpdir(), "statecraft-globe.png");
    await screenshot(live.cdp, shot);
    const patch = samplePatch(shot, 1280, 720, 560, 150, 720, 250);
    assert.ok(patch.lum > 35, `earth patch luminance ${patch.lum.toFixed(1)} (a black globe is near 0)`);
  } finally {
    await live.close();
  }

  const fixture = mkdtempSync(path.join(tmpdir(), "statecraft-missing-"));
  try {
    writeFileSync(path.join(fixture, "index.html"), html);
    const vendor = path.join(fixture, "vendor");
    mkdirSync(vendor);
    for (const name of readdirSync(path.join(root, "vendor"))) {
      if (name === "earth-data.js") continue;
      symlinkSync(path.join(root, "vendor", name), path.join(vendor, name));
    }
    const broken = await launchChrome("file://" + path.join(fixture, "index.html"));
    try {
      await waitFor(broken.cdp, `document.getElementById("load-note") && document.getElementById("loading")`, 10000);
      const state = await evaluate(broken.cdp, `({
        note: document.getElementById("load-note").textContent,
        title: getComputedStyle(document.querySelector("#title-screen")).display,
        loading: !!document.getElementById("loading")
      })`);
      assert.match(state.note, /did not load/);
      assert.equal(state.title, "none");
      assert.equal(state.loading, true);
    } finally {
      await broken.close();
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("the briefing, options, and mandate follow the space on screen", { skip: needsChrome }, async () => {
  const session = await launchChrome("file://" + path.join(root, "index.html"));
  try {
    await waitFor(session.cdp, `document.querySelector("#btn-begin") && getComputedStyle(document.querySelector("#title-screen")).display !== "none"`, 15000);
    await setViewport(session.cdp, 1440, 900);
    await openGoverningBriefing(session.cdp);
    const sizes = [
      { w: 1920, h: 940, body: 200, allOptions: true, promise: 13, globe: true },
      { w: 1440, h: 900, body: 200, allOptions: true, promise: 13, globe: true },
      { w: 1280, h: 720, body: 200, allOptions: true, promise: 13, globe: true },
      { w: 1366, h: 650, body: 160, allOptions: true, promise: 12, globe: true },
      { w: 390, h: 844, body: 140, allOptions: false, collapsed: true, globe: false }
    ];
    for (const size of sizes) {
      await setViewport(session.cdp, size.w, size.h);
      let measured;
      for (let attempt = 0; attempt < 10; attempt++) {
        measured = await evaluate(session.cdp, MEASURE);
        const settled = measured.overlap === 0 && (!size.allOptions || measured.options.every(opt => opt.full));
        if (settled) break;
        await sleep(80);
      }
      assert.equal(measured.vw, size.w, `viewport width ${size.w}`);
      assert.equal(measured.vh, size.h, `viewport height ${size.h}`);
      assert.equal(measured.optionCount >= 3, true, `${size.w}x${size.h} options ${measured.optionCount}`);
      assert.ok(measured.body >= size.body, `${size.w}x${size.h} briefing is ${measured.body}px, needs ${size.body}`);
      assert.equal(measured.overlap, 0, `${size.w}x${size.h} mandate covers ${measured.overlap}px of the briefing`);
      if (size.allOptions) {
        measured.options.forEach((opt, i) => {
          assert.equal(opt.full, true, `${size.w}x${size.h} option ${i + 1} is clipped ${JSON.stringify(opt)} body ${measured.body}`);
        });
      }
      if (size.promise) {
        assert.ok(measured.promiseSize >= size.promise, `${size.w}x${size.h} promise text is ${measured.promiseSize}px`);
        assert.notEqual(measured.promiseDisplay, "none");
      }
      if (size.collapsed) {
        assert.equal(measured.promiseDisplay, "none");
        assert.ok(measured.mandate && measured.mandate.height <= 120, `phone mandate is ${measured.mandate && measured.mandate.height}px`);
      }
      if (size.globe) assert.equal(measured.globeFree, true, `${size.w}x${size.h} leaves no open globe`);
    }
  } finally {
    await session.close();
  }
});
