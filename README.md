# b3-builder

The Bespok3d plugin build system. It turns a plugin source dir (or a repo of plugin dirs) into a gated,
class-aware, signed `.b3` package plus its index atom, the same way in two places:

- **locally**, as a `bespok3d build` CLI a plugin publisher runs on their machine, and
- **in CI**, as a reusable GitHub Action every plugin repo pulls in,

both over ONE importable core (`bake` then `pack` then `index` then `sign` then `gate`). The core is a
library, so a downstream target (the Bespok3d app's in-app package builder, later) can consume it too.

This is a **publisher-facing** domain: the tools and docs for anyone who wants to build and ship a `.b3`
with ease. It is deliberately its OWN repo, distinct from `lib_bespok3d`, which is the INTERNAL SDK (the
common code shared across the app, the daemon, and the jinni). Two audiences, two repos.

## The hard boundary (what this tool is, and is NOT)

b3-builder's unit is a plugin dir, or a repo of plugin dirs. It **never** contains, reads, or reasons
about: bundle curation, dev/release channels, dev variants, `+dev` build-tags, any "official"/combined
catalog, doc-staging into app directories, or org/publisher identity. Publisher/org identity (the atom
doc_url repo, the sub-list name and publisher) is ALWAYS a parameter passed in, with no baked default.
The Bespok3d app is ONE consumer among several; its offline-bundle machinery lives in the app, not here.
See ADR-0041 and `../Bespok3d/doc/build-system-consolidation.md` for the full boundary and consumer model.

## Status: clean publisher core, plus the reusable CI Action (relay packet 8)

The repo shape, the pipeline skeleton, both faces, the gate, and the golden-equivalence harness landed in
packet 1; packet 2 ported `pack` and `index`. Packet 3 corrected the seam: the core is now shaped around
the publisher unit (a plugin dir, or a repo of plugin dirs), identity is a passed-in parameter, and
skip-if-unchanged is an opt-in mode. Packet 4 relocated everything app-flavored (the offline-bundle
assembly, dev channels, the "official" catalog, doc-staging) out of the temporary `src/compat/`
quarantine and into the app's own build glue (`../Bespok3d/scripts/app-bundle.mjs`), which imports this
core as a library (`packIfChanged`, `builderVersion`). `src/compat/` no longer exists; b3-builder is now
a clean publisher tool with zero app coupling. Packet 5 landed `bake` (the per-class dispatch); packet 6
landed `gate` (the one class-aware refuse-to-pack gate, see below); packet 7 migrated the networking
pilot's `bake` fields and device-verified the `.ko`. Packet 8 landed the reusable CI Action that wraps the
tool with GitHub release + register orchestration (see "The reusable CI Action" below). Only `sign`
remains a seam. Still ahead, across the relay (`~/.claude/plans/relay-build-system-consolidation.md`):

| Step | What it does | Lands in |
| --- | --- | --- |
| `bake` | per-class bake dispatch (pip, go, download, docker-c, docker-ko) | done |
| `pack` | build the `.b3` (checksummed manifest, files, doc) + opt-in skip-if-unchanged | done |
| `index` | each plugin's atom, plus a leaf sub-list for a repo of plugin dirs | done |
| `gate` | one class-aware refuse-to-pack gate | done |
| `sign` | GPG-sign the `.b3` and the atom/list (a no-op seam today) | packet 10 |

## The bake dispatch (R1)

A plugin whose payload is a build output declares HOW to build it, so the tool runs the right baker
instead of the plugin hand-rolling a `build.sh`. `bake` is an OPT-IN mode (`--bake`), like skip-unchanged:
a real publisher / CI build turns it on to produce payloads from source; a build over an already-baked
tree (the golden rail, the app's own build glue) leaves it off and `bake` is a passthrough.

Two declaration sources, one dispatcher:

- **Python deps (class 2)** stay presence-driven off a `requirements.txt` / `klipper_requirements.txt`
  at the plugin root (ADR-0036 fixes it as a FILE, never a manifest field).
- **The four compiled / fetched classes** are declared in a `bake` manifest field, a list keyed on `class`:

| `class` | Bakes | Reproduces |
| --- | --- | --- |
| `go` | a static arm64 Go binary (CGO off), pinned to a source commit | `prometheus-exporter/build.sh` |
| `download` | sha-pinned upstream binaries (`.deb`, `.tar.xz`, `.tar.gz`), verified + extracted + installed | `zerotier` / `tailscale` / `system-utils` |
| `docker-c` | a native C binary + `.so` cross-built in Docker (arm64 under QEMU) | `u1-hw-camera/toolchain/build.sh` |
| `docker-ko` | a cross-compiled kernel module, staged as the manifest's kernel variant | `tun-module/toolchain/build.sh` |

The kernel axis (`docker-ko`) is modeled distinctly from an arch tuple: the step carries a `kernel`
`{ release, vermagic }`, and the bake asserts vermagic at build time only. A vermagic match is necessary
but NOT sufficient (ADR-0039), so this bake never claims the module works; the on-device capability
exercise is the pilot's job (packet 7). The two Docker classes preflight `docker info` and, if the daemon
is down, tell the user to start Docker rather than surfacing the raw socket error.

## The refuse-to-pack gate (R2)

`gate` is the one class-aware check that a plugin's declared payload was actually baked, so an unbaked
payload can never be packed into a broken `.b3` regardless of which repo the plugin lives in. It
generalizes the shell packer's Python-only `ensure_baked` / `check_baked_deps` / `check_baked_kmodule` to
every class:

| Class | Declared by | Baked output the gate asserts exists |
| --- | --- | --- |
| 2 (Python) | `requirements.txt` / `klipper_requirements.txt` presence | `files/wheels` / `files/site-packages` is non-empty |
| 3 (`go`) | the `bake` step's `output` | that file |
| 4 (`download`) | each fetch member's `dest` | each member file |
| 5 (`docker-c`) | each `expect` name under `dest` | each artifact |
| 6 (`docker-ko`) | each variant step's `variant_dest` | each `.ko` variant file |

A binary-only plugin (class 1: config / text / patch, no Python deps, no bake step) declares nothing to
bake, so it has no gap and packs clean. The gate checks OUTPUT EXISTENCE, not whether a bake ran in this
build, so a plugin baked out-of-band and a `--bake` build both pass; only a genuinely unbaked plugin
fails. It never claims a `.ko` works (a vermagic string is not a gate, ADR-0039); it asserts only that the
variant file was baked. The pipeline runs it LAST, so a consumer never publishes an unbaked `.b3`. Because
the check only inspects the source tree, a library consumer that packs via `packIfChanged` rather than the
full pipeline (the app's bundle glue) calls the same exported `assertBaked` before it packs; between the
two, no path can ship an unbaked payload.

## Usage

```sh
# one plugin dir (unit auto-detected: the dir holds a manifest.json)
bespok3d build --source ./my-plugin --out dist --atom-repo my-org/my-plugin

# a repo of plugin dirs (atoms plus an assembled sub-list)
bespok3d build --source . --out dist --atom-repo my-org/my-repo \
  --list-name "My Repo" --list-publisher my-org

# opt-in skip-if-unchanged: reuse an existing .b3 whose fingerprint is unchanged
bespok3d build --source . --out dist --atom-repo my-org/my-repo \
  --list-name "My Repo" --list-publisher my-org --skip-unchanged

# opt-in bake: produce each plugin's payload from source (its declared bake class + ADR-0036 deps)
bespok3d build --source ./my-plugin --out dist --atom-repo my-org/my-plugin --bake
```

```yaml
# CI (a repo's whole release workflow: build -> test -> pack -> release -> index -> register)
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: Bespok3d/b3-builder@v1
  with:
    unit: repo
    bake: 'true'
    atom-repo: ${{ github.repository }}
    list-name: My Repo
    list-publisher: my-org
    list-ref-name: My Repo
    main-index-repo: my-org/main-index
    main-index-token: ${{ secrets.MAIN_INDEX_TOKEN }}
```

See "The reusable CI Action" below for what each input does and the secrets model.

## The reusable CI Action (R5)

`action.yml` is a **composite** GitHub Action that gives a plugin repo its whole CI from one `uses:`
instead of each repo re-copying a `release.yml`. It wraps the same core the CLI runs and adds the
GitHub-specific orchestration around it, in order:

| Step | What runs |
| --- | --- |
| build + pack + index | one `bespok3d build` invocation (bake the per-class payloads, pack the `.b3` set, assemble the atoms + sub-list, gate) |
| test | each plugin's `tests/run.sh`, on the baked tree (a failing test aborts before any release is cut) |
| release | a GitHub release + `.b3` asset per plugin, collecting each asset's API URL |
| index (finalize) | swap each sub-list entry's placeholder `download_url` (the bare `.b3` filename) for the real release asset URL |
| register | reference the assembled sub-list in the index-of-lists repo |

The `download_url` finalize step is why the core writes a placeholder filename in the first place: a
GitHub release asset URL only exists after the upload and is a CI artifact, so the tool stays
GitHub-agnostic and the Action fills the field (`src/action/inject-release-urls.ts`, tested). Nothing
about GitHub releases or a specific org lives in the core.

**Org identity arrives ONLY via inputs, never baked into the Action logic** (the hard boundary, ADR-0041):

| Input | What it is |
| --- | --- |
| `atom-repo` | owner/repo each atom's doc_url points at (usually `${{ github.repository }}`) |
| `list-name` / `list-publisher` | the assembled sub-list's own name + publisher (repo unit) |
| `list-ref-name` | the display name the sub-list is registered under in the index-of-lists |
| `main-index-repo` | the index-of-lists repo the sub-list registers into |
| `main-index-token` | a token with contents write on that repo; empty skips the register step |
| `exclude-dirs` | space-separated subdirs that hold a `manifest.json` but must never publish (a dev-only variant, e.g. `fluidd-bleeding-edge`); skipped by build discovery AND the release loop |
| `bake` / `skip-unchanged` | opt into building payloads from source / reusing unchanged `.b3` files |

`exclude-dirs` is caller-supplied curation, the same shape as identity: the tool learns only which named
dirs to skip, never that a dir is a "dev variant" (no bundle/variant concept enters the core, ADR-0041).
A repo with a dev-only UI variant wires it as `exclude-dirs: fluidd-bleeding-edge` in its own `release.yml`.

### The secrets model

The only secret the Action needs is `main-index-token`: a token with contents write on the index-of-lists
repo, so a plugin repo's CI can register its sub-list there (the per-repo `GITHUB_TOKEN` cannot write a
sibling repo). The caller wires it from a secret, `main-index-token: ${{ secrets.MAIN_INDEX_TOKEN }}`.

- **Today (private alpha):** each repo carries its own `MAIN_INDEX_TOKEN` Actions secret. GitHub Free
  cannot expose an ORG secret to PRIVATE repos, and all Bespok3d repos are private, so per-repo is forced.
  The same token value works on every repo (it authenticates to the destination index-of-lists; the source
  repo identity is irrelevant), and runs as the token owner's identity regardless of who pushes, so
  contributor pushes keep working.
- **When the repos go public (AGPL, the planned end state):** create ONE **org** secret `MAIN_INDEX_TOKEN`
  (org secrets work on Free once the repos are public), set its visibility to all/selected repos, and
  delete every per-repo copy. Future repos inherit it with zero per-repo upkeep. This is the centralization
  R5 buys: N hand-copied `release.yml` files with N secret sets collapse to one Action + one org secret.

See [[project_ci_secrets_centralization]] for the full history (the GitHub-Free constraint, the push-race
that bit material-tags, the seat-cost facts).

### Push-race hardening

Both git pushes the Action makes (this repo's `index.json`, and the sub-list ref in the index-of-lists)
retry on a non-fast-forward rejection: up to five attempts, rebasing on the remote between tries. This
replaces the bare co-repo self-push that once left a stale index (material-tags, 2026-06-30). A same-file
concurrent conflict still exhausts the retries and fails loud (re-run a FRESH `workflow_dispatch`, never a
re-run, which re-checks-out the stale trigger SHA).

### Deploying the Action

`uses: Bespok3d/b3-builder@<ref>` requires this repo pushed to GitHub as a reusable-action repo. Because
`dist/` and `node_modules/` are gitignored, the Action builds itself from source (`npm ci` + `npm run
build`) on each run before invoking the tool. Committing `dist/` or publishing to npm would remove that
step; it is deferred (a build adds a modest per-run cost, not a correctness concern).

## The golden-equivalence harness

The core is ported behind a rail that proves it reproduces the current build output byte-for-byte before
anything depends on it. `test/golden/` holds committed fixtures snapshotted from the legacy scripts.
"byte-for-byte" means: the atoms and sub-list match by **content** (parsed, deep-equal, in the exact
canonical JSON the system writes), and each `.b3` matches by the **content hash of every payload / doc
file** plus its parsed manifest (a `.b3` is a zip whose framing is non-deterministic, so the invariant is
its content, not its zip bytes).

- `test/equivalence.test.ts` is the **publisher rail**: it builds one plugin dir and a repo of plugin
  dirs (the networking co-repo) via the clean core with identity passed in, and matches the golden.
  (The monorepo-bundle rail, the app's own concern, relocated to `../Bespok3d/scripts/test/` in packet 4.)

`npm run capture-golden` re-snapshots the networking golden from the current plugin trees (re-run it if a
plugin source changes; review the recapture).

## Development

```sh
npm install
npm run check   # the gate: RULE ZERO, eslint, typecheck, build, the equivalence rail
npm test        # the rail on its own
```

Agent instructions and the engineering rules for this repo live in [CLAUDE.md](CLAUDE.md). Read it before
making changes, whichever tool you are.
