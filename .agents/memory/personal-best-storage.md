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

Native Web Locks do not by themselves prove coherent localStorage reads across
tabs. Keep the maximum-score assertion even when the lock queue order is proven.

**Why:** Nix Chromium 138 reproduced a stale read in the second exclusive lock,
overwriting a higher score with a lower score. A fresh tab confirmed the loss
after both locks drained. The same result occurred without the game, WebGL,
virtual clocks, or suppressed storage events.

**How to apply:** Treat serialization and storage coherence as separate
requirements. Do not hide this with sleeps, retries, notification-dependent
repair, or reseeding test data. Any persistence redesign must preserve the
player's existing saved bests.

Use an authoritative IndexedDB transaction for the maximum while preserving
legacy localStorage values as import sources and compatibility mirrors. Keep
the Web Lock until commit and do not downgrade to localStorage-only saves.

**Why:** The user approved expanding the reliability work to fix actual score
loss. Transactional storage solves coherence; retaining legacy values avoids
a destructive migration and protects players with previously saved scores.

**How to apply:** Read the maximum of both stores for display, never delete
legacy bests, and report failed safe persistence explicitly. An old open app
version can still modify its mirror but must not lower an already committed
authoritative best.
