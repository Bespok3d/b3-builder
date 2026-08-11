# Config files and patches

The simplest kind of plugin, and the one to reach for first. Everything it ships is text you wrote,
checked into `files/` exactly as it will land on the printer. There is no bake, and the build needs
no flags beyond the basics.

Typical contents:

- Klipper macros and config fragments.
- Moonraker config fragments.
- A Python module for Klipper's `extras` or Moonraker's `components`, **as long as it imports
  nothing beyond the standard library and what Klipper or Moonraker already provides**. If it needs
  a third-party package, you have a Python plugin: see [python.md](python.md).
- A web page or static assets served under a `web-location`.

## A worked example

A plugin that adds a set of macros and one Moonraker component:

```text
cpu-temp/
  manifest.json
  files/
    cfg/klipper/cpu-temp.cfg
    moonraker/cpu_temp.py
  doc/README.md
```

```json
{
  "name": "cpu-temp",
  "title": "CPU Temperature",
  "version": "0.1.0",
  "description": "Reports the printer board's CPU temperature to Moonraker and the web interface.",
  "tagline": "See how hot the board is running.",
  "category": "sensors",
  "channel": "stable",
  "printer_specific": false,
  "source": "https://github.com/you/cpu-temp",
  "publisher": "PLACEHOLDER",
  "author": "you",
  "requires": { "capabilities": ["klipper-generic"], "variables": [] },
  "permissions": ["klipper-config", "moonraker-component", "restart"],
  "install": {
    "place": [
      { "class": "klipper-config", "src": "files/cfg/klipper/cpu-temp.cfg" },
      { "class": "moonraker-component", "src": "files/moonraker/cpu_temp.py" }
    ],
    "restart": ["klipper", "moonraker"]
  }
}
```

Build it:

```sh
npx b3-builder build --source ./cpu-temp --out dist --atom-repo you/cpu-temp
```

No `--bake`. Nothing to bake.

## Making it configurable

A config fragment with a hardcoded value works on your printer and nobody else's. Rename the file to
`.cfg.tmpl`, put `$KEY` where the value goes, add `render: true` to the place entry, and declare the
key in `config`:

```json
"requires": { "capabilities": ["klipper-generic"], "variables": ["CPU_TEMP_POLL_SECONDS"] },
"config": [
  {
    "key": "CPU_TEMP_POLL_SECONDS",
    "label": "Poll interval (seconds)",
    "type": "number",
    "default": 10,
    "scope": "printer"
  }
],
"install": {
  "place": [
    { "class": "klipper-config", "src": "files/cfg/klipper/cpu-temp.cfg.tmpl", "render": true }
  ]
}
```

The user is asked once at install, can change it later from the plugin's page, and the daemon
re-renders the file when they do.

## Patching a file you do not own

Sometimes there is no extension point and the only way in is to modify a Klipper or firmware file
directly. `install.instrument` does that, applying a diff:

```json
"install": {
  "instrument": [
    { "class": "klipper-source", "name": "toolhead.py", "diff": "files/patches/toolhead.patch" }
  ]
}
```

Understand what you are taking on. A diff is written against exact surrounding lines, and the
printer's firmware changes underneath you. When it stops applying, your plugin stops installing.

The way to survive that is `conflict_resolutions`: a list of alternate patches, each with the
firmware versions it applies to.

```json
"conflict_resolutions": [
  {
    "condition": { "fw_max": "1.4.0.244" },
    "resolution": "files/patches/toolhead-legacy.patch"
  }
]
```

Patch last. Try a config fragment, a Klipper extra or a Moonraker component first: all three are
additive, and none of them break when the firmware moves.

## What to check before you publish

- Every file in `files/` is one you meant to ship, and there is no `__pycache__` in the tree.
- Every `place` entry's `src` actually exists.
- Your `permissions` list covers every class you place plus `restart` if you restart anything.
- Nothing in your config files is specific to your machine: no IP address, no serial number, no
  `/dev/video11`.
