# b3-builder changelog

What changed in the builder, for a publisher using the CLI or the GitHub Action.

---

## Unreleased

### A single plugin at the repository root can use the release path

`unit: plugin` used to build a root plugin and stop there: the Action's test and release steps only
ever looked inside `${source}/*/`, so a repository whose `manifest.json` and `files/` sit at the root
could produce a `.b3` but never release one. The same steps now handle both shapes: a root plugin's
tests run, its signed `.b3` is released, its declared document assets upload, and its root
`*.atom.json` is finalized with the release-asset download URLs. List assembly, list assets and index
registration stay `unit: repo` only.

### One publishing guide for both shapes

`doc/publishing-a-plugin.md` is now the single path from source to a registered atom: a walkthrough
for one plugin at the repository root and a walkthrough for a repository of plugin directories, each
with private-key setup, a local build to inspect before shipping, and the exact `register-atoms`
Action contract. `doc/signing-a-plugin.md` holds the signing details it links to.
