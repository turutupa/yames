# App Store GPL exception — draft text and consent request

For M06 (iOS). Yames is GPL-3.0-or-later. Apple's App Store Terms of
Service add restrictions (limits on redistribution and use) that GPLv3
section 7 does not allow a distributor to layer on top of the license.
The standard fix, used by a number of other GPL/AGPL mobile projects
that ship through app marketplaces, is an explicit "additional
permission" statement from the copyright holders that carves out
marketplace distribution. This document is that draft, plus what the
owner needs to send before it can be added to `LICENSE`.

**Nothing below is added to `LICENSE` by this task.** The brief for
M05a is explicit that the owner decides when. This file is the draft
and the paper trail for that decision.

## Who needs to agree

`git log --all --grep="(#8"` shows one external contribution: PR #8,
*"feat: i18n system (auto-discovered locales) + zh-CN and 13 more
languages"*, commit `23e9b840`, merged 2026-09-02. Its diff touches
`src/i18n.ts`-equivalent infrastructure and locale files — code that
would ship inside the iOS binary. Everything else in the repository's
history has the owner as author. With `aubio` removed from the mobile
build (M01), no other third-party GPL code is linked into the mobile
binary. So exactly one consent is needed before the exception can
honestly say "the copyright holders" (plural intended, or singular if
the PR #8 author's contribution is re-licensed/removed first — that
choice is the owner's, not drafted here).

## Draft exception text

Adapted for Yames from the pattern several other GPL/AGPL projects use
for app-marketplace distribution (the concept, not a verbatim copy of
any one project's wording — see "Sources consulted" below). This is a
starting point for the owner (and, ideally, a lawyer or the FSF's own
licensing help — they offer to help projects word exactly this kind of
exception) to review before it becomes binding text in `LICENSE`.

```
Additional permission under GNU GPL version 3 section 7

As an additional permission under GNU General Public License version 3
section 7, the copyright holders of Yames give you permission to
distribute Yames, or a work based on it, through an app marketplace
(including but not limited to Apple's App Store) even where that
marketplace's terms of use impose restrictions that would otherwise be
incompatible with the GPL, provided that the complete corresponding
source code for the distributed version remains publicly available,
under the GPL and including this same permission, through at least one
channel that carries no such additional restrictions — for example,
https://github.com/turutupa/yames.

This permission is not an exception to any other term of the GPL, and
it does not apply to distribution through any channel that fails to
meet the source-availability condition above.
```

## Where this text goes once approved

1. **`LICENSE`** — a new section appended after the standard GPLv3
   text (not edited into it), following the usual convention of
   putting "additional permissions" as a clearly separated addendum
   with its own heading, exactly as drafted above.
2. **About screen legal line** — `src/containers/settings/AboutSection.tsx`
   already renders a version row and a footer line
   (`settings.about.madeWith`). Add one more short line there, e.g.
   "Yames is free software (GPL-3.0-or-later, with an App Store
   exception) — source and licence: github.com/turutupa/yames", as a
   new `settings.about.*` string in `src/locales/en.json` (and the
   other 14 locales, per the mobile rules on user-visible strings).
   Not done in this task — `src/` is out of scope for M05a.

## Five-line consent request (paste to the PR #8 author)

Send as a GitHub comment on PR #8, or a DM if the owner has another
channel to that contributor. Fill in the exception text above (or the
final version, if it changes) where marked.

```
Hi — Yames is preparing an iOS release. Apple's App Store terms
require GPL projects to add an explicit exception (GPLv3 §7) before
their code can be distributed there; the full text is here: [link to
LICENSE-EXCEPTION.md or the final LICENSE section]. Your PR #8
(i18n system) is the one external contribution in the codebase, so I
need your OK to add this exception covering your commit before I can
ship on the App Store. Could you reply here with a yes (or let me know
if you'd rather I keep your contribution GPL-only and rework that code
before the iOS build)? Thanks either way — happy to answer questions
about what this does and doesn't change for your code.
```

## Sources consulted

- FSF, "GPL Enforcement in Apple's App Store" and "Protecting free
  software against confusing additional restrictions" — background on
  why GPLv2/v3 and the App Store terms conflict, and that the FSF
  offers to help projects draft an exception statement. I did not
  obtain FSF-drafted text directly (would need to contact them); the
  clause above is an independent formulation of the same idea.
- A community-drafted "additional permission under section 7" clause
  for app-store distribution, of the kind circulated among GPL/AGPL
  mobile projects (seen, for example, in a licensing discussion on the
  wger-project/flutter repository, itself citing an app called Feeel).
  I paraphrased and adapted this pattern rather than reproducing any
  single project's exact sentence, and changed AGPL wording to GPL to
  match Yames' actual license.

**Verify before this becomes binding text:** get a second opinion
from someone with actual legal training, or from the FSF's licensing
help, before putting this in `LICENSE`. This draft is reasoned from
public discussion of the problem, not reviewed by a lawyer.

## Open questions for M06

- Does the owner want the exception to cover only Apple's App Store,
  or app marketplaces generally (Google Play's terms do not have the
  same conflict, but a broader clause costs nothing and covers future
  stores)? The draft above already says "including but not limited to
  Apple's App Store" — confirm that is wanted before it ships.
- If the PR #8 author does not respond or declines, M06 needs a
  fallback: rewrite the i18n infrastructure PR #8 touched, or drop
  the exception and drop iOS. Decide before M06 is blocked on it.
