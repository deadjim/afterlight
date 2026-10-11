# AFTERLIGHT browser QA

Playwright checks pass in headless Chrome without page or console errors. Flight was checked at 1280×720 desktop, 390×844 portrait, and 844×390 landscape; smoke and touch layout also cover 320×568, 375×667, and 568×320. The six viewports fit without scrolling. The joystick and Fire button stay onscreen and clear of visible HUD readouts; briefing, pause, loss, and long final-result actions fit even at 568×320. Selected screenshots are tracked here; checks generate additional captures locally.

## Flight balance

- Holding the real Up key upright reaches the 5500 m orbital boundary in 10.10–10.12 seconds with 45.67% fuel remaining in all three main viewports. The 1, 2, and 3 second afterburner tiers advance; release resets power while retaining more than 95% of measured speed over the next 450 ms. The ship remains onscreen during the climb.
- The pre-orbit cue appears at 4706 m. Releasing thrust there lets the craft coast into orbit with the same 52.93% fuel. The 2× orbital fuel-rate check measures 7.6%/s against 3.8%/s at tier zero. Fuel stays stable while coasting, and crossing 20% triggers one audio warning plus the HUD warning state.
- Shield charge drains in about two seconds, stays depleted while held, recharges after release, and works again. Its empty cue fires once. A hard landing reduced hull to 83%; a subsequent gentle landing collected the survivor. Actual Fire input destroyed an interceptor through its wrapped image for 200 points, while another interceptor aimed and fired across the seam. Stage one has three surface interceptors and four orbital guardians; the active count fell from seven to six after the kill.

See [balance-report.json](balance-report.json) and [landscape-orbit.png](landscape-orbit.png).

## Flight, wrapping, and campaign

Actual keyboard flight collected and delivered the first survivor. On mobile, a diagonal analog stick turns and thrusts while a second finger fires; each finger can release independently. The stick deadzone, outside-drag clamp, knob bounds, cancellation, pause, blur, resize, and retry resets passed in portrait and landscape. Carrier docking refilled fuel to at least 99% after one remaining held-thrust frame. Visibility pause and unavailable local storage worked. Left and right seam crossings retained velocity and camera continuity at all three main sizes. Coordinate rebasing shifted ship and camera together. Wrapped pickup and docking did not duplicate survivors on repeat laps; real firing destroyed a sentry and enemies acquired wrapped targets.

The 6000, 7800, and 9600 unit sectors contain 5, 6, and 8 unique survivors. Assisted ship placement used real collision/pickup/dock triggers to clear all three sectors in both mobile orientations. Recoverable crashes retained cargo. A timed, finite shield blocked the incoming hits that damaged the unshielded craft. A sufficiently hard impact caused loss; retry restored a playable mission. Empty pads restored fuel to 75%.

See [joystick-report.json](joystick-report.json), [playloop-report.json](playloop-report.json), [wrap-report.json](wrap-report.json), [campaign-report.json](campaign-report.json), [combat-report.json](combat-report.json), [edges-report.json](edges-report.json), and [smoke.mjs](smoke.mjs).

## Optional space expedition

A fresh 100%-fuel keyboard flight reached the 4700 m cue at 9.13 seconds with 53.05% fuel, then a closed-loop keyboard pilot steered and braked to the first outpost. The craft docked at about 17.0 seconds with full hull and over 30% fuel just before docking; the physical docking trigger refilled fuel to 100%, awarded one salvage, and added 750 points. No ship positioning was assisted on that outward leg. A repeat dock refueled/repaired without duplicate salvage or score; remaining in the ring did not farm dock events.

Assisted positioning exercised the second outpost's physical docking trigger (+1200 points, second salvage), a return-home carrier trigger, a hard planetoid impact (hull fell to 67.4% with no salvage), and guardian combat. Actual Fire input killed a four-hit guardian through its wrapped image (+350); another guardian fired a three-projectile spread at a wrapped ship. At far orbit the home planet shrank from about 500 to 41 screen pixels. Seventeen assisted space laps under thrust and fire kept two outposts and seven enemy identities stable, with at most 40 particles and six player bullets and a 16.8 ms post-stress p95 frame interval.

See [expedition-report.json](expedition-report.json) and [space-expedition.png](space-expedition.png).

## Audio and resource bounds

Audio began after a gesture and reused one context and persistent engine graph. Partial analog stick throttle reached the engine API; repeated full-boost orbital engine calls created no nodes. Release, pause, mute, blur, and hiding the page faded thrust; a suspended context resumed through the UI. [audio-report.json](audio-report.json) records node counts and state.

Seventeen assisted surface laps under active thrust and fire also stayed within the 360-particle cap, with a post-stress p95 frame interval of 16.7 ms. Mobile checks use Chrome emulation, not physical devices. The assisted campaign, second-outpost, and combat setups are distinct from the actual keyboard/touch input checks. Frame timing is not a physical mobile performance guarantee.
