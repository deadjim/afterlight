# AFTERLIGHT browser QA

The full browser QA suite passed: smoke, gesture, joystick, playloop, campaign, combat, edges, wrap, audio, landing, balance, planet, and expedition. Checks ran in headless Chrome without page or console errors; the gesture test also ran in Playwright WebKit. Flight was checked at 1280×720 desktop, 390×844 portrait, and 844×390 landscape; smoke and touch layout also cover 320×568, 375×667, 568×320, and short browser landscape at 568×280. All seven viewports fit without scrolling. The joystick, Fire, and restored Shield button stay onscreen and clear of visible HUD readouts; briefing and pause actions fit even at 568×280, while loss and long final-result actions fit at 568×320. Selected screenshots are tracked here; checks generate additional captures locally.

## Flight balance

- Holding the real Up key upright reaches the 5500 m orbital boundary in 10.10–10.12 seconds with 45.67% fuel remaining in all three main viewports. The 1, 2, and 3 second afterburner tiers advance; release resets power while retaining more than 95% of measured speed over the next 450 ms. The ship remains onscreen during the climb.
- The pre-orbit cue appears at 4706 m. Releasing thrust there lets the craft coast into orbit with the same 52.93% fuel. The 2× orbital fuel-rate check measures 7.6%/s against 3.8%/s at tier zero. Fuel stays stable while coasting, and crossing 20% triggers one audio warning plus the HUD warning state.
- Shield charge drains in about two seconds, stays depleted while held, recharges after release, and works again. Its empty cue fires once. An occupied-pad impact during launch invulnerability and active Shield reduced hull from 100% to 70.3% without rescue or refuel; a slow crooked contact reduced it to 80.8%, while a gentle upright landing rescued the survivor and topped fuel to 75%. A tilted side impact on the first planetoid during invulnerability reduced hull to 77.8% without docking or salvage. Actual Fire input destroyed an interceptor through its wrapped image for 200 points, while another interceptor aimed and fired across the seam. Stage one has three surface interceptors and four orbital guardians; the active count fell from seven to six after the kill.

See [balance-report.json](balance-report.json), [landing-report.json](landing-report.json), and [landscape-orbit.png](landscape-orbit.png).

## Flight, wrapping, and campaign

Actual keyboard flight collected and delivered the first survivor without hull loss. On mobile, a diagonal analog stick turns and thrusts while a second finger fires and a third holds Shield. Each control releases independently; Shield's ring reflects its finite charge, turns depleted at zero, recharges after release, and rearms. The stick deadzone, outside-drag clamp, knob bounds, cancellation, pause, blur, resize, and retry resets passed in portrait and landscape. Carrier docking refilled fuel to at least 99% after one remaining held-thrust frame. Visibility pause and unavailable local storage worked. Left and right seam crossings retained velocity and camera continuity at all three main sizes. Coordinate rebasing shifted ship and camera together. Wrapped pickup and docking did not duplicate survivors on repeat laps; real firing destroyed a sentry and enemies acquired wrapped targets.

The 6000, 7800, and 9600 unit sectors contain 5, 6, and 8 unique survivors. Assisted ship placement used real collision/pickup/dock triggers to clear all three sectors in both mobile orientations. Recoverable crashes retained cargo. A timed, finite shield blocked the incoming hits that damaged the unshielded craft. A sufficiently hard impact caused loss; retry restored a playable mission. Empty pads restored fuel to 75%.

See [joystick-report.json](joystick-report.json), [playloop-report.json](playloop-report.json), [wrap-report.json](wrap-report.json), [campaign-report.json](campaign-report.json), [combat-report.json](combat-report.json), [edges-report.json](edges-report.json), and [smoke.mjs](smoke.mjs).

## Mobile gestures and the departing planet

At 390×844 and 568×320, ten consecutive three-finger Chrome CDP cycles each kept joystick thrust, Fire, and Shield responsive; cancellation cleared all held controls, every control stayed inside the viewport, and `visualViewport.scale` stayed at 1. A second finger could now tap Pause while the stick was held, then touch Resume. Single-touch Mute toggled once per tap; Pause and Retry each invoked one action, while cancelled and dragged-out Pause touches did nothing. Cancelable synthetic Safari-style `gesturestart/change/end` and flight-surface touch events were prevented, while a desktop gesture without active flight touch was left alone. Playwright WebKit at 390×844 passed single-touch Mute and Pause, with scale 1 and no horizontal overflow. These browser checks cannot prove pinch arbitration on a physical iPhone Safari device.

The home planet radius at 5500, 7500, and 12000 m is 267.7, 143.7, and 65.2 pixels at a 900-pixel viewport height, with the same proportions in portrait and landscape. Its full disk clears the bottom edge by 7500 m; in 844×390 and 568×280 landscape it also clears the bottom HUD by 48.6 and 27.0 pixels. After assisted placement at orbit entry, ten seconds of real unpowered flight raised altitude about 1748 m; the planet shrank another 42.5% with zero vertical center drift. See [gesture-report.json](gesture-report.json) and [planet-report.json](planet-report.json).

## Optional space expedition

A fresh 100%-fuel keyboard flight reached the 4700 m cue at 9.28 seconds with 51.94% fuel, then a closed-loop keyboard pilot steered and braked to the first outpost. The craft docked at about 17.27 seconds with full hull and about 29.7% fuel just before docking; the physical docking trigger refilled fuel to 100%, awarded one salvage, and added 750 points. No ship positioning was assisted on that outward leg. A repeat dock refueled/repaired without duplicate salvage or score; remaining in the ring did not farm dock events.

Assisted positioning exercised the second outpost's physical docking trigger (+1200 points, second salvage), a return-home carrier trigger, a hard planetoid impact (hull fell to 67.4% with no salvage), and guardian combat. Actual Fire input killed a four-hit guardian through its wrapped image (+350); another guardian fired a three-projectile spread at a wrapped ship. At far orbit the home planet shrank from about 141 to 27 screen pixels in the desktop expedition view. Seventeen assisted space laps under thrust and fire kept two outposts and seven enemy identities stable, with at most 40 particles and six player bullets and a 16.8 ms post-stress p95 frame interval.

See [expedition-report.json](expedition-report.json) and [space-expedition.png](space-expedition.png).

## Audio and resource bounds

Audio began after a gesture and reused one context and persistent engine graph. Partial analog stick throttle reached the engine API; repeated full-boost orbital engine calls created no nodes. Release, pause, mute, blur, and hiding the page faded thrust; a suspended context resumed through the UI. [audio-report.json](audio-report.json) records node counts and state.

Seventeen assisted surface laps under active thrust and fire also stayed within the 360-particle cap, with a post-stress p95 frame interval of 16.7 ms. Mobile checks use Chrome emulation, not physical devices. The assisted campaign, second-outpost, and combat setups are distinct from the actual keyboard/touch input checks. Frame timing is not a physical mobile performance guarantee.
