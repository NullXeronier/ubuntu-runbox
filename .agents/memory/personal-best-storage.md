---
name: Personal-best storage safety
description: Prefer preserving an unreadable saved best over persisting a session result.
---

If browser storage permits writes but denies reads, keep the run's best in memory and report a save failure rather than replacing the unknown stored score.

**Why:** A successful write is not safe if the browser prevents checking whether another tab already saved a higher score.

**How to apply:** Preserve this conservative behavior when changing score persistence or storage-fault handling.

Treat safe cross-tab serialization as a prerequisite for persistence, not an optional enhancement. Prefer session-only results with a warning when the browser cannot provide it.

**Why:** An unlocked fallback reintroduces score loss precisely on the browsers where the concurrency guarantee cannot be enforced. Previously loaded versions cannot participate in a new locking protocol until reloaded.

**How to apply:** Keep browser-support documentation explicit and do not add an unlocked compatibility fallback.
