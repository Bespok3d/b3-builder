# The GitHub Action

You do not have to write a release pipeline. b3-builder ships as a reusable GitHub Action, so your
repo pulls one `uses:` line and gets the whole thing: build, bake, test, pack, sign, release, index,
register.

This page is about that Action: what it does, what you pass it, and how to get the most out of it.

## The shortest workflow that works

`.github/workflows/release.yml` in your plugin repo:

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
          source: .
          atom-repo: ${{ github.repository }}
          signing-key: ${{ secrets.REGISTRY_SIGNING_KEY }}
          bake: 'true'
```

Pin the Action to a commit sha, not to a branch. You are running someone else's code over your signing
key; pin it, and move the pin when you have looked at what changed.

## What it does, step by step

| Step | What happens |
| --- | --- |
| Set up Node and Docker buildx | So a `docker-c` or `docker-ko` bake has what it needs |
| Build the builder | Compiles b3-builder itself from the pinned commit |
| Build, pack, and index | One run of the pipeline: bake, pack, sign, write the catalog entries |
| Test | Runs `tests/run.sh` for every plugin that ships one |
| Release | Creates a GitHub release per plugin, tagged `<name>-v<version>`, with the `.b3` attached |
| Attach docs | Uploads each plugin's `README.md` and `CHANGELOG.md` as release assets |
| Finalize URLs | Rewrites each catalog entry's download and doc URLs to the real release asset URLs |
| Publish the list | Signs and uploads the assembled `index.json` as a release asset |
| Register | Adds a reference to your list in the index of lists |

A release is cut only when a version tag is pushed. That is not a detail: an earlier setup published
on every push to `main`, which handed enrolled printers packages built from work in progress. Trigger
on tags.

## The inputs

**Always:**

| Input | What it is |
| --- | --- |
| `unit` | `repo` for a repo holding several plugin directories, `plugin` for a repo that is one plugin. Defaults to `repo` |
| `source` | The directory to build, relative to the checkout. Defaults to `.` |
| `out` | Where the `.b3` files and index go. Defaults to `dist` |
| `atom-repo` | The `owner/repo` each catalog entry points at. Use `${{ github.repository }}` |

**To sign** (and you should, see [signatures.md](signatures.md)):

| Input | What it is |
| --- | --- |
| `signing-key` | Your armored GPG private key, from a repository secret. Empty means an unsigned build |

**If your repo publishes its own list of plugins:**

| Input | What it is |
| --- | --- |
| `list-name` | The display name of your list, for example `My Printer Extras` |
| `list-publisher` | The fingerprint of the key that signs the list |
| `list-ref-name` | The name your list is registered under in the index of lists |
| `main-index-repo` | The `owner/repo` of the index of lists to register into |
| `main-index-token` | A token with write access there. Empty means the register step is skipped |

Leave **both** `list-name` and `list-publisher` empty and the run is atoms-only: it builds, releases,
and leaves the finished per-plugin entries in the output directory for somebody else to collect.

**Build behaviour:**

| Input | What it is |
| --- | --- |
| `bake` | `'true'` builds payloads from source. Needed by every kind except plain config files |
| `skip-unchanged` | `'true'` reuses an existing `.b3` whose contents did not change instead of repacking |
| `exclude-dirs` | Space-separated directory names that hold a manifest but must never publish |
| `publish` | `'false'` builds, tests, packs and indexes but cuts no release. Use for pull request builds |
| `node-version` | Defaults to `20` |

## Getting the most out of it

**Build on pull requests without publishing.** Add a second workflow with `publish: 'false'` and no
signing key, triggered on `pull_request`. Every proposed change gets built and tested, nothing gets
released, and you find out that a bake broke before you tag.

**Keep the signing key out of pull request builds.** A workflow triggered by a fork's pull request
should never see your key. Sign only in the tag-triggered release workflow.

**Let `skip-unchanged` do the boring work.** In a repo holding a dozen plugins, releasing one should
not rebuild the other eleven. Turn it on and only what actually changed is repacked.

**Use `exclude-dirs` for a directory you develop but never ship.** An experimental variant with a real
manifest in it would otherwise be discovered and published. Name it here and it is skipped by
discovery and by the release loop both.

**Ship a `tests/run.sh`.** The Action runs it, and a failing test stops the release before anything is
published. Even a script that only byte-compiles your Python files catches real mistakes.

**Declare a changelog and actually ship the file.** A manifest naming a changelog that does not exist
fails the release on purpose, rather than publishing a store page pointing at nothing.

## What it will not do, by design

The Action never writes into your plugin repository. The assembled list ships as a release asset, not
as a commit. An earlier version did commit it, and that raced against the repo's own pushes and put a
signature over bytes nobody was ever served. If you are looking for where the list got committed: it
does not, and that is the fix.

The Action also bakes in no identity of its own. Who you are, which list you publish, and which index
you register into are all inputs. Anyone can run the same Action as themselves; nothing about it is
specific to the Bespok3d project.

## Secrets you need

| Secret | For |
| --- | --- |
| `REGISTRY_SIGNING_KEY` | Your armored GPG private key. See [signing-a-plugin.md](signing-a-plugin.md) |
| `MAIN_INDEX_TOKEN` | Only if you register a list into an index of lists you do not own |

Set both under Settings, Secrets and variables, Actions in your repository. Never put a key in the
workflow file, and never pass one on a command line: the workflow passes it through the environment
precisely because a command line is readable by every process on the runner.

## When it fails

| Message | What it means |
| --- | --- |
| `refusing to pack <name>: its payload was not baked` | You declared a payload and did not build it. Set `bake: 'true'` |
| `missing packed asset dist/<name>-<version>.b3` | The pack step produced nothing for that plugin. Check the earlier log |
| `manifest declares changelog ... but ... is missing` | Add the file, or remove the `changelog` field |
| `sha256 mismatch for downloaded artifact` | Upstream changed the file. Re-check the hash before you trust it |
| `vermagic mismatch` | Your kernel module was built against the wrong source. See [kinds/kernel-module.md](kinds/kernel-module.md) |
| `Docker is required for the ... bake and is not running` | Only happens locally. On a runner, buildx is set up for you |
