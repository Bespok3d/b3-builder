# Zero to hero

One plugin, from an empty directory to a published release. Follow it top to bottom and you will have
built, tested, signed and shipped something real. Everything here links to the page that goes deeper.

What we are building: a plugin that adds a **filament runout beep**, a Klipper macro that makes the
printer chirp and pause when the runout sensor triggers, with the beep length configurable by the
user.

It ships nothing but text, which makes it the easiest kind. Most plugins are this kind.

You need: a printer enrolled in the Bespok3d app, Node.js on your machine, and a text editor.

## 1. Make the directory

```sh
mkdir -p runout-beep/files/cfg/klipper runout-beep/doc
cd runout-beep
```

The shape every plugin has:

```text
runout-beep/
  manifest.json          what it is, what it needs, what to do with it
  files/                 exactly what lands on the printer
  doc/README.md          what a user reads in the store
  doc/ATTRIBUTIONS.md    who wrote what you ship
```

More on the shape: [anatomy-of-a-plugin.md](anatomy-of-a-plugin.md).

## 2. Write what lands on the printer

`files/cfg/klipper/runout-beep.cfg.tmpl`:

```ini
[gcode_macro RUNOUT_BEEP]
gcode:
    SET_PIN PIN=beeper VALUE=1
    G4 P$BEEP_MILLISECONDS
    SET_PIN PIN=beeper VALUE=0
```

The `.tmpl` suffix means the file is a template. `$BEEP_MILLISECONDS` gets replaced with the user's
setting, and the file lands on the printer as `runout-beep.cfg`, without the suffix.

## 3. Write the manifest

`manifest.json`:

```json
{
  "name": "runout-beep",
  "title": "Filament Runout Beep",
  "version": "0.1.0",
  "description": "Makes the printer beep when the filament runout sensor triggers, so you notice a runout from the next room instead of finding it an hour later.",
  "tagline": "Hear a runout instead of discovering it.",
  "category": "filament",
  "channel": "testing",
  "printer_specific": false,
  "source": "https://github.com/you/runout-beep",
  "publisher": "PLACEHOLDER",
  "author": "you",
  "requires": {
    "capabilities": ["klipper-generic"],
    "variables": [
      { "name": "BEEP_MILLISECONDS", "description": "How long the beep lasts.", "required": false }
    ]
  },
  "config": [
    {
      "key": "BEEP_MILLISECONDS",
      "label": "Beep length",
      "type": "number",
      "default": 500,
      "hint": "How long the beep lasts, in milliseconds.",
      "scope": "printer"
    }
  ],
  "permissions": ["klipper-config", "restart"],
  "install": {
    "place": [
      {
        "class": "klipper-config",
        "src": "files/cfg/klipper/runout-beep.cfg.tmpl",
        "render": true
      }
    ],
    "restart": ["klipper"]
  }
}
```

Four things worth pausing on:

- **`publisher` is `PLACEHOLDER` and stays that way.** The build fills in your key fingerprint when it
  signs. Writing a real one here is an error.
- **`type` is `number`, not `text`.** The field types are a fixed list and picking the right one is
  what gives the user a sensible input. A boolean is a `toggle`, never a dropdown containing "true"
  and "false".
- **You never write a file list.** The build walks `files/` and hashes everything. Hand-writing it is
  how you end up with a package the printer refuses: any file in the archive the list does not name
  rejects the whole package.
- **`permissions` says what you are allowed to do.** The user sees it and approves it.

Every field: [anatomy-of-the-manifest.md](anatomy-of-the-manifest.md).

## 4. Write the store page

`doc/README.md`:

```markdown
# Filament Runout Beep

Beeps when the filament runout sensor triggers.

Long prints fail quietly. This makes them fail loudly instead: when your runout sensor
trips, the printer chirps so you notice from the next room.

## Settings

**Beep length** sets how long the chirp lasts, in milliseconds. The default of 500 is
audible without being annoying. Set it to 2000 if your printer is in the garage.

## Requirements

A printer with a beeper pin named `beeper` in its Klipper configuration, and a filament
runout sensor.
```

This is what a stranger reads before deciding to install. Write it for them.

While you are in `doc/`, write `doc/ATTRIBUTIONS.md` too. It names anyone whose code you ship and
under what licence; this plugin ships nothing but its own two files, so it is one line:

```markdown
# Attributions - runout-beep

**Plugin author:** you

No third-party code ships in this package.
```

Put that same text in the manifest's `attributions` field, which is what the store actually shows.

## 5. Build it

```sh
npx b3-builder build --source . --out dist --atom-repo you/runout-beep
```

You get `dist/runout-beep-0.1.0.b3`. Look inside:

```sh
unzip -l dist/runout-beep-0.1.0.b3
unzip -p dist/runout-beep-0.1.0.b3 manifest.json | jq '.files'
```

That `files` array, with a hash per file, is what the build wrote for you and what the signature will
eventually cover. More: [anatomy-of-a-b3-file.md](anatomy-of-a-b3-file.md).

## 6. Try it on a printer

**Drag `dist/runout-beep-0.1.0.b3` onto the Bespok3d app window.** The app validates it, adds it to
your local plugins, and offers to install it on the selected printer.

Then actually check:

- The store page reads correctly.
- The beep length field is a number input with your hint under it.
- The permissions prompt lists the Klipper config and the restart, and nothing else.
- Klipper restarts and comes back up.
- `RUNOUT_BEEP` runs from the console and the printer beeps.
- Uninstalling removes the config and Klipper still starts.

Found something? Fix it, bump to `0.1.1`, rebuild, drop the new file. The loop is meant to be short.

More ways to test, including running from an app source checkout:
[local-testing.md](local-testing.md).

## 7. Put it on GitHub

Create a repository and push. Then `.github/workflows/release.yml`:

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
          unit: plugin
          atom-repo: ${{ github.repository }}
          signing-key: ${{ secrets.REGISTRY_SIGNING_KEY }}
```

`unit: plugin` because this repository is one plugin. No `bake` because there is nothing to build.

What each step does: [github-actions.md](github-actions.md).

## 8. Make a signing key

```sh
gpg --full-generate-key
gpg --armor --export-secret-keys <your-key-id> > signing-key.asc
```

Paste the whole file into a repository secret named `REGISTRY_SIGNING_KEY`, then `rm signing-key.asc`.

This is what turns "some package claiming to be yours" into "provably the package you built".
Step by step, including what to do when a key expires: [signing-a-plugin.md](signing-a-plugin.md).
Why it matters and what a user sees: [signatures.md](signatures.md).

## 9. Release

```sh
git tag plugin-runout-beep-v0.1.0
git push origin main --tags
```

The Action builds, signs, packs, creates a release, attaches the `.b3` and your docs, and writes the
catalog entry. Confirm the signature landed:

```sh
# download the .b3 from the release, then
unzip -p runout-beep-0.1.0.b3 manifest.json | jq -r .publisher
```

A forty-character fingerprint means signed. `PLACEHOLDER` means the key did not reach the build.

## 10. Let people find it

Anyone can install it right now by dropping the `.b3` from your release onto the app. To appear in the
official store, your list gets registered in the index once, and every release after that is picked
up automatically. See [publishing-a-plugin.md](publishing-a-plugin.md) and
[plugin-sources.md](plugin-sources.md).

When you are confident, change `channel` to `stable`, bump the version, and tag again. Until then,
`testing` is the honest answer and it costs you nothing. See [channels.md](channels.md).

## Where to go next

You have built the simplest kind. The others differ only in what fills `files/`:

| You need | Read |
| --- | --- |
| A third-party Python package | [kinds/python.md](kinds/python.md). Read this one carefully, the two requirements files are not interchangeable |
| A program written in Go | [kinds/go-binary.md](kinds/go-binary.md) |
| A binary somebody else already publishes | [kinds/prebuilt-download.md](kinds/prebuilt-download.md) |
| Something compiled from C | [kinds/native-c.md](kinds/native-c.md) |
| A kernel module | [kinds/kernel-module.md](kinds/kernel-module.md). The hard one |

Overview of all six: [kinds-of-plugins.md](kinds-of-plugins.md).
