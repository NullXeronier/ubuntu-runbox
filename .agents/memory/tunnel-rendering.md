---
name: Tunnel rendering verification
description: Why the game has a software compatibility renderer and limits of screenshot verification.
---

Three.js is the requested primary renderer. Keep a playable software tunnel for browsers without WebGL2, rather than a warning layered over a game with invisible notes.

**Why:** The preview screenshot browser reported no WebGL support even though the application served successfully. Its screenshot cannot establish that the GPU-based Three.js scene rendered correctly.

**How to apply:** Preserve the Three.js implementation on supported browsers. Verify and disclose which rendering path was visible; do not interpret a compatibility-renderer screenshot as verification of the primary WebGL scene.

The hosted capture browser and a locally launched regression browser have separate runtimes. A successful hosted screenshot does not establish that a downloaded Linux Chromium can launch in this NixOS workspace. Prefer the Nix-wrapped Chromium for local runs here.

**Why:** Playwright's downloaded Chromium failed before opening a page because it could not resolve `libglib-2.0.so.0`; the Nix-wrapped browser could start actual WebGL2 under SwiftShader. This is an environment problem, not evidence of broken gameplay.

**How to apply:** Distinguish browser-launch failures from failed application assertions. Keep an actual native-clock WebGL startup check even when deterministic input tests control the audio clock.
