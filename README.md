# b3-builder

The Bespok3d plugin build system. It turns a plugin source dir into a gated, class-aware, signed `.b3`
package plus its index atom, the same way in two places:

- **locally**, as a `bespok3d build` CLI a plugin publisher runs on their machine, and
- **in CI**, as a reusable GitHub Action every plugin repo pulls in,

both over ONE importable core (`bake` then `pack` then `index` then `sign` then `gate`). The core is a
library, so a downstream target (the Bespok3d app's in-app package builder, later) can consume it too.

This is a **publisher-facing** domain: the tools and docs for anyone who wants to build and ship a `.b3`
with ease. It is deliberately its OWN repo, distinct from `lib_bespok3d`, which is the INTERNAL SDK (the
common code shared across the app, the daemon, and the jinni). Two audiences, two repos.

## Status: scaffold (relay packet 1)

The repo shape, the pipeline skeleton, both faces, the gate, and the golden-equivalence harness are in
place. The core's real behavior is being ported in from the scattered legacy scripts across the relay
(`~/.claude/plans/relay-build-system-consolidation.md`):

| Step | What it does | Lands in |
| --- | --- | --- |
| `bake` | per-class bake dispatch (pip, go, download, docker-C, docker-ko) | packet 3 |
| `pack` | build the `.b3` (checksummed manifest, files, doc) | packet 2 |
| `index` | the bundled index / per-plugin atom / co-repo sub-list | packet 2 |
| `sign` | GPG-sign the `.b3` and the index (a no-op seam today) | packet 8 |
| `gate` | one class-aware refuse-to-pack gate | packet 4 |

Until the core is ported, a real build fails loudly (it never ships an empty `.b3`), and the
golden-equivalence harness (below) is red on purpose.

## Usage (the shape; real builds arrive with the core)

```sh
# local
bespok3d build --kind co-repo --source . --out dist

# CI (a repo's release workflow)
- uses: Bespok3d/b3-builder@v1
  with:
    kind: co-repo
    source: .
    out: dist
```

## The golden-equivalence harness

The core is ported behind a rail that proves it reproduces the current build output byte-for-byte before
anything depends on it. `test/golden/` holds committed fixtures snapshotted from the legacy scripts (the
monorepo bundled index + the full `.b3` content set, and one co-repo's atoms + sub-list).
`test/equivalence.test.ts` builds a candidate via the core and asserts it matches. "byte-for-byte" means:

- the bundled index, the atoms, and the sub-list match by **content** (parsed, deep-equal), in the exact
  canonical JSON the system writes; and
- each `.b3` matches by the **content hash of every payload / doc file** plus its parsed manifest. A
  `.b3` is a zip whose framing (mtimes, ordering) is non-deterministic, so the invariant is its content,
  not its zip bytes.

`npm run capture-golden` re-snapshots the golden from the current plugin trees (re-run it if a plugin
source changes; review the recapture). The rail is expected RED until packet 2 ports the core.

## Development

```sh
npm install
npm run check   # the gate: RULE ZERO, eslint, typecheck, build (green); then the rail status
npm test        # the equivalence rail (red until the core is ported)
```

Agent instructions and the engineering rules for this repo live in [CLAUDE.md](CLAUDE.md). Read it before
making changes, whichever tool you are.
