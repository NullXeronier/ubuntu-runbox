#!/usr/bin/env bash
# Run on a dedicated Linux CI runner after installing Playwright --with-deps,
# Xvfb, Mesa and PulseAudio. No containers, browser replacements or app mocks.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" != Linux ]]; then
  echo "This runner requires Linux." >&2
  exit 1
fi
for command in pnpm node xvfb-run glxinfo pulseaudio pactl; do
  if ! command -v "$command" >/dev/null; then
    echo "Linux runner setup is incomplete: missing $command. See e2e/README.md." >&2
    exit 1
  fi
done
if [[ $# -ne 0 ]]; then
  echo "The release runner accepts no filters: all 72 Chromium/Firefox core and personal-best cases must execute." >&2
  exit 1
fi

output="$PWD/generated-artifacts/pulse-runner-linux"
mkdir -p "$output"
# Never leave a previous passing report available if this invocation fails
# before Playwright can write fresh evidence.
rm -f generated-artifacts/pulse-runner/results.json
runtime="$(mktemp -d -t pulse-browser-audio.XXXXXXXX)"
audio_pid=""
cleanup() {
  if [[ -n "$audio_pid" ]]; then
    kill "$audio_pid" 2>/dev/null || true
    wait "$audio_pid" 2>/dev/null || true
  fi
  rm -rf -- "$runtime"
}
trap cleanup EXIT

# A private native PulseAudio server drives real AudioContext clocks. Its null
# sink avoids requiring speakers; this does not certify physical audio latency.
# Keep the socket in a 0700 directory and do not alter the user's audio server.
pulseaudio --daemonize=no --exit-idle-time=-1 --use-pid-file=no -n \
  --load="module-native-protocol-unix socket=$runtime/native" \
  --load="module-null-sink sink_name=pulse_runner_ci rate=48000" \
  > "$output/pulseaudio.log" 2>&1 &
audio_pid=$!
export PULSE_SERVER="unix:$runtime/native"
ready=0
for ((attempt=0; attempt<50; attempt++)); do
  if pactl info > "$output/audio-server.txt" 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$audio_pid" 2>/dev/null; then break; fi
  sleep 0.2
done
if [[ "$ready" != 1 ]]; then
  echo "Linux runner setup failed: private PulseAudio server did not start." >&2
  cat "$output/pulseaudio.log" >&2
  exit 1
fi
pactl set-default-sink pulse_runner_ci
pactl list short sinks > "$output/audio-sinks.txt"

# The release job tests this checkout, not a remote app or system Chromium.
unset REPL_ID PULSE_E2E_BASE_URL PULSE_E2E_CHROMIUM PULSE_E2E_ALLOW_UNSUPPORTED
unset PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS
export CI=1 PULSE_E2E_HEADED=1 LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe
export PULSE_LINUX_EVIDENCE_DIR="$output"

{
  uname -srmo
  node --version
  pnpm --version
  pnpm --filter @workspace/pulse-runner exec playwright --version
} > "$output/versions.txt"

# Headed Firefox uses real Mesa GL under Xvfb. The existing Chromium
# project still explicitly requests real ANGLE/SwiftShader WebGL2.
xvfb-run -a -s "-screen 0 1280x1024x24 +extension GLX +render -noreset" \
  bash -c '
    set -euo pipefail
    glxinfo -B > "$PULSE_LINUX_EVIDENCE_DIR/graphics.txt"
    pnpm --filter @workspace/pulse-runner run test:e2e --grep "@cross-engine|@best-persistence"
  ' 2>&1 | tee "$output/matrix.log"

# Do not accept a green command that silently omitted or skipped a project.
node scripts/assert-pulse-browser-matrix.mjs generated-artifacts/pulse-runner/results.json
