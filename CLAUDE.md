# b3-builder: instructions for AI assistants

You are working in b3-builder, the Bespok3d plugin build system: the drop-in that turns a plugin source
dir into a gated, class-aware, signed `.b3` plus its index atom, the same way locally (a `b3-builder build`
CLI) and in CI (a reusable GitHub Action) over one importable core. This file is the contract for any LLM
or agent that touches this repo. Contributors here use AI assistance, so the rules and the design intent
are written down and enforced in the gate, not left implicit. Read them and uphold them; the human
reviewer rejects a PR that ignores them.

If you are a non-Claude tool, `AGENTS.md` points you here.

## What this repo is (and is NOT)

- b3-builder is **publisher-facing**: the tools and docs for anyone who builds and ships a `.b3`, on their
  own machine AND on GitHub Actions. It is its OWN repo and its OWN domain.
- It is NOT `lib_bespok3d`. That is the INTERNAL SDK: the common code shared across the app, the daemon,
  and the jinni (its public surface serves adapter and jinni developers). Two different audiences, two
  repos. Do not fold build-system code into the SDK or SDK code into here.
- The core is an importable library so a downstream TARGET (the app's in-app package builder, later) can
  consume it. Building that consumer is a SEPARATE effort, NOT this repo's work. Do not add it here.

### THE HARD BOUNDARY (LAW; re-introducing any of this is WRONG regardless of convenience)

b3-builder's unit is a plugin dir, or a repo of plugin dirs. A plugin dir builds to one `.b3` + its atom;
a repo of plugin dirs builds to a `.b3` + atom each, plus one assembled leaf sub-list. It **never**
contains, reads, or reasons about:

- bundle curation (`bundle.json` / `bundle.dev.json`), dev/release channels, dev variants, `+dev`
  build-tags, any "official"/combined catalog, or doc-staging into app directories;
- org/publisher identity: the atom doc_url repo, the sub-list name, and the sub-list publisher are ALWAYS
  parameters passed in, with NO baked default. (The npm/Action distribution metadata, `@bespok3d/builder`
  and the `bespok3d` bin and the Action slug, is exempt: that is packaging identity, not an output
  default. A plugin manifest's `channel` catalog FIELD is also legitimate and stays.)

The Bespok3d app is ONE consumer among several (a publisher's CLI, a plugin repo's Action, the app's
dev/release builds, the future Create-tab dev tools). The app's local-index / offline-bundle loader is APP
machinery and must never leak in. The hard boundary: the tool's identity, the org and the
signing key, is always an INPUT to a run, never baked into the tool.

### No compat layer

`src/compat/` (the temporary legacy monorepo-bundle quarantine: offline bundle assembly, dev channels,
the "official" catalog, doc-staging, the `--kind`/`--channel` CLI surface) was relocated into the app's
own build glue (a library consumer of this core) and deleted. Do NOT re-add any of that vocabulary to
`src/core/`, `src/cli/`, or `src/action/`. A
grep of `src` for `monorepo|bundle\.json|bundle\.dev|BundleChannel|coerceChannel|--channel|\+dev|Official|doc-stage|Bespok3d`
must be clean.

## Read these first

- [README.md](README.md): what the tool is, the pipeline, the current scaffold status, the golden harness.
- The artifact classes the tool bakes and packs are described below and in the README. Do NOT re-derive the
  class set; a new class is added only if a genuinely new one appears.

## The non-negotiables (the floor)

1. **RULE ZERO: no em-dash or en-dash, anywhere.** Use a comma, colon, semicolon, parentheses, or two
   sentences. A hyphen in a compound word is fine. Enforced by `scripts/rule-zero-guard.mjs` in the gate.
2. **Every identifier carries domain meaning.** A name says what the thing IS in the domain, never its
   type, position, or a role-free abbreviation. No `a` / `b`, `tmp`, `data`, single letters.
3. **Nesting beyond one level is suspicious.** Flatten by default: guard clauses, early returns, an
   extracted named function, a named lookup instead of a nested ternary. Enforced by eslint `max-depth: 2`
   and `no-nested-ternary`; the callback-pyramid case stays review.
4. **Separation of concerns.** One responsibility per file and function. A file past ~150 lines is doing
   too much: split by concern into sibling files, not many functions in one file.
5. **Reuse before create: there is ONE core.** Never author a second packer or a fresh index generator.
   The forked co-repo generators are deduped INTO this core, not copied. Before adding a helper, find the
   existing one and extend it.
6. **Rule of three.** The third copy of a logic block, shape, or constant gets extracted. Duplication is a
   bug; "no premature abstraction" forbids generalizing for one caller, it does not excuse copy-paste.
7. **Write less first.** Prefer stdlib / an existing helper; write the smallest clear solution. A means to
   readability, never code-golf.

## The pipeline and its seams

The one core runs four ordered steps, and every face (CLI, Action, and one day the app dev tools) runs the
same pipeline: `bake` then `pack` then `index` then `gate`. Each step lives in `src/core/steps/`. GPG
detached signing is not a discrete step: `pack`
signs each packed `.b3`'s manifest in place as part of packing it (identity is an input, never
baked). The byte-generic primitive lives in `src/core/build/sign-bytes.ts` (`signDetached` / `verifyDetached`,
openpgp v6); `src/core/build/archive.ts`'s `signManifestInPlace` calls it over the exact zip bytes of the
already-written `manifest.json` entry and adds the detached signature as `manifest.json.sig` inside the same
archive. It is gated on an optional `request.signingKey`: undefined (no key supplied, e.g. before a caller
has key distribution wired up) packs unsigned; a key present means every package gets a real detached
signature. An unsigned build over a manifest that hand-declares a real key fingerprint as its `publisher`
is REFUSED, not packed (`src/core/build/publisher-claim.ts`): that name is a claim and the packed signature
is its only proof, so shipping it with no key behind it hands the reader an identity it can never check.

**A signed build also STAMPS the publishing identity, and stamping runs BEFORE signing.** The publisher
is a KEY fingerprint: a source repo cannot know which key will sign its release (its manifest checks in a
placeholder), and a key rotation would otherwise have to be hand-edited into every repo. So `runPipeline`
derives the fingerprint once from `request.signingKey` (`signingKeyFingerprint`) onto
`PipelineContext.publisher`, `pack` writes it into each packed `manifest.json`
(`archive.stampManifestPublisherInPlace`) and only then signs those bytes, and `index` gives every catalog
atom the same value, so a package and the entry offering it can never name two different publishers. An
unsigned build claims no identity and leaves the declared value alone. This bakes in no default:
the key is an input, and the sub-list's own `publisher` field stays the caller's
`--list-publisher`, which is list curation the signing key says nothing about. The `gate` step is the class-aware refuse-to-pack gate (see below).

**KEY MATERIAL reaches `request.signingKey` through the `B3D_SIGNING_KEY` environment variable, never a
CLI flag** (`src/cli/build-request.ts`; the Action passes it in the step env, `action.yml`). Two hard
reasons: an ASCII-armored private key starts with `-----BEGIN`, and node's `parseArgs` refuses any option
value starting with a dash, so a `--signing-key` flag could never carry a real key (it threw "argument is
ambiguous" on every signed build until 2026-07-19); and an argv-borne private key is readable by every
process on the machine through `ps` and `/proc/<pid>/cmdline`. Do not reintroduce that flag.

**A key REFERENCE is a different thing and does travel in argv: `--sign <key-file|key-id>`**
(`src/cli/signing-key.ts`), the channel a person publishing from their own machine wants. A path or a key
id is neither secret nor dash-prefixed, so neither hard reason applies; `resolveSigningKey` turns it into
the same armored key by reading the file or exporting the secret key from the local GnuPG keyring, and an
explicit `--sign` wins over the ambient environment. A reference that resolves to no secret key throws:
never let it degrade to an unsigned build, which is the silent failure the whole signing effort exists to
end. The seam is
covered end to end by `test/signing-path.test.ts` (invocation plus environment into a request, request
through the whole pipeline, signature read back out of the produced `.b3`); a unit test over
`signManifestInPlace` alone does NOT prove a real build signs, which is exactly how the broken flag
survived a green gate.

### The bake dispatch (`src/core/bake/`)

`bake` runs the right baker per artifact class, absorbing the per-plugin `build.sh` zoo. It is an OPT-IN
mode (`request.bake`), like skip-unchanged: a real publisher / CI build turns it on to build payloads from
source; a build over an already-baked tree (the golden rail, the app glue) leaves it off and `bake` is a
passthrough. A plugin that declares no bake step is a passthrough even with baking on.

- **Two declaration sources, one dispatcher** (`bake/dispatch.ts`): the presence-driven Python bake
  (a `requirements.txt` FILE, never a manifest field) plus the manifest's `bake`
  field, a list keyed on `class` (`go`, `download`, `docker-c`, `docker-ko`), parsed in `bake/manifest-bake.ts`.
- **The runner seam** (`bake/runner.ts`): a baker never calls `spawnSync` directly. It takes an injectable
  `CommandRunner`, so a real build runs the command and a unit test injects a fake runner that records the
  invocation and simulates its output. This is what proves each baker constructs the exact command the
  legacy `build.sh` runs WITHOUT executing docker / pip / go in the gate. Docker builds are multi-minute
  QEMU jobs; they cannot run in a hermetic gate, so the per-class tests assert command-equivalence to the
  legacy scripts + the baker's own staging/verify logic against a fixture output. The `download` class,
  cheap and hermetic, is tested for REAL (curl `file://` + tar + sha verify) against a local fixture.
- **The kernel axis (`docker-ko`) is modeled distinctly from an arch tuple**: a `kernel { release, vermagic }`
  block, and the bake asserts vermagic at build time ONLY. A vermagic match is necessary but NOT sufficient;
  this bake never claims the module works. The on-device capability exercise is a later,
  on-device job, never this step's.
- **A baker that needs a toolchain says so**: the Docker classes preflight `docker info` and, if the daemon
  is down, throw a clear "Docker is required for the docker-c / docker-ko bake and is not running. Please
  start Docker and retry.", not the raw socket error the legacy scripts surface.

### The refuse-to-pack gate (`src/core/bake/assert-baked.ts`)

`gate` is the one class-aware check that every payload a plugin's manifest DECLARES was actually baked, so
an unbaked payload can never be packed into a broken `.b3`. It generalizes the shell packer's Python-only
`ensure_baked` / `check_baked_deps` / `check_baked_kmodule` (now retired from the legacy shell packer)
to every class: class 2 off the requirements files (`files/wheels` / `files/site-packages` non-empty),
classes 3 to 6 off the `bake` field (each step's output exists; a docker-ko plugin declares one step per
vermagic variant, so iterating the steps generalizes the kmodule placement check). A binary-only plugin
declares nothing to bake and packs clean.

- **It checks OUTPUT EXISTENCE, never whether a bake ran.** A plugin baked out-of-band and a `--bake`
  build both pass; only a genuinely unbaked one fails. Do NOT couple the gate to the bake mode.
- **It never claims a `.ko` works** (a vermagic string is not a gate). It asserts only that the
  variant file was baked; the on-device capability exercise is a later, on-device job, never this step.
- **Two callers, one check.** The pipeline runs `gate` LAST, so a CLI / Action consumer never publishes an
  unbaked `.b3`. Because the check only inspects the source tree, the app's bundle glue (a library consumer
  that packs via `packIfChanged`, not the full pipeline) imports the same exported `assertBaked` +
  `bakePlugin` and bakes-then-gates before it packs. Between the two, no path can ship an
  unbaked payload. This is where the retired shell `ensure_baked`'s two jobs (bake, then gate) now live.

### The reusable CI Action (`action.yml` + `src/action/`)

`action.yml` is a **composite** GitHub Action that wraps the tool with the GitHub-specific orchestration a
plugin repo's release needs: build + pack + index (one `b3-builder build`), then test, then release (a GitHub
release + `.b3` asset per plugin), then finalize each sub-list entry's `download_url` with the real release
asset URL, then register the sub-list in the index-of-lists. It exists so every repo pulls one `uses:`
instead of hand-copying a `release.yml`.

- **The core stays GitHub-agnostic.** Creating GitHub releases and pushing to the index-of-lists are the
  Action's orchestration, NOT the core's. Never add release / registry-push / gh / octokit logic to
  `src/core/`. The `download_url` finalize lives in `src/action/inject-release-urls.ts` (the Action face,
  tested) precisely because a release asset URL is a CI artifact the core must never bake in: the core
  writes the placeholder filename (`co-repo-index` `buildAtoms`) and the Action fills the real value.
- **Org identity + tokens arrive ONLY via Action inputs** (`atom-repo`, `list-name`, `list-publisher`,
  `list-ref-name`, `main-index-repo`, `main-index-token`), never a baked default. This is the same hard
  boundary the CLI honors, applied to the CI face. A hardcoded `Bespok3d/...` anywhere in the Action logic
  is WRONG; it belongs in the CALLER's `release.yml`.
- **Both git pushes are push-race hardened** (5-attempt rebase-retry). Do not weaken them back to a bare push.
- **`exclude-dirs` is caller curation, not a variant concept.** A repo with a dev-only variant dir that
  holds a `manifest.json` but must never publish (e.g. `fluidd-bleeding-edge`) passes `exclude-dirs` in
  its own `release.yml`; the Action threads it to `b3-builder build --exclude <dir>` AND skips it in the
  release loop. Discovery filters it in ONE place (`sourcesFor(request)` in `build/discovery.ts`), so
  every step (bake, pack, index, gate) skips the same dirs and cannot drift. The core learns only WHICH
  dirs to skip, never that one is a "dev variant": no `bundle.dev.json` / channel / variant knowledge
  enters the tool (the hard boundary). Do NOT replace this with a `dev_only` manifest field, which would
  bake the variant concept into discovery.

Every step is implemented; none are passthrough placeholders. Signing inside `pack` degrades to unsigned
output only when no `signingKey` is supplied (see above), which is a runtime input state, not an unfinished
step.

## The golden-equivalence harness (the rail; do not weaken it)

The core is ported behind a rail that proves byte-for-byte reproduction of the legacy build output BEFORE
anything depends on it. `test/golden/` holds fixtures snapshotted from the legacy scripts. `test/equivalence.test.ts`
(the PUBLISHER rail) builds, via the clean core with identity passed in, one plugin dir plus two real repos:
networking (a repo that publishes its own sub-list) and fluidd (an atom repo, no list, `fluidd-bleeding-edge`
excluded exactly as its migrated `release.yml` does). (The monorepo-bundle rail, the app's own concern,
lives in the app's own build glue.) The meaning of
"byte-for-byte" is in `test/harness.ts` and the README: JSON artifacts match by parsed content in the
canonical serialization; a `.b3` matches by the content hash of every payload / doc file plus its parsed
manifest (a zip's framing is non-deterministic, so the invariant is content, not zip bytes).

- **The golden is FROZEN, and there is no recapture path.** It is real output captured from the legacy
  scripts while they still existed; the migration deletes those scripts repo by repo, so the capture tool
  is retired. The rail's claim is "identical to what the legacy scripts produced", and a regenerated
  golden cannot make that claim. Never hand-write, fake, or re-snapshot a fixture.
- **One known divergence from legacy, and it is a security fix, not a port bug.** The legacy shell
  packers walked twice: `zip -qr` archived the `files/` tree as-is while `build_files_array` checksummed a
  filtered list, so `__pycache__` / `*.pyc` / `.DS_Store` rode inside the `.b3` absent from `files[]` and
  therefore uncovered by the manifest signature. The packer now uses ONE walk (`walkPackedFiles`), which
  makes `files[]` a complete inventory: `doc/`, `manifest.json` and `manifest.json.sig` are the only
  unlisted members, all three by construction. The goldens contain no junk, so this changes nothing they
  pin and the rail stays green. Do not "restore legacy fidelity" by splitting the walk again;
  `test/archive.test.ts` fails if you do.
- **The rail builds from the LIVE sibling plugin trees** (`../plugins/networking`, `../plugins/fluidd-plugin`),
  so a source change there (a version bump, an edited payload) turns it red. That is real information: the
  build output moved. Reconciling it against the frozen golden is a maintainer decision, never a quiet
  fixture edit. It also means a fresh standalone clone with no sibling plugins cannot run this rail.
- The rail is part of the must-pass gate in `scripts/check.sh`, not a reported-only status.
- Do NOT make the rail pass by weakening the comparison or by faking output. Byte-equivalence is measured
  against the real legacy output; that is the whole point.

## How to work a change

1. **Understand first.** Read the relevant step file and the README. If the intent is unclear, ask one
   specific question and stop. Do not guess and implement.
2. **Scope it to a user story.** "As a [role], I want [capability] so that [value]." Implement only what the
   story needs: no speculative features, no defensive code for cases that cannot happen.
3. **Write the code** to the non-negotiables above.
4. **Self-review** before declaring done: the non-negotiables, separation of concerns, file size, rule of
   three, typed signatures, no comment except a non-obvious why, no unused imports or vars.
5. **Run the gate and make it green:** `bash scripts/check.sh` (RULE ZERO, eslint, typecheck, build, and
   per-file REUSE licensing: every file carries an SPDX header or is covered by `REUSE.toml`, and every
   licence a file names has its full text in `LICENSES/`). This
   includes the equivalence rail that proves byte-for-byte reproduction of the legacy build output.
6. **Add a regression test** for the behavior, in the same change, at the layer that catches its regression.
7. **Keep the docs current.** Update the README and this file if a boundary, a seam, or the status changes.

## Hard constraints

- **Never run git.** The maintainer commits and pushes. Leave the tree green and hand over exact commands
  if a git action is needed.
- **Never fake acceptance.** No stub that makes the rail green without the real port; no shadow copy of a
  working generator. If the real work is not achievable, report BLOCKED and stop.
- **GPG signing is real, not deferred.** `archive.ts`'s `signManifestInPlace`, called from `pack.ts`,
  calls `signDetached` (openpgp v6, see "The pipeline and its seams") whenever `request.signingKey` is set,
  over the packed manifest's exact zip bytes. Do not reintroduce a no-op passthrough or a stub that skips
  actually signing when a key is present.
- **The kernel axis is different.** For a `.ko`, verification is an on-device capability exercise,
  NEVER a vermagic string and never a bare insmod (both are necessary but not sufficient). The bake step
  may assert vermagic at bake time; it may not claim the module works without a device exercise.
- **Keep the no-compile-on-printer discipline uniformly.** The printer never compiles or pips anything; all baking
  is CI-time, for every class. Any step that blurs this is wrong.
- **Gate must stay green** before any change is considered done.

## When you are unsure

Ask one specific question and stop. Do not guess and implement, do not "try something reasonable," do not
burn a long reasoning loop. The architecture is decided by the maintainer; your job is to implement it to
the rules above.
