---
name: Tunnel rendering verification
description: Why the game has a software compatibility renderer and limits of screenshot verification.
---

Three.js is the requested primary renderer. Keep a playable software tunnel for browsers without WebGL2, rather than a warning layered over a game with invisible notes.

**Why:** The preview screenshot browser reported no WebGL support even though the application served successfully. Its screenshot cannot establish that the GPU-based Three.js scene rendered correctly.

**How to apply:** Preserve the Three.js implementation on supported browsers. Verify and disclose which rendering path was visible; do not interpret a compatibility-renderer screenshot as verification of the primary WebGL scene.
