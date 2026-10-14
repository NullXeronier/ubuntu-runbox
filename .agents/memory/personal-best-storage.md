---
name: Personal-best storage safety
description: Prefer preserving an unreadable saved best over persisting a session result.
---

If browser storage permits writes but denies reads, keep the run's best in memory and report a save failure rather than replacing the unknown stored score.

**Why:** A successful write is not safe if the browser prevents checking whether another tab already saved a higher score.

**How to apply:** Preserve this conservative behavior when changing score persistence or storage-fault handling.
