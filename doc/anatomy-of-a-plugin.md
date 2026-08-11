# Anatomy of a plugin

A plugin is a directory. This is everything that can be in it.

```text
my-plugin/
  manifest.json               required: what it is, what it needs, how it installs
  files/                      required in practice: everything that lands on the printer
  doc/
    README.md                 the page the app shows on your plugin's detail panel
    CHANGELOG.md              what changed between versions
    LICENSE                   your licence text
    ATTRIBUTIONS.md           who wrote what you ship, and under which licence
    screenshot.png            images the README links to
  tests/
    run.sh                    a script the release workflow runs before publishing
  requirements.txt            only for a plugin that runs its own Python program
  klipper_requirements.txt    only for a plugin whose Klipper/Moonraker code imports a package
```

Nothing else in the directory is meaningful to the builder. A `.gitignore`, a `Makefile`, your own
notes: they stay in your repo and never reach the printer.

## `manifest.json`

The one required file. It is the whole contract: your plugin's identity, what it needs from the
printer, what other plugins it works with, what questions to ask the user, and where each file goes.

It gets a page of its own: [anatomy-of-the-manifest.md](anatomy-of-the-manifest.md).

## `files/`

Everything that ends up on the printer. The layout inside `files/` is yours to choose, because the
manifest names each file explicitly and says what it is. Most plugins mirror the shape of what they
ship, which reads well in a diff:

```text
files/
  cfg/klipper/my-plugin.cfg
  cfg/moonraker/my-plugin.cfg.tmpl
  klipper/my_sensor.py
  moonraker/my_component.py
  bin/my-daemon
  web/index.html
```

Three rules:

- **A file no install rule mentions is still shipped, but never placed.** Everything under `files/`
  is listed and checksummed by the build and travels inside the `.b3`; a file no rule points at
  simply never gets put anywhere on the printer. Do not leave junk here.
- **A file ending in `.tmpl` is a template.** The daemon renders it, substituting the configuration
  values the user gave, and places the result without the `.tmpl` suffix. See "Templates" below.
- **File modes are preserved, and only two are allowed:** `644` for data, `755` for something
  executable. The builder records the mode of each file as it finds it on disk, so a binary that is
  not executable in your repo arrives not executable on the printer.

## `doc/`

The user-facing documentation, shown inside the app on your plugin's page. It is not part of
`files/` and never lands on the printer.

| File | What it is for |
| --- | --- |
| `README.md` | The page a user reads before installing. Write it for a user, not a developer |
| `CHANGELOG.md` | Linked from the store when your manifest names it in `changelog` |
| `LICENSE` | Your licence text, if you want to ship it alongside the link |
| `ATTRIBUTIONS.md` | Who wrote the code you ship and under what licence. See below |
| images, short videos | Anything your README links to |

**`ATTRIBUTIONS.md` is where you credit other people's work.** If your plugin ships somebody else's
code, a vendored library, a patched upstream file, a macro you adapted from a forum post, this is
where it gets named, with its licence and a link. If it ships nothing but your own work, say that in
one line; every Bespok3d plugin carries the file either way, so a user never has to guess whether the
credits are missing or simply empty.

The store shows this text from your manifest's `attributions` field, not from the file. Keeping the
two the same is on you: put the text in the file, and put the same text in the field.

The app renders your Markdown. Some things are stripped for safety: raw HTML and JavaScript are
removed, and a `javascript:` link is blocked. `.png`, `.jpg`, `.gif`, `.webp` and `.svg` all render,
and a `.mp4`, `.webm` or `.mov` linked with image syntax renders as a video player. Nothing stops you
shipping a large one, but every user who opens your page downloads it, so keep a video short and aim
to stay under about 15MB.

## `tests/run.sh`

Optional. If it exists, the release workflow runs it before cutting a release, and a non-zero exit
stops the release. Keep it fast and keep it honest: it runs on a GitHub runner, not on a printer, so
it can check syntax, run unit tests, and validate your config, but it cannot test against a real
machine.

A real example, from a plugin that ships one Moonraker component:

```sh
#!/usr/bin/env sh
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
python3 -m py_compile "$PLUGIN_DIR/files/moonraker/my_component.py"
echo "my_component.py: syntax OK"
```

## The two requirements files

If your plugin needs Python packages that are not already on the printer, you declare them in one of
two files, and which one you pick changes everything about how they are installed. Both are
presence-driven: you create the file, and that is the entire declaration. There is no manifest field
for them.

**You may ship one or the other, never both.** The daemon refuses a plugin that carries both.

This is the single most confusing part of building a plugin, so it has a page of its own:
[kinds/python.md](kinds/python.md). Read it before you add either file.

## Templates

A file in `files/` whose name ends in `.tmpl` is rendered by the daemon at install time and on every
reconfigure. Inside it, `$NAME` and `${NAME}` are replaced by the value of the configuration key
`NAME`, taken from what the user entered or from your declared default.

```ini
# files/cfg/moonraker/my-plugin.cfg.tmpl
[my_plugin]
server: $MY_PLUGIN_SERVER
api_key: $MY_PLUGIN_API_KEY
poll_interval: $MY_PLUGIN_POLL_INTERVAL
```

The manifest places it as a `moonraker-config` and the daemon writes `my-plugin.cfg`.

**Do not tell a user to hand-edit a placed config file.** Placed files are owned by the daemon: they
are symlinked into Klipper's and Moonraker's config directories, so they do not appear as editable
files in Fluidd or Mainsail, and any change you did manage to make is overwritten the next time the
user reconfigures your plugin, because the template is re-rendered from the stored values. If a
setting needs to be user-visible, declare it in `config`. If it cannot be expressed as a
configuration field, that is a gap worth reporting rather than a gap to paper over with an
instruction that does not work.

## What is NOT in a plugin

- **No install script.** Not `install.sh`, not a `postinstall` hook, not a shell command in the
  manifest. The daemon places files and restarts services; that is the whole vocabulary.
- **No absolute paths.** Not in the manifest, and preferably not in your config files either. Say
  what a file IS and let the printer's adapter decide where that lives.
- **No prebuilt payload checked into git, in most cases.** A binary, a kernel module, a wheel: those
  are built in CI from source at release time and injected into the `.b3`. See
  [kinds-of-plugins.md](kinds-of-plugins.md).
- **No file list and no checksums.** The builder computes `files[]`. If you hand-write it, you are
  writing something that is about to be overwritten.

## Many plugins in one repo

A repo can hold several plugins as sibling directories, each with its own `manifest.json`:

```text
my-plugins-repo/
  .github/workflows/release.yml
  camera-tools/
    manifest.json
    files/
  filament-tools/
    manifest.json
    files/
```

The builder discovers every directory containing a `manifest.json`, builds a `.b3` for each, and
assembles one plugin list covering all of them. This is `unit: repo` in the release workflow. A repo
holding exactly one plugin at its root works identically.
