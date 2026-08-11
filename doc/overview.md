# What a plugin is

A Bespok3d plugin adds something to a 3D printer: a set of Klipper macros, a filament sensor
integration, a camera stream, a web interface, a background service. The user installs it from the
Bespok3d app in one click, and uninstalls it the same way.

The point of the whole system is that the printer keeps running its stock firmware. Nothing is
flashed, nothing is compiled on the printer, and the printer is never left broken.

## The three pieces

| Piece | What it is |
| --- | --- |
| The plugin source | A directory in your git repo: a `manifest.json` and a `files/` tree |
| The package | A `.b3` file, which is the source directory built, checksummed and (optionally) signed |
| The catalog entry | A JSON record in a plugin list, which is how the app finds your plugin |

You write the first one. `b3-builder` produces the other two.

## How an install actually works

1. The app reads a plugin list and shows your entry in its store.
2. The user picks your plugin and answers whatever configuration questions you declared.
3. The app downloads the `.b3`, checks it, and hands it to the Bespok3d daemon on the printer.
4. The daemon unpacks it, checks every file against the checksums in the manifest, and places each
   file where your manifest said it goes.
5. The daemon restarts whatever you asked it to restart.

You never write an install script. There is no `install.sh` in a plugin, and there is no way to run
arbitrary commands on the printer at install time. Your manifest describes what you want, and the
daemon does it. This is what makes an install reversible: because the daemon placed every file, it
knows how to remove every file.

## What you do not have to think about

- **Paths.** You never write `/usr/share/klipper/klippy/extras/`. You say "this is a Klipper extra"
  and the printer's adapter knows where that is on that printer. The same plugin then works on a
  printer you have never seen.
- **Checksums and file lists.** The builder walks your `files/` tree and computes them.
- **Compiling on the printer.** If your plugin needs a Go binary, a C program, a kernel module or
  Python packages, those are built in CI for the printer's architecture and shipped inside the `.b3`.
  The printer only ever unpacks.
- **Hosting.** A GitHub release holds your `.b3` files, and the plugin list that points at them is a
  release asset too.

## What you do have to think about

- **Which printers your plugin can work on.** A plugin that hardcodes `/dev/video11` works on exactly
  one printer model. Declare what you need instead, and let the user or the adapter supply the value.
- **What happens when it fails.** The daemon watches Klipper and Moonraker after a change. If your
  plugin breaks one of them, the daemon deactivates your plugin and restarts, so the user keeps a
  working printer. Design for that rather than against it.
- **Who you are.** A signature over your package proves the release came from the key you published.
  Signing is optional, and the app installs unsigned plugins, but it says so to the user. See
  [signatures.md](signatures.md).

## Where to go next

If you want to build one right now, go to
[plugin-zero-to-hero.md](plugin-zero-to-hero.md). If you want to understand the pieces first, read
[anatomy-of-a-plugin.md](anatomy-of-a-plugin.md).
