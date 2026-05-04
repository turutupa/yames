# Tauri Updater — Implementation Plan

In-app auto-update using `tauri-plugin-updater`. Replaces the current "redirect to website" flow with a seamless download-and-install experience.

## How It Works

1. App calls `check()` → fetches `latest.json` from GitHub Releases
2. Compares version against current app version
3. If newer: downloads the update artifact, verifies the cryptographic signature
4. Installs and restarts (macOS/Linux) or quits-and-installs (Windows)

No custom server needed — GitHub Releases hosts everything. `tauri-action` generates `latest.json` and `.sig` files automatically during CI.

## Prerequisites

### 1. Generate Signing Keys

```bash
npm run tauri signer generate -- -w ~/.tauri/yames.key
```

This creates:
- `~/.tauri/yames.key` — **private key** (NEVER commit this)
- `~/.tauri/yames.key.pub` — **public key** (goes in `tauri.conf.json`)

**Store the private key safely:**
- Save in a password manager (1Password, Bitwarden, etc.)
- Also add to GitHub Actions as a secret

If you lose the private key, existing users can never update (new signatures won't match the public key baked into their app).

### 2. Add GitHub Actions Secret

Go to: `github.com/turutupa/yames/settings/secrets/actions`

Add:
- `TAURI_SIGNING_PRIVATE_KEY` = contents of `~/.tauri/yames.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = password (if you set one during generation)

## File Changes

### `src-tauri/Cargo.toml`

```toml
[dependencies]
tauri-plugin-updater = "2"
```

### `src-tauri/src/lib.rs`

Register the plugin:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

### `src-tauri/tauri.conf.json`

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<CONTENTS OF yames.key.pub>",
      "endpoints": [
        "https://github.com/turutupa/yames/releases/latest/download/latest.json"
      ]
    }
  }
}
```

### `src-tauri/capabilities/default.json`

Add to permissions array:

```json
"updater:default"
```

### `package.json`

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

### Frontend — Replace Current Check Logic

Replace the current `checkForUpdate()` fetch-from-GitHub approach with:

```typescript
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const update = await check();
if (update) {
  await update.downloadAndInstall((event) => {
    // Optional: track progress for a progress bar
    if (event.event === "Started") console.log(`Downloading ${event.data.contentLength} bytes`);
    if (event.event === "Progress") console.log(`Downloaded chunk: ${event.data.chunkLength}`);
    if (event.event === "Finished") console.log("Download complete");
  });
  await relaunch();
}
```

### CI — `release.yml`

No workflow changes needed. Just ensure the secret is set:
- `tauri-action` detects `TAURI_SIGNING_PRIVATE_KEY` in the environment
- Automatically generates `.sig` files and `latest.json` per platform
- Uploads them as release assets alongside the DMG/EXE/AppImage

## Platform Behavior

| Platform | Update format | Behavior |
|----------|--------------|----------|
| macOS | `.app.tar.gz` | Downloads, replaces `.app`, relaunches |
| Windows | `.exe` (NSIS) | App auto-quits, installer runs, app restarts |
| Linux | `.AppImage` | Downloads, replaces AppImage, relaunches |

### Windows `installMode` (optional)

```json
"plugins": {
  "updater": {
    "windows": {
      "installMode": "passive"
    }
  }
}
```

- `"passive"` (default) — small progress window, no user interaction
- `"basicUi"` — shows installer UI, requires user clicks
- `"quiet"` — silent, no UI at all (needs admin or user-wide install)

## UI Changes

The update banner already exists. Changes needed:
1. Replace `checkForUpdate()` in `ipc.ts` with `check()` from the plugin
2. Add a progress bar to the banner during download (optional but nice)
3. Change "Download →" to "Install & Restart" since it's now in-app
4. Keep the "Check for updates" toggle in General settings (controls auto-check on boot)

## Migration Notes

- Set `"createUpdaterArtifacts": true` for new installs
- If migrating users from pre-updater versions, use `"v1Compatible"` instead (not needed here since no prior updater existed)
- The first release with the updater won't auto-update existing users (they need to manually update one last time). After that, all future updates are automatic.

## Rollback

If something goes wrong:
- Remove the plugin, ship a release without updater artifacts
- Users on the broken version would need to manually reinstall (one-time)
- The updater only installs if the signature matches, so a compromised artifact without the key can't be installed
