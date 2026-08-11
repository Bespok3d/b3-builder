# Anatomy of a .b3 file

A `.b3` is the thing a user actually installs. It is a zip file with a fixed shape, produced by
`b3-builder` from your plugin directory. You never assemble one by hand.

```text
my-plugin-0.1.0.b3
  manifest.json          your manifest, with the generated fields filled in
  manifest.json.sig      the detached signature, present only in a signed build
  files/                 your payload, exactly as it will be placed
  doc/                   your user-facing docs
```

## What the build changes about your manifest

The `manifest.json` inside the package is not the one in your repo. Three things are filled in:

| Field | What the build does |
| --- | --- |
| `files` | Computed. One entry per file under `files/`, each with its path, its `sha256` and its mode |
| `published_at`, `updated_at` | Stamped with the build time |
| `publisher` | Replaced with the real fingerprint of the signing key, in a signed build. Left as `PLACEHOLDER` in an unsigned one |

Everything else is yours, unchanged.

## The `files` array

This is the integrity list, and it is why an install is trustworthy even before you think about
signatures. Each entry looks like this:

```json
{ "path": "files/moonraker/my_component.py", "sha256": "e3b0c442...", "mode": "644" }
```

The daemon on the printer recomputes the hash of every file it unpacks and compares. A mismatch stops
the install. Only two modes are allowed, `644` and `755`, and the builder records what it found on
disk.

The array covers **every** file under `files/`, from one single walk of the tree, and that is not a
convenience. **A package holding a file that `files[]` does not list is refused.** Before the printer
writes a single byte it compares the archive's members against the list, and one unlisted file
rejects the whole package, not just that file. The reason is simple: the signature vouches for a file
by listing its hash, so a file nobody listed is payload nobody signed.

Three members are exempt, and none of them is yours to add: `manifest.json` (it cannot carry its own
hash), `manifest.json.sig` (it does not exist until the manifest is final) and `doc/`.

You cannot hit that refusal by building with b3-builder, because the same single walk fills both the
list and the archive. You hit it by assembling a `.b3` by hand, or by hand-writing `files[]`. Do
neither.

The other side of one walk: anything sitting in `files/` that you did not intend to ship (a
`__pycache__` directory, a `.pyc`, a `.DS_Store`) is listed, hashed and shipped. Keep the tree clean.

## The signature

`manifest.json.sig` is a detached GPG signature over the exact bytes of `manifest.json` as they sit
in the zip. Since the manifest carries a hash of every payload file, signing the manifest covers the
whole package.

If your build supplied a signing key, this file is present. If it did not, it is absent, and the app
tells the user the plugin is unsigned. An absent signature installs; a **present** signature that
does not verify is a hard refusal. See [signatures.md](signatures.md).

## Building one

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin
```

That produces, in `dist/`:

- `my-plugin-0.1.0.b3`, the package.
- `index.json`, the plugin list holding your catalog entry.
- `index.json.sig`, when signed.

## The catalog entry

The plugin list is a separate artifact from the package, and it is how the app finds you. It carries
a subset of your manifest, enough for the store to show and rank your plugin without downloading
anything.

An entry carries: `name`, `title`, `version`, `description`, `tagline`, `category`, `channel`,
`publisher`, `printer_specific`, `published_at`, `updated_at`, your declared `requires.capabilities`,
`provides`, `conflicts` and `require`, and, when you set them, `author`, `attributions`, `icon`,
`homepage`, `macros`, `config`, `sw_version`, `min_daemon_version`, `min_jinni_version`,
`license_url`, `changelog_url`, `doc_url` and `download_url`.

Two of those are built rather than copied. `license_url` is your `license` field passed straight
through, because a licence is always a link out to your repo, never a shipped asset.
`download_url` starts as a placeholder and is rewritten by the release workflow to the real URL of
the release asset once the release exists.

Note what an entry does **not** carry: your `install` block, your `permissions`, your `files` list.
Those live in the package, and the app reads them after downloading it.

## Inspecting one

A `.b3` is a zip, so anything that opens a zip opens it:

```sh
unzip -l dist/my-plugin-0.1.0.b3
unzip -p dist/my-plugin-0.1.0.b3 manifest.json | jq .
```

Two things worth checking on your first build:

```sh
# Is the file list what you expect, and is nothing junk in it?
unzip -p dist/my-plugin-0.1.0.b3 manifest.json | jq -r '.files[].path'

# Did a signed build stamp a real publisher?
unzip -p dist/my-plugin-0.1.0.b3 manifest.json | jq -r .publisher
```

If that last command prints `PLACEHOLDER` on a build you intended to sign, the key never reached the
builder. Go back to [signing-a-plugin.md](signing-a-plugin.md).
