# Statecraft

A one-screen game about governing. You run a campaign, then answer twelve briefings as the head of government. Ministers advise, rivals answer, and four numbers move: treasury, approval, stability, and military.

## Play

Open `index.html` in a current desktop browser. The page does not load anything from the network. Keep this folder intact, including `vendor/`.

The earth pictures in `vendor/earth/` are also stored in `vendor/earth-data.js`. A browser will show those pictures from disk, then refuse to paint them on the globe; the encoded copy is what the globe draws when the page is opened as a file. A normal web address uses the picture files themselves.

Drag the globe to turn it, and scroll to move closer. The gear in the corner holds sound, the three save slots, and a short guide. Saves stay in this browser.

A term is won at a score of 50 or higher. The score weighs approval, stability, treasury, and military, then adjusts for promises kept and broken. If any of the four numbers reaches zero, the government falls before the term ends.

## Countries

- **Canada** is the balanced term.
- **Singapore** is the demanding one.
- **Kazakhstan** is the volatile one.

## What is included

These files used to be requested from five other sites. They now live in `vendor/`, and the license texts are in `vendor/licenses/`.

| Piece | Where | Terms |
| --- | --- | --- |
| Three.js r128 | `vendor/three.min.js` | MIT. Copyright 2010–2021 Three.js Authors. |
| GSAP 3.12.5 | `vendor/gsap.min.js` | GreenSock standard license. The terms are in the file header. |
| Fraunces | `vendor/fonts/` | SIL Open Font License 1.1. Copyright 2018 The Fraunces Project Authors. |
| Public Sans | `vendor/fonts/` | SIL Open Font License 1.1. A USWDS modification of Libre Franklin. |
| IBM Plex Mono | `vendor/fonts/` | SIL Open Font License 1.1. Copyright 2017 IBM Corp., reserved name “Plex”. |
| Earth images | `vendor/earth/` | The day and night photographs are NASA Visible Earth images, public domain, as packed with three-globe 2.31.0. The topology and water maps are from that same release, under its MIT license. |
| Music | `vendor/music/` | Kevin MacLeod (incompetech.com). Ambiment, Atlantean Twilight, Aftermath, and Arcane. CC BY 4.0. |

The game credits the music on screen while sound is on.

If the globe library or its images are missing, or the browser will not let the globe use them, the opening line stays on screen and says so. The globe also needs WebGL.

## Checks

From this folder:

```
node --test
```

`reconnect-content.test.mjs` checks that a chosen storyline leaves the rest of that country’s cables in the deck, and that a term still reaches its reckoning. `balance.test.mjs` plays seeded games and expects random play to lose most terms. `offline.test.mjs` checks that the page does not point at another host, and that every file it names is in this folder.
