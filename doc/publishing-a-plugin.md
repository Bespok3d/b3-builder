# Publish a plugin to the Bespok3d index

This is the canonical path for submitting signed plugin atoms to `Bespok3d/main-index`. Choose the section that matches your source repository. `b3-builder` builds and releases packages and atoms; the separate `main-index` Action submits the atoms. Neither Action grants a contributor write access to the upstream index.

The development build exposes Publish key. A packaged-app end-to-end test has exercised key generation and publication through the real renderer, preload, main process, and GitHub connector against a simulated GitHub host. The repository path spells the fingerprint in lowercase, matching the signed atom; compare fingerprint hex without regard to letter case. A live GitHub publication has not been run: check the public file and fingerprint on GitHub before describing your key as published. The released desktop app does not yet discover arbitrary publisher keys or verify third-party publisher identity; that work is separate from this publishing path.

## One plugin at the repository root

Use this path when `manifest.json` and `files/` are at the repository root. Keep the source manifest's `publisher` as `PLACEHOLDER`; a signed build stamps the actual key fingerprint into the packed manifest and atom.

```text
fixture-root/
  manifest.json
  files/
  doc/README.md
  .github/workflows/release.yml
```

1. In the development build, connect your GitHub account, create a publishing key in Settings, and use Publish key. Download the public half from `<publisher>/bespok3d-publisher/keys/<fingerprint>/key.asc` on GitHub and run `gpg --show-keys --with-colons key.asc`; its `fpr` record must match Settings. Then use Download, Public key in Settings to export it for local signature checks. The private half stays local at this point.
2. Use Settings, Keys, Download, Private key to export a temporary `.priv.asc` file. Store its entire armored text as the repository's Actions secret `REGISTRY_SIGNING_KEY`, then delete that export. Never commit it or pass the private key itself on a command line. [Signing details](signing-a-plugin.md).
3. Build locally with a reference to that key, then inspect the package and raw atom:

   ```sh
   PUBLISHER_REPO=your-account/your-repo
   SIGNING_KEY_FILE=/path/to/exported.priv.asc
   PUBLIC_KEY_FILE=/path/to/exported.pub.asc
   PLUGIN_NAME=$(jq -r .name manifest.json)
   PLUGIN_VERSION=$(jq -r .version manifest.json)
   PACKAGE="dist/${PLUGIN_NAME}-${PLUGIN_VERSION}.b3"
   gpg --import "$PUBLIC_KEY_FILE"
   b3-builder build --unit plugin --source . --out dist --atom-repo "$PUBLISHER_REPO" --sign "$SIGNING_KEY_FILE"
   unzip -l "$PACKAGE" | grep -E 'manifest.json(\.sig)?$'
   unzip -p "$PACKAGE" manifest.json | jq -r .publisher
   unzip -p "$PACKAGE" manifest.json > /tmp/published-manifest.json
   unzip -p "$PACKAGE" manifest.json.sig > /tmp/published-manifest.json.sig
   gpg --verify /tmp/published-manifest.json.sig /tmp/published-manifest.json
   jq '{name, publisher, require, download_url}' "dist/${PLUGIN_NAME}.atom.json"
   ```

   The stamped `publisher` and atom `publisher` must match your key fingerprint. The raw atom keeps `require`; its local `download_url` is only a filename until the release Action uploads the package.
4. Add this tag-triggered workflow. Replace all three Action placeholders with reviewed full commit SHAs; the builder and index commits must include the root-plugin release path and contributor PR mode. The builder creates a release for the root `.b3`, attaches declared documents, and finalizes its atom with the release asset URL. It does not assemble a sub-list.

   ```yaml
   name: release
   on:
     push:
       tags: ['plugin-*-v*']

   jobs:
     release:
       runs-on: ubuntu-latest
       permissions:
         contents: write
       steps:
         - uses: actions/checkout@<reviewed-checkout-commit-sha>
           with:
             fetch-depth: 0
         - uses: Bespok3d/b3-builder@<reviewed-builder-commit-sha>
           with:
             unit: plugin
             atom-repo: ${{ github.repository }}
             signing-key: ${{ secrets.REGISTRY_SIGNING_KEY }}
         - uses: Bespok3d/main-index/.github/actions/register-atoms@<reviewed-index-commit-sha>
           with:
             submission: pull-request
             contributor-token: ${{ secrets.CONTRIBUTOR_TOKEN }}
             atoms-dir: dist
   ```

5. Set `CONTRIBUTOR_TOKEN` from your own GitHub account. It must be able to create or use your fork of `Bespok3d/main-index` and open a PR; it needs no upstream contents-write grant. Do not pass the Action's maintainer `token` or the builder's `main-index-token` and `main-index-repo` inputs. After the release Action finishes, inspect the released `.b3` and the finalized `dist/<name>.atom.json`: its `download_url` must be the uploaded release asset API URL. The registration Action submits only `*.atom.json` to your fork.

## A repository of plugin directories

Use this path when each sibling directory contains its own `manifest.json` and payload. Keep `publisher: "PLACEHOLDER"` in every source manifest. This official-index path submits raw atoms as a set; leave `list-name`, `list-publisher`, `list-ref-name`, `main-index-repo`, and `main-index-token` unset. Those inputs publish a separately owned sub-list and are not part of this atom PR flow.

```text
fixture-plugins/
  fixture-provider/manifest.json
  fixture-provider/files/
  fixture-consumer/manifest.json
  fixture-consumer/files/
  .github/workflows/release.yml
```

1. In the development build, connect your GitHub account, create a publishing key in Settings, and publish its public half. Download `<publisher>/bespok3d-publisher/keys/<fingerprint>/key.asc` from GitHub and run `gpg --show-keys --with-colons key.asc`; its `fpr` record must match Settings. Then use Download, Public key to export it for local signature checks. Keep the private half local until you store it as the repository's `REGISTRY_SIGNING_KEY` Actions secret.
2. Use Settings, Keys, Download, Private key to export a temporary `.priv.asc` file. Store its full armored contents in `REGISTRY_SIGNING_KEY`, then delete the export. Never commit the private key or put its contents on argv. Build and inspect **each** plugin locally:

   ```sh
   PUBLISHER_REPO=your-account/your-repo
   SIGNING_KEY_FILE=/path/to/exported.priv.asc
   PUBLIC_KEY_FILE=/path/to/exported.pub.asc
   gpg --import "$PUBLIC_KEY_FILE"
   b3-builder build --unit repo --source . --out dist --atom-repo "$PUBLISHER_REPO" --sign "$SIGNING_KEY_FILE"
   for package in dist/*.b3; do
     unzip -l "$package" | grep -E 'manifest.json(\.sig)?$'
     unzip -p "$package" manifest.json > /tmp/published-manifest.json
     unzip -p "$package" manifest.json.sig > /tmp/published-manifest.json.sig
     gpg --verify /tmp/published-manifest.json.sig /tmp/published-manifest.json
     jq -r .publisher /tmp/published-manifest.json
   done
   for atom in dist/*.atom.json; do jq '{name, publisher, require, download_url}' "$atom"; done
   ```

   Every packed `publisher` and raw atom `publisher` must match the same key fingerprint. A raw atom retains its service `require` entries for `main-index` to resolve.
3. Add the tag-triggered workflow. Replace all three Action placeholders with reviewed full commit SHAs. The builder releases each `.b3`, attaches its declared documents, and finalizes every atom; no sub-list is assembled or registered.

   ```yaml
   name: release
   on:
     push:
       tags: ['plugin-*-v*']

   jobs:
     release:
       runs-on: ubuntu-latest
       permissions:
         contents: write
       steps:
         - uses: actions/checkout@<reviewed-checkout-commit-sha>
           with:
             fetch-depth: 0
         - uses: Bespok3d/b3-builder@<reviewed-builder-commit-sha>
           with:
             unit: repo
             atom-repo: ${{ github.repository }}
             signing-key: ${{ secrets.REGISTRY_SIGNING_KEY }}
             bake: 'true'
         - uses: Bespok3d/main-index/.github/actions/register-atoms@<reviewed-index-commit-sha>
           with:
             submission: pull-request
             contributor-token: ${{ secrets.CONTRIBUTOR_TOKEN }}
             atoms-dir: dist
   ```

   Use `bake: 'true'` when the manifests declare payloads built from source; plain pre-staged files need no bake. Set `CONTRIBUTOR_TOKEN` from your own GitHub account with fork and PR permissions, never upstream write permission. Inspect every released package and finalized atom. Each atom's `download_url` must name its corresponding uploaded release asset API URL. The registration Action copies the entire finalized `*.atom.json` set into your fork.

## What the PR proves

For either path, `submission: pull-request` uses branch `atom-submission/<source-owner>-<source-repo>-<run-id>-<run-attempt>` from upstream `main`. A retry of the same run uses a lease on that branch. The Action copies only `*.atom.json`, runs an unsigned prospective `scripts/assemble.mjs` before any fork write, signs off the atom commit, and pushes only to the contributor fork. It opens a PR against `Bespok3d/main-index` `main`, titled `Submit atoms from <source-owner>/<source-repo>` with body `Generated atoms from <source-owner>/<source-repo>. Prospective index assembly passed.` An unchanged atom set opens no PR.

The PR contains only `atoms/*.atom.json`, never a `.b3`, `index.json`, or signature. Prospective assembly and the PR check resolve raw `require` entries against available providers and reject an unresolved service. Maintainers review release links, publisher identity, service requirements, DCO sign-off, and the passing PR check. Acceptance into upstream `main` is a maintainer decision; index signing happens after acceptance.

A local signed build proves the package signature, stamped fingerprint, and raw atom. Local URL finalization can prove the atom rewrite with a fixture URL. Local prospective assembly proves dependency handling. Only an explicitly authorized real GitHub run proves that a fork, release, and PR were created and its PR check passed. None of those GitHub outcomes has been claimed by the local checks in this guide.
