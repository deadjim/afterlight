# AFTERLIGHT browser QA

Playwright checks pass in headless Chrome with no page or console errors. Flight was checked at 1280×720 desktop, 390×844 portrait, and 844×390 landscape; smoke and touch layout also cover 320×568, 375×667, and 568×320. All six viewports fit without scrolling, with touch buttons wholly inside the screen and clear of visible HUD readouts. Selected screenshots are tracked here; the checks generate additional title, briefing, pause, ground, and orbit captures locally.

## Flight balance

- Holding the real Up key upright reaches the 5500 m orbital boundary in 10.10–10.12 seconds with 45.67% fuel remaining in all three main viewports. The 1, 2, and 3 second afterburner tiers advance; release resets power while retaining more than 95% of measured speed over the next 450 ms. The ship remains onscreen during the climb.
- The pre-orbit cue appears at 4706 m. Releasing thrust there lets the craft coast into orbit with the same 52.93% fuel; the 10× orbital fuel-rate check measures 38%/s against 3.8%/s at tier zero. Fuel stays stable while coasting, and crossing 20% triggers one audio warning plus the HUD warning state.
- Shield charge drains in about two seconds, stays depleted while held, recharges after release, and works again. Its empty cue fires once. A hard landing reduced hull to 83%; a subsequent gentle landing collected the survivor. Actual Fire input destroyed an interceptor through its wrapped image for 200 points, while another interceptor aimed and fired across the seam. Three initial stage-one interceptors fell to two after the kill.

See [balance-report.json](balance-report.json) and [landscape-orbit.png](landscape-orbit.png).

## Flight, wrapping, and campaign

Actual keyboard flight collected and delivered the first survivor; simultaneous touch turned and accelerated the craft. Carrier docking refilled fuel to at least 99% after one remaining held-thrust frame. Touch cancellation released thrust; pause, resume, retry, visibility pause, and unavailable local storage worked. Left and right seam crossings retained velocity and camera continuity at all three main sizes. Coordinate rebasing shifted ship and camera together. Wrapped pickup and docking did not duplicate survivors on repeat laps; real firing destroyed a sentry and enemies acquired wrapped targets.

The 6000, 7800, and 9600 unit sectors contain 5, 6, and 8 unique survivors. Assisted ship placement used real collision/pickup/dock triggers to clear all three sectors in both mobile orientations. Recoverable crashes retained cargo. A timed, finite shield blocked the incoming hits that damaged the unshielded craft. A sufficiently hard impact caused loss; retry restored a playable mission. Empty pads restored fuel to 75%.

See [playloop-report.json](playloop-report.json), [wrap-report.json](wrap-report.json), [campaign-report.json](campaign-report.json), [combat-report.json](combat-report.json), [edges-report.json](edges-report.json), and [smoke.mjs](smoke.mjs).

## Audio and resource bounds

Audio began after a gesture and reused one context and persistent engine graph. Repeated full-boost orbital engine calls created no nodes. Release, pause, mute, blur, and hiding the page faded thrust; a suspended context resumed through the UI. [audio-report.json](audio-report.json) records node counts and state.

Seventeen assisted laps under active thrust and fire reached 46 particles and 6 player bullets, within the 360-particle cap. The post-stress p95 frame interval was 16.7 ms in the test browser. Mobile checks use Chrome emulation, not physical devices; the assisted campaign and combat setups are distinct from the actual keyboard/touch input checks. Frame timing is not a physical mobile performance guarantee.
