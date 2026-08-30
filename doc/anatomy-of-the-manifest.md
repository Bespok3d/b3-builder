# Anatomy of the manifest

`manifest.json` is the only required file in a plugin. Everything the app shows, everything the
daemon does, and everything another plugin can depend on comes from here.

This page walks it top to bottom. If you want a working one to copy first, take the small one at the
end and grow it.

## Identity

```json
{
  "name": "my-plugin",
  "title": "My Plugin",
  "version": "0.1.0",
  "description": "One paragraph a user reads on the plugin's page.",
  "tagline": "One short line under the title in the store.",
  "category": "tuning",
  "channel": "stable",
  "printer_specific": false,
  "source": "https://github.com/you/my-plugin",
  "publisher": "PLACEHOLDER",
  "author": "you"
}
```

| Field | What it is |
| --- | --- |
| `name` | The id. Lowercase, hyphens, unique within your list. It is used in paths and in dependencies, so it does not change after you publish |
| `title` | The human name shown in the store |
| `version` | Your plugin's version, semver. Bump it for every release |
| `description` | A paragraph. Shown on the detail page |
| `tagline` | One line. Shown on the store card |
| `category` | `camera`, `filament`, `screen`, `ui`, `tuning`, `sensors`, `system`, `printing`. Nothing rejects another word, but only these have an icon and a filter in the store, so a made-up one puts your plugin where nobody browses |
| `channel` | How finished this release is: `lts`, `stable`, `rc`, `testing`, `experiment`. See [channels.md](channels.md) |
| `printer_specific` | `true` if the plugin only makes sense on one printer model |
| `source` | Your repo. Where a user goes to read the code |
| `publisher` | Your signing key fingerprint. **Write the literal string `PLACEHOLDER`** and let the build stamp it. See below |
| `author` | Your display name. Shown, never trusted |

### `publisher` versus `author`, and why `PLACEHOLDER`

`author` is a name you typed. Anyone can type any name, so the app shows it and proves nothing with
it.

`publisher` is a GPG key fingerprint, and it is the thing a signature is checked against. Which means
you must not type it either: a manifest that claims a fingerprint it cannot prove would be a lie the
app has no way to catch until download time.

So the rule is mechanical. **In your repo, `publisher` is the literal string `PLACEHOLDER`.** When
the build signs your package, it replaces `PLACEHOLDER` with the real fingerprint of the key it is
signing with, and then signs. When the build is unsigned, `PLACEHOLDER` stays, and the app shows the
plugin as unsigned.

An unsigned build over a manifest that hand-declares a real fingerprint is refused outright. That is
not a bug to work around; it is the check doing its job.

A `PLACEHOLDER` left in a built package is a defect. In your source it is correct and permanent.

### Optional identity fields

| Field | What it is |
| --- | --- |
| `icon` | A filename in `doc/`, shown as the plugin's icon |
| `homepage` | The project's own site, if the plugin wraps someone else's software |
| `sw_version` | The version of the software you are wrapping, when that is not your `version`. Written as it should read: `Fluidd v1.37.2 (plugin v0.1.4)` |
| `attributions` | Credits text, shown in the store. Keep the same text in `doc/ATTRIBUTIONS.md` |
| `license` | A **full URL** to your licence. It is a link out, never a shipped file |
| `changelog` | A path inside `doc/`, usually `doc/CHANGELOG.md`. The store turns it into a link |
| `min_daemon_version` | The oldest Bespok3d daemon your plugin works with |
| `min_jinni_version` | The oldest printer support package your plugin works with |

If you wrap someone else's software, set `sw_version`. It is the field that lets a user see which
upstream version they are about to install without reading your changelog.

## What the plugin needs from the printer

```json
"requires": {
  "capabilities": ["klipper-generic"],
  "variables": [
    { "name": "MY_PLUGIN_SERVER", "description": "Where your server is reachable from the printer.", "required": true },
    { "name": "MY_PLUGIN_API_KEY", "description": "The API key your server issued.", "required": true }
  ]
}
```

- **`capabilities`**: what the printer must be able to do. `klipper-generic` means "any printer
  running Klipper through Bespok3d", which is what most plugins want. A plugin that needs specific
  hardware names the capability for it, and a printer whose adapter does not declare that capability
  will not offer your plugin.
- **`variables`**: the values your plugin needs at install time, one object each, with a `name`, a
  `description` and `required`. Every `name` here should have a matching entry in `config`, otherwise
  the user is never asked for it. Write the objects, not a plain list of names: the daemon reads
  `required` off each entry, and a bare string there stops the install with an error.

Watch the spelling: **`requires` and `require` are two different fields.** `requires` (with the s) is
this one, about the printer. `require` (no s) is about other plugins, below.

## Working with other plugins

Three fields describe your plugin's place among the others.

```json
"provides": [{ "service": "filament-database" }],
"require":  [{ "service": "camera-stream", "cardinality": "one" }],
"conflicts": ["some-other-plugin"]
```

- **`provides`**: names of services your plugin offers. Another plugin can then require the service
  rather than requiring you specifically, so a user can swap one provider for another. Add
  `"exclusive": true` when only one plugin may provide it at a time.
- **`require`**: services you need from another plugin, each with a `cardinality` of `one`, `many` or
  `optional`. You can add a `selector` to narrow which provider is acceptable and a `version` floor.
  When the app resolves your entry, each required service becomes a dependency on whichever plugin
  provides it, and the store installs it for the user.
- **`conflicts`**: plugins that cannot be installed alongside yours.

The base Bespok3d layer is always present, so you never declare it.

## Asking the user questions

```json
"config": [
  {
    "key": "MY_PLUGIN_SERVER",
    "label": "Server address",
    "type": "url",
    "default": "http://localhost:7912",
    "hint": "Where your server is reachable from the printer.",
    "required": true,
    "scope": "printer"
  },
  {
    "key": "MY_PLUGIN_POLL_SECONDS",
    "label": "Poll interval (seconds)",
    "type": "number",
    "default": 30,
    "scope": "printer"
  },
  {
    "key": "MY_PLUGIN_VERBOSE",
    "label": "Verbose logging",
    "type": "toggle",
    "default": false,
    "onValue": "true",
    "offValue": "false",
    "scope": "printer"
  }
]
```

Each entry becomes one field in the install dialog, and its answer is available to your `.tmpl`
files as `$KEY`.

**The field types.** This short list is the whole vocabulary, and picking the right one is the
difference between a form that guides the user and one that lets them type anything:

| `type` | The user gets | Use it for |
| --- | --- | --- |
| `text` | A text box | Free text |
| `number` | A numeric input | Intervals, counts, thresholds |
| `select` | A dropdown, from your `options` array | A fixed set of choices |
| `toggle` | An on/off switch | Anything boolean |
| `http-port` | A port input | A port number |
| `address` | A host or IP input | A machine on the network |
| `url` | A URL input | A full endpoint |

A boolean is a `toggle`, never a `select` with `"true"` and `"false"` in it. A number is a `number`,
never a `text`. The app validates by type, so the wrong type means a user can enter a value your
plugin cannot use, and nothing catches it until the printer restarts.

Other keys on a config entry:

| Key | What it does |
| --- | --- |
| `options` | The choices, for `select` |
| `default` | Pre-filled value |
| `placeholder` | Greyed-out example text |
| `hint` | A line of help under the field |
| `required` | Whether the user must fill it |
| `userEditable` | `false` to show the value but forbid changing it |
| `onValue` / `offValue` | For `toggle`: what gets substituted into your template for on and off. Klipper wants `true`/`false`, so say so |
| `scope` | `printer` for a per-printer value, `global` for one shared across every printer the user manages |

Because a placed config file is symlinked and not editable in Fluidd or Mainsail, `config` is the
only way a user changes a setting. The app offers a graphical editor for these fields on the
plugin's detail page after install, and re-renders your templates when they change.

## Permissions

```json
"permissions": ["moonraker-component", "moonraker-config", "restart"]
```

A plain list of everything your plugin does, in the user's terms. It must cover every install class
you place and every verb you use. The app shows this list before installing, and when an update adds
a permission the user is asked again rather than silently upgraded. Keep it accurate: it is the one
place a user sees the shape of what you are about to do to their printer.

## Where the files go

```json
"install": {
  "place": [
    { "class": "moonraker-component", "src": "files/moonraker/my_component.py" },
    { "class": "moonraker-config", "src": "files/cfg/moonraker/my-plugin.cfg.tmpl", "render": true }
  ],
  "restart": ["moonraker"]
}
```

`install.place` is a list of destinations. Each entry says **what a file is**, never where it goes.

| `class` | What it is |
| --- | --- |
| `klipper-config` | A Klipper config fragment |
| `moonraker-config` | A Moonraker config fragment |
| `klipper-extra` | A Python module Klipper loads as an extra |
| `moonraker-component` | A Python module Moonraker loads as a component |
| `system-bin` | An executable your plugin runs |
| `web-location` | A web server location block |
| `kernel-module` | A `.ko` kernel module |

Each entry takes `src` (the path inside your plugin), an optional `name` (the filename to use at the
destination, when it should differ from the source), and `render: true` when the source is a
`.tmpl`.

The printer's adapter maps each class to a real path on that printer. That is why the same plugin
installs on a printer you have never tested against.

### The rest of `install`

| Key | What it does |
| --- | --- |
| `restart` | Which services to restart after placing. Every Klipper printer has `klipper`, `moonraker` and `web`; a printer's adapter can add names of its own, which its own docs list |
| `service` | A long-running program of yours: `{ name, command, args, env, ports, autostart, venv }`. The daemon writes the startup script |
| `kmodule` | A kernel module to load: `{ name, module, device_nodes, autoload }`. Loaded before your services start |
| `data` | Directories your plugin needs to write to. They survive an uninstall so a user does not lose their data |
| `instrument` | A patch against a file you do not own, applied as a diff. Use it only when there is no other way, and read the note below |

### Patching something you do not own

`install.instrument` applies a diff to a file that belongs to Klipper, Moonraker or the printer's
firmware.

**Your plugin does not carry a `klipper-source` instrument entry.** Every file the printer maker ships
has exactly one owning package, and those packages are that device family's base layer (`u1-base` for
the Snapmaker U1). No plugin outside the base layer carries a `klipper-source` entry.

That is a publishing rule, enforced where plugins get published. It is never a printer check: the
daemon does not refuse such an entry, so nothing on the printer will catch it for you (owner,
2026-08-22).

**What you write instead.** Name the door you need with a `require` entry against the service the base
member that owns the file provides, and call that door from your own Klipper module:

```json
"require": [
  { "service": "u1-base-fm175xx-reader", "cardinality": "one" }
]
```

The daemon refuses a package whose required service nothing on the printer supplies, so your plugin
cannot land ahead of the base member it calls into. A door that takes an `owner` argument is a
registration set: several plugins may hold it at once, and stock behaviour returns when the last one
lets go.

**If the door you need does not exist yet**, that is a pull request on the base plugin that owns the
file, in its repo under `plugins/`. A base release may only ADD a door.

**Do not ship `conflict_resolutions`.** The key has no reader: the app and the daemon both ignore it,
and every published plugin declares it empty. A package that must differ per firmware release carries
one diff per release shape in the `variants` array on its own entry, matched on `when.fw_min` against
the facts the printer reports, first match wins.

Prefer a config fragment or an extra. Patch last.

## When a release changes what your plugin does

Most releases are a newer build of the same plugin, and the app shows them as an ordinary update.
Some are not: your plugin stops doing something it used to do and needs other plugins alongside it,
or it stops existing under its own id and a collection takes over. A version number cannot say which
of those a release is, so you say it, in a top-level `migration` block. Leave it out and the app
tells the user nothing: they take what looks like a routine update and get a different plugin.

Two shapes, and only these two. Everything the user needs to understand is in what you write here.

Your plugin retires and a collection takes its id over. Declare it on the collection's manifest:

```json
"migration": {
  "from_version": "0.1.3",
  "summary": "Smoother Motion used to change your printer's Klipper files itself. From 0.1.4 the printer's base layer does that instead, so Smoother Motion is now a set of three plugins. The old one has to come off before the three can go on."
}
```

Your plugin keeps its id and changes what it does, bringing the plugins its new shape needs:

```json
"migration": {
  "until_version": "0.1.14",
  "requires_daemon": "0.14.0",
  "summary": "RFID Spool Reader used to change your printer's Klipper files itself. From 0.1.14 the printer's base layer does that work instead, so this update also puts on the three base layer plugins that now hold those files. Your saved spool tags and your settings are kept."
}
```

| Field | What it is |
| --- | --- |
| `summary` | What the user reads before the change runs. Plain language: what changes, and what is kept. Never a mechanism |
| `from_version` | The oldest installed version this move was written for. Leave it out and every older copy is covered |
| `until_version` | The version your new shape arrives in. Without it a plugin changing in place explains itself again on every release after this one |
| `requires_daemon` | The daemon version the printer needs before the change can run. Leave it out and the highest `min_daemon_version` among the arriving plugins is used |

The user gets no way to decline it, so write the `summary` as the explanation it is. The builder
copies the whole block onto your catalog entry, so publishing it takes nothing else.

## What you never write

These are computed by the builder. Writing them by hand does nothing except mislead the next person
who reads your repo:

- **`files`**: the integrity list, one entry per shipped file with its `sha256` and its mode. The
  builder walks `files/` and produces it. Hand-writing it is worse than useless: the printer refuses
  any package holding a file this list does not name, so a hand-written list that misses one file
  makes the whole plugin uninstallable.
- **`published_at`** and **`updated_at`**: timestamps stamped at build time.
- **`publisher`** as a real fingerprint: stamped at signing time, as above.

## A complete small plugin

Everything above is optional except the identity block, `requires`, `permissions` and `install`.
This is a real, complete, working manifest for a plugin that ships one Klipper config file:

```json
{
  "name": "my-macros",
  "title": "My Macros",
  "version": "0.1.0",
  "description": "My favorite Klipper macros as an installable plugin.",
  "tagline": "My favorite macros, one install away.",
  "category": "tuning",
  "channel": "stable",
  "printer_specific": false,
  "source": "https://github.com/you/my-macros",
  "publisher": "PLACEHOLDER",
  "author": "you",
  "requires": { "capabilities": ["klipper-generic"], "variables": [] },
  "permissions": ["klipper-config", "restart"],
  "install": {
    "place": [{ "class": "klipper-config", "src": "files/cfg/klipper/my-macros.cfg" }],
    "restart": ["klipper"]
  }
}
```

## Documenting your macros

If your plugin adds Klipper macros, list them so the app can show the user what they gained:

```json
"macros": [
  { "name": "MY_CALIBRATE", "description": "Runs the calibration routine.", "params": "SPEED=<mm/s>" }
]
```

## Next

- [anatomy-of-a-b3-file.md](anatomy-of-a-b3-file.md): what the builder turns all this into.
- [kinds-of-plugins.md](kinds-of-plugins.md): what changes when your plugin ships a binary, Python
  packages, or a kernel module.
