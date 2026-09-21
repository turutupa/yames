#!/usr/bin/env bash
# Boot an iPhone simulator, install Yames, and photograph every screen the
# release checklist asks for.
#
# Nobody is in front of this simulator, so nothing can tap a tab bar. What
# drives the app instead is its own settings store: the tab it was last on is
# persisted and read back at launch, so writing one value into `settings.json`
# between two launches lands the next one on the metronome, the drill or the
# setlist with no app code involved at all. The settings pane and zen are not
# tabs and are not persisted, so those two use the two marker values in
# `src/platform.ts` that only a `YAMES_MOBILE_DEBUG=1` build honours.
#
# Everything the script learns about the running app — the container path, the
# store file, the app's own log — is printed, because that log is the only way
# anyone finds out why a picture came out blank.
set -euo pipefail

cd "$(dirname "$0")/../.."

DEVICE_NAME="${SIM_DEVICE:-iPhone 15}"
APP_ID="${APP_ID:-com.yames.metronome}"
OUT="artifacts/ios"
mkdir -p "$OUT"

APP="${SIM_APP:-}"
if [ -z "$APP" ]; then
  APP=$(find src-tauri/gen/apple/build -maxdepth 4 -name '*.app' -type d -print | sort | head -1)
fi
test -n "$APP" || { echo "::error::no .app to install"; exit 1; }
echo "==> app: $APP"

# ---------------------------------------------------------------------------
# A phone with a notch and a home indicator. Both matter: they are what says
# whether WKWebView's env(safe-area-inset-*) reports the truth, or whether the
# iPhone needs the same insets-from-native workaround Android needed in M05b.
# ---------------------------------------------------------------------------
echo "==> available simulators"
xcrun simctl list devices available

UDID=$(xcrun simctl list devices available --json \
  | python3 -c "
import json,sys
want = sys.argv[1]
data = json.load(sys.stdin)['devices']
for runtime, devices in sorted(data.items()):
    for d in devices:
        if d.get('isAvailable') and d.get('name') == want:
            print(d['udid'])
            raise SystemExit
" "$DEVICE_NAME")

if [ -z "$UDID" ]; then
  echo "==> no '$DEVICE_NAME' exists; creating one"
  RUNTIME=$(xcrun simctl list runtimes --json \
    | python3 -c "
import json,sys
rts = [r for r in json.load(sys.stdin)['runtimes'] if r.get('isAvailable') and 'iOS' in r.get('name','')]
print(rts[-1]['identifier'] if rts else '')")
  test -n "$RUNTIME" || { echo "::error::this runner has no iOS runtime"; exit 1; }
  TYPE=$(xcrun simctl list devicetypes --json \
    | python3 -c "
import json,sys
want = sys.argv[1]
for t in json.load(sys.stdin)['devicetypes']:
    if t['name'] == want:
        print(t['identifier'])
        break
" "$DEVICE_NAME")
  test -n "$TYPE" || { echo "::error::this runner has no '$DEVICE_NAME' device type"; exit 1; }
  UDID=$(xcrun simctl create "$DEVICE_NAME" "$TYPE" "$RUNTIME")
fi
echo "==> $DEVICE_NAME is $UDID"

xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
# Light appearance, so the shots are the default theme rather than whatever
# the runner image happens to be set to.
xcrun simctl ui "$UDID" appearance light || true

echo "==> installing"
xcrun simctl install "$UDID" "$APP"

CONTAINER=$(xcrun simctl get_app_container "$UDID" "$APP_ID" data)
echo "==> data container: $CONTAINER"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

store_path() {
  find "$CONTAINER" -name 'settings.json' -print 2>/dev/null | sort | head -1
}

# Write the store, creating it if the app has not yet. The location is
# discovered rather than assumed: Tauri's store plugin resolves it through the
# app-config directory, and where that lands inside an iOS container is not
# something to hardcode.
seed_store() {
  local json="$1"
  local path
  path=$(store_path)
  if [ -z "$path" ]; then
    path="$CONTAINER/Library/Application Support/$APP_ID/settings.json"
    mkdir -p "$(dirname "$path")"
    echo "==> no store yet; creating $path"
  fi
  python3 - "$path" "$json" <<'PY'
import json, sys, os
path, patch = sys.argv[1], json.loads(sys.argv[2])
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    data = {}
data.update(patch)
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("store now holds", len(data), "keys at", path)
PY
}

launch_and_shoot() {
  local name="$1"
  local wait_s="${2:-9}"
  xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
  sleep 1
  xcrun simctl launch "$UDID" "$APP_ID" >/dev/null
  sleep "$wait_s"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png"
  echo "==> $name.png"
}

# ---------------------------------------------------------------------------
# 1. A first launch, exactly as a new user gets it: the three-step setup.
#    This is also the only proof that matters at this stage — the app reaches
#    its own UI rather than a white WebView or the desktop onboarding.
# ---------------------------------------------------------------------------
launch_and_shoot "00-first-launch-onboarding" 12

echo "==> store after the first launch:"
FIRST_STORE=$(store_path)
if [ -n "$FIRST_STORE" ]; then
  echo "    $FIRST_STORE"
  cat "$FIRST_STORE"
else
  echo "    (the app has not written one)"
fi

# ---------------------------------------------------------------------------
# 2. Setup marked done, and four settings changed to values nothing defaults
#    to. Every screen below is a cold launch, so a screenshot that shows 143
#    BPM in the `neon` theme is the store surviving a relaunch and being read
#    back through Rust into the interface.
# ---------------------------------------------------------------------------
xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
sleep 1
seed_store '{
  "onboarding.version": 1,
  "onboarding.completedAt": "2026-09-20T00:00:00.000Z",
  "bpm": 143,
  "subdivision": 3,
  "theme": "neon",
  "soundType": "wood",
  "activeTab": "beat"
}'

launch_and_shoot "01-metronome" 12
xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
sleep 1

for tab in drill setlist; do
  seed_store "{\"activeTab\": \"$tab\"}"
  case "$tab" in
    drill) launch_and_shoot "02-drill" 10 ;;
    setlist) launch_and_shoot "03-setlist" 10 ;;
  esac
  xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
  sleep 1
done

seed_store '{"activeTab": "debug:settings"}'
launch_and_shoot "04-settings" 10
xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
sleep 1

seed_store '{"activeTab": "debug:zen"}'
launch_and_shoot "05-zen" 10
xcrun simctl terminate "$UDID" "$APP_ID" >/dev/null 2>&1 || true
sleep 1

# ---------------------------------------------------------------------------
# 3. And back to the metronome, to show the store is still what it was after
#    five launches — the settings a user changed do not wash out.
# ---------------------------------------------------------------------------
seed_store '{"activeTab": "beat"}'
launch_and_shoot "06-metronome-again" 12

echo "==> store at the end:"
END_STORE=$(store_path)
test -n "$END_STORE" && cat "$END_STORE"

# ---------------------------------------------------------------------------
# The app's own log. `--style compact` and a predicate on the process, so what
# comes out is Yames talking and not the whole simulator.
# ---------------------------------------------------------------------------
echo "==> the app's log for this session"
xcrun simctl spawn "$UDID" log show --last 12m --style compact \
  --predicate 'processImagePath CONTAINS "Yames" OR eventMessage CONTAINS "YamesMobile" OR eventMessage CONTAINS "[yames]"' \
  2>/dev/null | tail -200 | tee "$OUT/app-log.txt" || echo "(no log)"

echo "==> anything at error level from the app"
if grep -iE '\[yames\].*(error|panic)|Yames.*crash' "$OUT/app-log.txt" >/dev/null 2>&1; then
  grep -iE '\[yames\].*(error|panic)|Yames.*crash' "$OUT/app-log.txt"
else
  echo "(none)"
fi

# A screenshot of a crashed or blank app is still a PNG, so check the app is
# alive at the end rather than trusting the pictures.
if xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -q "$APP_ID"; then
  echo "==> the app is running at the end of the session"
else
  echo "::warning::the app is not running at the end of the session — check 06-metronome-again.png"
fi

ls -la "$OUT"
