# AFTERLIGHT browser QA

Verified with Playwright and headless Chrome at 1440×900 desktop, 390×844 mobile portrait, and 844×390 mobile landscape. The checks assert expected behavior and fail when it regresses. All required checks passed without browser errors.

## Flight and wrapping

- Actual keyboard flight collected and delivered the first survivor and refilled fuel at the carrier. Simultaneous mobile touch turned and accelerated the craft; touch cancellation released thrust. Pause, resume, and retry worked without viewport overflow.
- Left and right seam crossings preserved velocity and smooth camera movement in all three viewports. Periodic terrain matched across the boundary.
- Numeric coordinate rebasing shifted the ship and camera together, with a maximum observed screen step of 4.85 pixels. Wrapped pickup and docking worked, and revisiting the same survivor on another lap did not duplicate cargo.
- Firing destroyed a sentry through its wrapped image, and sentries acquired and fired at wrapped ship positions.

See [wrap-report.json](wrap-report.json), [playloop-report.json](playloop-report.json), and [edges-report.json](edges-report.json).

## Progression and recovery

The three sectors span 6000, 7800, and 9600 world units, with 5, 6, and 8 unique survivors. Assisted ship positioning exercised physical pickup/docking triggers and cleared every sector in both mobile orientations. A recoverable crash retained cargo; loss and retry restored a playable mission. Shielding prevented the damage seen without a shield. Empty pads restored fuel to 75%, and unavailable local storage did not prevent play.

See [campaign-report.json](campaign-report.json) and [combat-report.json](combat-report.json).

## Sound and resource limits

Audio started only after a gesture and reused one context and a fixed engine graph. Repeated thrust calls did not allocate new nodes. Release, pause, mute, blur, and hiding the page faded thrust to silence. Suspending the real audio context and using Pause → Resume restored its running state without creating another context. See [audio-report.json](audio-report.json).

Seventeen assisted laps under active thrust and fire reached at most 36 particles and 6 player bullets, with a post-stress p95 frame interval of 16.8 ms. Transient effects and projectiles remain bounded; terrain is generated only for the visible region.

Mobile checks use Chrome emulation, not physical phones. Extended campaign and stress checks use assisted positions; they do not represent a fully manual nineteen-survivor campaign. Frame timings describe the test browser, not a device guarantee.
