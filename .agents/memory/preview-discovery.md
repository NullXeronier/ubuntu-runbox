---
name: Preview discovery dependencies
description: Security rationale for using native Node file discovery in the component preview.
---

Keep the fixed component-preview scan on native Node file discovery unless a new requirement genuinely needs a third-party glob library.

**Why:** On 2026-10-14, the latest `fast-glob` pulled in `braces` with a high-severity stack-exhaustion advisory and no patched release. Native discovery avoided that dependency without removing preview functionality.

**How to apply:** Before adding glob libraries back, check their current transitive advisories. Preserve discovery of nested public TSX files, exclusion of underscore-prefixed and hidden paths, and refresh after additions/removals.
