# AFTERLIGHT — Rescue Protocol

An original browser game about gravity flight and rescuing stranded crews. Inspired by the rescue mechanics of Oids and the color-vector arcade tradition. All geometry and sound are generated in the browser.

[Play AFTERLIGHT](https://afterlight.45-77-127-32.nip.io)

![AFTERLIGHT gameplay](qa/desktop-flight.png)

## Run locally

From this directory:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. The game itself is static and has no build step; Node and Playwright are only used by the optional browser QA scripts.

## Optional browser QA

Install the test tools, then run the checks in a second terminal while the server is running:

```sh
npm ci
npx playwright install chromium
npm run qa
```

To run an individual check, use `npm run qa:smoke`, `npm run qa:playloop`, `npm run qa:campaign`, `npm run qa:combat`, or `npm run qa:edges`. Set `CHROME_PATH` to a local Chrome or Chromium executable to use it instead of Playwright's bundled Chromium. The smoke check accepts an optional base URL as its first argument.

## Flight controls

| Action | Desktop |
| --- | --- |
| Turn | Left/right arrows or A/D |
| Thrust | Up arrow or W |
| Fire | Space |
| Shield | Shift |
| Pause | P or Escape |
| Restart current sortie | R |

Mobile provides simultaneous touch buttons. Fly toward amber rescue pads and land gently, then carry the crew back to the extraction ship. Read the mission briefing and the changing objective for guidance.

## Source

- `dist/game.js`: flight simulation, missions, vector renderer, input and game interface.
- `dist/audio.js`: procedural Web Audio sound effects.
- `dist/index.html`, `dist/style.css`: responsive interface.
- `dist/fonts.css`, `dist/fonts/`: bundled Barlow Condensed and DM Sans, with their SIL Open Font License notices.
- `qa/`: browser verification scripts, selected screenshots, and reports.

The game stores score and sound preference in browser-local storage when available. It does not require accounts, a game server, analytics, or remote assets.

## Vultr hosting

The public game runs on the existing Vultr host, with HTTPS provided by Caddy. `deploy/server.py` serves only `dist` on loopback; it needs Python 3.9 or newer and no third-party packages. To try that server locally:

```sh
python3 deploy/server.py --port 4173
python3 -m unittest discover -s deploy -p 'test_*.py'
```

The configuration in `deploy/vultr/` matches this host's managed deployment contract. It uses a dedicated app user, a reserved port, hardened service settings, and Caddy's own site file. Credentials and SSH keys are not part of this repository.

On the configured host, stage a clean, committed repository export under your own `/srv/_staging/<agent>/afterlight/`, then run:

```sh
sudo deploy afterlight --smoke /srv/_staging/<agent>/afterlight
sudo deploy afterlight --from /srv/_staging/<agent>/afterlight
sudo deploy afterlight --status
```

Each deploy creates an immutable release, switches it atomically, checks `/healthz`, and reverts to the previous release if the check fails. An intentional rollback uses `sudo deploy afterlight --rollback`. Caddy configuration changes go through `sudoedit /etc/caddy/sites.d/afterlight.caddy` and `sudo caddy-apply`; leave other sites' files alone. New game releases do not require a Caddy change.

## Team workflow

The initial build used bounded programming, visual design, and playtesting roles, followed by integrated reviews and repairs. Continue this workflow for substantial changes: delegate suitable tasks to cheaper capable agents, keep file ownership clear, review actual desktop/mobile play, and integrate the results before delivery.
