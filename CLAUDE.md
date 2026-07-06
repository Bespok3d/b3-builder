# b3-builder: instructions for AI assistants

You are working in b3-builder, the Bespok3d plugin build system: the drop-in that turns a plugin source
dir into a gated, class-aware, signed `.b3` plus its index atom, the same way locally (a `bespok3d build`
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

## Read these first

- [README.md](README.md): what the tool is, the pipeline, the current scaffold status, the golden harness.
- The requirement set: `../Bespok3d/doc/build-system-consolidation.md` (the six artifact classes and the
  requirements R1 to R6). Do NOT re-derive the class set; a new class is added only if a genuinely new one
  appears.
- The relay plan: `~/.claude/plans/relay-build-system-consolidation.md` (which packet owns which step).

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

The one core runs five ordered steps, and every face (CLI, Action, and one day the app dev tools) runs the
same pipeline: `bake` then `pack` then `index` then `sign` then `gate`. Each step lives in `src/core/steps/`
and names its owning relay packet in its own header comment. The order is GPG-aware from day one: the
`sign` step exists as a seam so R4 (real signing) slots in without reshaping the pipeline. Today `sign` is
an honest no-op (signing is decorative until the TRUST perimeter lands); it is the ONLY step allowed to
return the context unchanged. Every other unfinished step THROWS `NotPortedError` rather than pass an empty
result through, so the scaffold fails loudly and the harness stays honestly red.

## The golden-equivalence harness (the rail; do not weaken it)

The core is ported behind a rail that proves byte-for-byte reproduction of the current build output BEFORE
anything depends on it. `test/golden/` holds fixtures snapshotted from the legacy scripts (the monorepo
bundled index + the full `.b3` content set, and the networking co-repo's atoms + sub-list).
`test/equivalence.test.ts` builds a candidate via the core and compares. The meaning of "byte-for-byte" is
in `test/harness.ts` and the README: JSON artifacts match by parsed content in the canonical serialization;
a `.b3` matches by the content hash of every payload / doc file plus its parsed manifest (a zip's framing
is non-deterministic, so the invariant is content, not zip bytes).

- The golden is REAL captured output, never hand-written or faked. `npm run capture-golden` re-snapshots it
  from the current plugin trees; re-run and REVIEW the recapture if a plugin source changes.
- The rail is expected RED until packet 2 ports `pack` + `index`. When it goes green, promote `vitest` into
  the must-pass gate in `scripts/check.sh`.
- Do NOT make the rail pass by weakening the comparison or by faking output. Byte-equivalence is measured
  against the real legacy output; that is the whole point.

## How to work a change

1. **Understand first.** Read the relevant step file, the README, and the requirement doc. If the intent is
   unclear, ask one specific question and stop. Do not guess and implement.
2. **Scope it to a user story.** "As a [role], I want [capability] so that [value]." Implement only what the
   story needs: no speculative features, no defensive code for cases that cannot happen.
3. **Write the code** to the non-negotiables above.
4. **Self-review** before declaring done: the non-negotiables, separation of concerns, file size, rule of
   three, typed signatures, no comment except a non-obvious why, no unused imports or vars.
5. **Run the gate and make it green:** `bash scripts/check.sh` (RULE ZERO, eslint, typecheck, build). Plus
   the equivalence rail where your packet is meant to turn it green.
6. **Add a regression test** for the behavior, in the same change, at the layer that catches its regression.
7. **Keep the docs current.** Update the README and this file if a boundary, a seam, or the status changes.

## Hard constraints

- **Never run git.** The maintainer commits. Every edit (here and in any co-repo the migration touches) is
  staged in the local working tree only; the per-repo commit and push are the maintainer's.
- **Never fake acceptance.** No stub that makes the rail green without the real port; no shadow copy of a
  working generator. If the real port is not achievable in your packet, report BLOCKED.
- **GPG is deferred (R4, packet 8) but the `sign` seam stays present.** Do not fold real signing into the
  earlier packets; do keep every packet GPG-aware (the seam exists, do not remove it).
- **The kernel axis (R3) is different.** For a `.ko`, verification is an on-device capability exercise,
  NEVER a vermagic string and never a bare insmod (both are necessary but not sufficient). The bake step
  may assert vermagic at bake time; it may not claim the module works without a device exercise.
- **Keep the ADR-0036 discipline (R6) uniformly.** The printer never compiles or pips anything; all baking
  is CI-time, for every class. Any step that blurs this is wrong.
- **Gate must stay green** before any change is considered done.

## When you are unsure

Ask one specific question and stop. Do not guess and implement, do not "try something reasonable," do not
burn a long reasoning loop. The architecture is decided by the maintainer; your job is to implement it to
the rules above.
