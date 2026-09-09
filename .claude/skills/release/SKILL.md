---
name: release
description: |
  Create a new release for the yames Tauri app. Handles version bumping, commit formatting,
  and push to trigger CI. Use when the user asks to "make a release", "publish a new version",
  "bump the version", or "ship it".
metadata:
  author: a0d0oe0
sample-prompts:
  - "release 0.5.2"
  - "make a new release with these changes"
  - "ship it as a patch release"
  - "bump version and release"
arguments:
  - [version] - optional, semver version (e.g. 0.5.2). If omitted, ask the user.
---

# Release Process

## Steps

1. Run `git status` and `git diff` to see what will be included.

2. If there are uncommitted changes, commit them first with a descriptive message (NOT starting with "release"). Then proceed.

3. Determine the version. If not provided, suggest based on changes:
   - Bug fixes / polish → patch (0.x.Y)
   - New features → minor (0.X.0)

4. Bump version in all 3 files:
   - `package.json` → `"version": "{VERSION}"`
   - `src-tauri/tauri.conf.json` → `"version": "{VERSION}"`
   - `src-tauri/Cargo.toml` → `version = "{VERSION}"`

5. Commit with exact format — **the commit body is the release notes**:
   ```
   release v{VERSION} — {summary}

   **New**

   - {biggest new feature}
   - {next feature}

   **Improved**

   - {improvement}

   **Fixed**

   - {bug fix}
   ```
   The subject MUST start with `release` — this triggers CI. The body is
   published as written: it becomes the GitHub release notes, the entry in
   the website's changelog, and the "what's new" the app shows after it
   updates (`latest.json`, which the updater reads, is generated from the
   same text). No later edit reaches all three, so get it right here.

   **Format rules:**
   - Order items biggest → smallest impact. Bug fixes and polish go last.
   - `**New**`, `**Improved**`, `**Fixed**` as section labels; only the ones
     that apply. A pure bug-fix release just has `**Fixed**`.
   - Bullets start with `- `. No `##` headings — the changelog renderer drops them.
   - Write for a musician: what changed for them, not which file changed.
   - Wrap lines freely — CI joins a wrapped bullet back into one line. Do not
     add `Co-Authored-By` or other trailers; CI strips them.
   - If the body is empty, CI uses the subject's `{summary}` as the single
     bullet. With no summary either, the release job fails before building
     anything — write the notes and make a new release commit.

6. Push: `git push origin main`

7. Nothing to edit afterwards. If the notes must be corrected later, wait
   until every build job has finished — each one rewrites the release body as
   it completes, so an earlier edit is overwritten — then
   `gh release edit v{VERSION} --repo turutupa/yames --notes …`. That changes
   the GitHub page only: the copy in `latest.json`, which the app shows after
   updating, stays as the commit said.

## What CI does automatically

No manual intervention needed after push:
- Builds macOS (ARM + Intel .dmg + .pkg), Windows (.exe + .msi), Linux (.AppImage + .deb)
- Creates the GitHub release with all artifacts, the commit body as its notes,
  and a `latest.json` for the in-app updater carrying the same notes
- Updates Homebrew cask in `turutupa/homebrew-tap` (version + SHA)
- Submits winget-pkgs PR via wingetcreate

## Rules

- Version in commit message must match version in files
- The release commit's body is what users read — never leave it empty for a
  release with more than one thing in it
- Never include unrelated/uncommitted changes in a release commit
- `Casks/yames.rb` version/SHA is updated by CI — do not edit manually for releases
- Do not amend or squash — always create a new commit
