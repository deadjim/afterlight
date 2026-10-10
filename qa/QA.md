# AFTERLIGHT browser QA

Tested in headless Google Chrome through Playwright at 1440×900 desktop, 390×844 mobile portrait, and 844×390 mobile landscape. All final smoke runs had zero browser console errors or uncaught exceptions.

## Actual input playtest

- Started from the title, opened and launched the briefing, and let the craft settle on the first survivor pad. Pickup registered at about 4.3 seconds.
- Flew the loaded craft using actual ArrowLeft, ArrowRight, and ArrowUp keyboard input from `(540, 825)` to the carrier. Docking registered one delivered crew member and refilled fuel from about 93% to 100%. The trace is in [playloop-report.json](playloop-report.json).
- Mobile two-finger left-turn plus thrust changed the ship angle/position and consumed fuel. Touch cancellation released thrust (`is-pressed` cleared; fuel stopped falling). Mobile pause and Restart Sortie returned to a fresh mission.
- Desktop and both mobile viewports opened, launched, paused, and resumed successfully. Screenshots: [desktop title](desktop-title.png), [desktop flight](desktop-flight.png), [portrait flight](portrait-flight.png), [landscape flight](landscape-flight.png), and [landscape sector 3 briefing](landscape-sector3-briefing.png).

## State-assisted branch tests

- Using the game's debug position hook to reach physical pickup and docking triggers, all three sectors completed on both mobile viewports. Final result showed “ALL SIGNALS FOUND” and “PLAY AGAIN”. See [campaign-report.json](campaign-report.json), [portrait result](portrait-final-result.png), and [landscape result](landscape-final-result.png).
- A recoverable crash after pickup retained the crew aboard while hull dropped from 100 to 69, avoiding a missing-crew softlock. A loss produced “SIGNAL LOST” and “TRY AGAIN”; retry restored hull and pads.
- Holding the actual Fire key destroyed a sentry (HP 2→0, score +150). Holding the actual Shield key kept hull at 100 during the same stationary exposure that reduced unshielded hull to 88. Position was held through the debug hook to make the comparison repeatable.
- Test-only browser instrumentation set fuel to zero; landing on an empty pad restored it to 35%. This branch did not require a production code change. Storage API exceptions did not prevent gameplay. A synthetic `visibilitychange` with `document.hidden=true` paused the game; headless tab switching did not expose the real background state.

## Performance scope

In headless Chrome, 180 loaded-game animation frames had median intervals of 16.7 ms on both desktop and mobile emulation. The mobile-emulated p95 was 16.7 ms; desktop p95 was 33.4 ms. This measures the local browser, not a physical phone. Details are in [edges-report.json](edges-report.json) and [combat-report.json](combat-report.json).
