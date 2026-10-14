---
name: Storage fault testing
description: Keep uncaught error assertions meaningful when simulating denied browser storage.
---

Do not exempt uncaught browser errors merely because their text matches a deliberately injected storage failure.

**Why:** A storage-fault browser run produced denied-access/read errors whose original collector retained no source or stack. Matching the injector's message did not establish that they came from development tooling or were harmless. Suppressing those messages would hide real failures.

**How to apply:** Keep page errors fatal and retain their stacks. If tooling noise needs an exception, establish its source first; distinguish gameplay assertions passing from the complete no-uncaught-errors check passing.
