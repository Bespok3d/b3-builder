# b3-builder changelog

What changed in the builder, for a publisher using the CLI or the GitHub Action.

---

## Unreleased

### A published entry points at an address that survives a re-upload

Every catalog entry used to carry the release asset's API address
(`api.github.com/.../releases/assets/<id>`), and GitHub mints that id per upload. Re-uploading a
release asset, which `gh release upload --clobber` does on every rebuild of the same version, put the
file back at a new id and left the published entry pointing at an address that answers 404 forever.
Two plugins in the U1 Motion Tweaks feed were installable again only by republishing their entries.

A public publisher's entries now carry the tag-and-filename address
(`github.com/<owner>/<repo>/releases/download/<tag>/<filename>`), which is keyed on the release tag
and the asset name and therefore holds still across a re-upload. A private publisher keeps the API
asset address, because on a private repository the browser address answers 404 to a token request
too, and the API address is the one that redirects to a signed download. The choice is made in one
place, `src/action/published-asset-url.ts`, and a regression test fails if the asset-id form is ever
emitted for a public publisher again.

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
