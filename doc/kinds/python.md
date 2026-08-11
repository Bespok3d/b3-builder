# Python dependencies

Read this page before you add either requirements file. Which one you pick is not a style choice, it
decides where your packages end up on the printer, and picking the wrong one either does not work or
puts the printer at risk.

## The problem

The printer runs Klipper and Moonraker on the system Python interpreter. We did not install that
interpreter, we do not own it, and we do not control the scripts that launch Klipper and Moonraker.
On the first target board, `pip` is broken outright: its vendor files are missing, so a source build
fails partway through with an error about `_in_process.py`.

Two hard rules come out of that:

- **Nothing is ever installed on the printer.** No `pip install` at install time, no compiling, no
  network fetch. Everything is downloaded and prepared in CI, for the printer's architecture, and
  shipped inside the `.b3`. The printer only unpacks.
- **Nothing is ever installed into the system, Klipper or Moonraker interpreter.** A plugin that
  writes into the interpreter Klipper runs on can break every other plugin, and can break Klipper
  itself, and there is no clean way back. This one cost eight hours to learn.

Everything below follows from those two rules.

## The two files

| | `requirements.txt` | `klipper_requirements.txt` |
| --- | --- | --- |
| **For** | A program of your own that you run as a service | Code you place inside Klipper or Moonraker |
| **Where the packages go** | A private virtual environment, yours alone | Symlinked into the interpreter Klipper and Moonraker already use |
| **What CI bakes** | Wheels, into `files/wheels/` | Unpacked packages, into `files/site-packages/` |
| **Who can import them** | Only your program | Klipper, Moonraker, and everything else on that interpreter |
| **Risk if you get it wrong** | Your program cannot start | You can break the printer for everyone |

**You may ship one or the other. Never both.** The daemon refuses to install a plugin carrying both
files, because the same package arriving through two different mechanisms is exactly the collision
neither mechanism can resolve.

Neither file is declared in your manifest. **Presence is the declaration**: create the file, and the
build knows what to do.

## Which one do I need?

Ask one question: **whose interpreter runs the code that does the importing?**

- **My own program, started by my plugin's `install.service`.** Nobody else's interpreter is
  involved, so give it its own environment. Use `requirements.txt`.
- **A file I place as a `klipper-extra` or a `moonraker-component`.** Klipper or Moonraker imports
  that file, in their interpreter, from their process. Your private environment does not exist as far
  as they are concerned. Use `klipper_requirements.txt`.

There is no third case. If you find yourself wanting both, you have two plugins, or you have one
plugin that should move the dependency-heavy work into its own service and talk to it.

## `requirements.txt`: your own environment

The safe one. Use it whenever you can.

Write it exactly as you would anywhere else:

```text
requests==2.32.3
websockets==12.0
```

At release time, CI downloads those as wheels built for the printer's architecture into
`files/wheels/`. On the printer, the daemon creates a virtual environment that belongs to your plugin
alone, at a path derived from your plugin's name, and installs from the shipped wheels with the
network switched off:

```sh
pip install --no-index --find-links files/wheels -r requirements.txt
```

Your service then runs against that environment. Declare it in your manifest:

```json
"install": {
  "service": [
    {
      "name": "my-plugin",
      "command": "python3",
      "args": ["-m", "my_plugin"],
      "venv": true,
      "autostart": true
    }
  ]
}
```

`"venv": true` is what makes the service run inside your environment instead of the system one. The
path to it is also available to your service as `$PLUGIN_VENV` if you need to reference it directly.

Because the environment is yours, you can pin whatever versions you like, and another plugin pinning
a different version of the same package is not your problem. Nothing you install here is visible to
Klipper, to Moonraker, or to any other plugin.

## `klipper_requirements.txt`: shared with Klipper and Moonraker

The one that needs care.

If you ship a Klipper extra or a Moonraker component that imports a third-party package, that import
happens inside Klipper's or Moonraker's own process. You cannot put the package in a private
environment, because we do not own their launch scripts and cannot add anything to their import
path. The package has to be importable from the interpreter they already run.

So the mechanism is different. CI downloads the packages and **unpacks** them into
`files/site-packages/`. On the printer, the daemon symlinks each baked top-level package into the
system interpreter's site-packages directory. Klipper and Moonraker then import them normally,
because from their point of view the package is simply there.

Symlinks, not copies, and that is the point: uninstalling your plugin removes the links and the
interpreter goes back to exactly what it was.

```text
klipper_requirements.txt
smbus2==0.4.3
```

Two guards run before anything is linked:

- **A name the base interpreter already provides is never linked over.** If the printer's Python
  already has that module, your copy is skipped rather than shadowing it. Shadowing a module Klipper
  depends on is precisely the failure this rule exists to prevent.
- **A version collision with another plugin is refused.** If another installed plugin already linked
  a different version of the same package, your install is refused rather than silently overwriting
  it. Two plugins wanting incompatible versions of a shared package is a real conflict and it is
  surfaced as one.

That second guard is the reason to think hard before choosing this route. Every package you put in
`klipper_requirements.txt` is a package another plugin author might also want, at a version you do
not control. Keep the list as short as it can possibly be, and pin conservatively: an unnecessarily
tight pin turns into a refused install for a user who has done nothing wrong.

## What CI does, and why your dependency might not be installable

Both bakes cross-download for the printer, from a build machine that is almost certainly a different
architecture. The flags say exactly what target is wanted:

```sh
--platform manylinux2014_aarch64
--python-version 3.11
--implementation cp
--abi cp311 --abi abi3 --abi none
--only-binary=:all:
```

`--only-binary=:all:` is the important one, and it is a feature. It means pip is forbidden from
falling back to building a package from source. If no compatible prebuilt wheel exists for arm64
Python 3.11, **the bake fails loudly in CI** instead of producing a package that fails on the user's
printer.

So if your build fails with pip saying it could not find a matching distribution, that is not a bug
in the tooling. It means your dependency ships no arm64 wheel for that Python version. Your options,
in order of preference:

1. Find a different package that does ship one.
2. Use an older or newer version of the same package that does.
3. Drop the dependency and write the small piece of it you needed.
4. If it is a C extension you genuinely need, you are looking at a native build: see
   [native-c.md](native-c.md).

## Building it

Both kinds need `--bake`, because without it the build packs whatever is in `files/` and there is
nothing there yet:

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin --bake
```

In the release workflow, set `bake: 'true'`.

If you forget, the build does not quietly ship a broken plugin. The final gate checks that a plugin
declaring Python dependencies actually has a non-empty `files/wheels/` or `files/site-packages/`, and
refuses to pack when it does not.

## Checking what you produced

```sh
# For a requirements.txt plugin: are the wheels there, and are they arm64?
unzip -l dist/my-plugin-0.1.0.b3 | grep wheels

# For a klipper_requirements.txt plugin: which top-level packages will be linked?
unzip -l dist/my-plugin-0.1.0.b3 | grep site-packages
```

A wheel filename ending in `manylinux2014_aarch64` is right. One ending in `x86_64`, `macosx` or
`win_amd64` means the cross-download flags did not apply, and that package will not run on the
printer.

## If it goes wrong on the printer

The daemon watches Klipper and Moonraker after installing anything. If your plugin makes one of them
fail to start, the daemon reads the service log, works out which plugin placed the file that caused
it, deactivates that plugin, and restarts. The user keeps a working printer, and your plugin is
switched off with its files still on disk.

For a `klipper_requirements.txt` plugin, that safety net is the difference between a bad dependency
being an inconvenience and it being a bricked printer. It is not an excuse to be careless with the
shared interpreter, but it is why the mechanism is allowed to exist at all.
