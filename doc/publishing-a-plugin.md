# Publishing a plugin

Your plugin works on a real printer. This page turns it into something other people can install.

## What publishing actually is

You host your own plugin. There is no upload, no store submission, no review queue.

```text
you push a version tag
  -> GitHub Actions builds, signs and packs your .b3
  -> a GitHub release in YOUR repo holds it
  -> a catalog entry pointing at that release goes into a list
  -> the list is referenced from an index the app reads
```

The index is a directory of pointers. Your files never leave your repository.

## 1. Get the repository in shape

One plugin per directory, each with its own manifest:

```text
my-plugins/
  .github/workflows/release.yml
  cpu-temp/
    manifest.json
    files/
    doc/README.md
  fan-curve/
    manifest.json
    files/
    doc/README.md
```

A repository holding exactly one plugin works too: put the manifest at the root and pass
`unit: plugin`.

Check before you go further:

- `publisher` is the literal string `PLACEHOLDER` in every manifest. It stays that way.
- `version` follows semantic versioning and is the version you actually tested.
- `channel` is honest. See [channels.md](channels.md).
- `doc/README.md` exists and reads like a store page.
- No file you did not mean to ship is anywhere under `files/`.

## 2. Add the release workflow

`.github/workflows/release.yml`:

```yaml
name: build-and-release

on:
  push:
    tags:
      - 'plugin-*-v*'
  workflow_dispatch:

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: Bespok3d/b3-builder@<commit-sha>
        with:
          unit: repo
          atom-repo: ${{ github.repository }}
          signing-key: ${{ secrets.REGISTRY_SIGNING_KEY }}
          bake: 'true'
```

Full input list in [github-actions.md](github-actions.md).

**Trigger on tags, never on pushes to a branch.** A branch trigger publishes whatever `main` happens
to hold, including work in progress, straight onto other people's printers. This is not hypothetical;
it is why the tag trigger is the documented one.

## 3. Set up signing

Follow [signing-a-plugin.md](signing-a-plugin.md) once. Ten minutes, and every release after this is
signed automatically.

You can publish unsigned. Your plugin will install, and it will show as coming from an unknown
publisher forever.

## 4. Release it

The tag carries the plugin name and the version:

```sh
git tag plugin-cpu-temp-v0.1.0
git push origin plugin-cpu-temp-v0.1.0
```

Watch the Actions run. When it is green you have:

- A GitHub release in your repository, holding `cpu-temp-0.1.0.b3`.
- Your README and CHANGELOG attached as release assets, so the store page shows the notes for the
  version it is offering.
- A catalog entry whose download URL points at that asset.

**Worth copying:** a small guard script that refuses a tag naming a plugin the repo does not hold, or
a version its manifest does not declare. A tag that disagrees with the manifest publishes a package
the tag lies about, and afterwards nothing shows the disagreement. The `networking` plugin repo has
one you can lift.

## 5. Getting into the index

Two paths.

**Register your own list.** Your repository assembles its own list and registers it by reference. Pass
`list-name`, `list-publisher` (your key fingerprint), `list-ref-name`, `main-index-repo` and
`main-index-token`. The last one is a token with write access to the index of lists, which means
whoever runs that index has to give you one.

**Be added to somebody else's list.** Simpler: pass no list inputs at all and your run is atoms-only.
It builds, tests, releases and leaves finished catalog entries behind for whoever collects them.

For the Bespok3d official index, ask. It is a repository like any other and the conversation is a
normal one.

**Or neither.** Hand people the `.b3`. Dropping it on the app works and always will. Plenty of good
plugins never need to be in an index.

## 6. Releasing an update

```sh
# edit code, bump "version" in manifest.json, add a CHANGELOG entry
git commit -am "cpu-temp 0.1.1: fix poll interval on cold boot"
git tag plugin-cpu-temp-v0.1.1
git push origin main --tags
```

Users are offered the update through the app. What you owe them:

- **The version number tells the truth.** Breaking change means a major bump.
- **The changelog says what changed for them**, not what changed in your code.
- **New permissions are a real event.** The app re-prompts on a permissions change, and a user who
  did not expect it will decline. Say why in the changelog.
- **A config field you removed or renamed** loses that user's setting. Think before you rename.

## 7. Maintaining it

The thing that ages fastest is anything pinned to something you do not control: a firmware version you
patch against, an upstream release you download, a kernel your module was built for. When the printer
firmware moves, your plugin is what needs a new release, and your users will not know why it stopped
working unless you tell them.

If you stop maintaining a plugin, say so in its README. That is more useful to a user than silence.

## The pre-publish checklist

- [ ] Installed, worked, uninstalled cleanly, reinstalled, on a real printer.
- [ ] `publisher` is `PLACEHOLDER` in the source manifest.
- [ ] `version` matches the tag you are about to push.
- [ ] `channel` is honest.
- [ ] `doc/README.md` reads like a store page to a stranger.
- [ ] `CHANGELOG.md` has an entry for this version, and the manifest declares it.
- [ ] `doc/ATTRIBUTIONS.md` credits anyone whose code you ship, and the manifest's `attributions`
      carries the same text.
- [ ] No machine-specific values anywhere: no IP address, no serial number, no `/dev/video11`.
- [ ] Nothing in `files/` you did not mean to ship.
- [ ] Signing key in a repository secret, wired into the workflow.
- [ ] `unzip -p dist/<name>-<version>.b3 manifest.json | jq -r .publisher` shows a real fingerprint on
      a signed build.
