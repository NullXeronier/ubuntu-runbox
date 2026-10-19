---
name: Storage fault testing
description: Keep uncaught error assertions meaningful when simulating denied browser storage.
---

Do not exempt uncaught browser errors merely because their text matches a deliberately injected storage failure.

**Why:** A storage-fault browser run produced denied-access/read errors whose original collector retained no source or stack. Matching the injector's message did not establish that they came from development tooling or were harmless. Suppressing those messages would hide real failures.

**How to apply:** Keep page errors fatal and retain their stacks. If tooling noise needs an exception, establish its source first; distinguish gameplay assertions passing from the complete no-uncaught-errors check passing.

Do not infer Firefox error cleanliness from Chromium results or from successful
score-preservation and warning assertions.

**Why:** On supported Linux with version-matched browsers, denying or removing
IndexedDB left storage assertions satisfied in both engines, but Firefox also
emitted uncaught errors with application save-path stacks. A warning shown to
the player does not prove all rejected promises were handled.

**How to apply:** Keep per-engine fatal-error evidence when testing storage
faults; investigate rejection propagation rather than exempting the injected
error message.
