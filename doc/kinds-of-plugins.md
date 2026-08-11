# Kinds of plugins

Every plugin has the same shape: a manifest and a `files/` tree. What changes between kinds is
**where the contents of `files/` come from**.

The printer never compiles anything, never runs `pip`, and never downloads anything at install time.
So if your plugin needs a binary, a kernel module, or Python packages, those are produced ahead of
time, in CI, for the printer's architecture, and shipped inside the `.b3`. That production step is
called a **bake**.

## The six kinds

| Kind | What it ships | You declare it with | Page |
| --- | --- | --- | --- |
| Config files and patches | Text you wrote | Nothing. `files/` is complete as checked in | [kinds/files-only.md](kinds/files-only.md) |
| Python | Third-party Python packages | A `requirements.txt` or a `klipper_requirements.txt` file | [kinds/python.md](kinds/python.md) |
| Go binary | A compiled Go program | `"bake": [{ "class": "go", ... }]` | [kinds/go-binary.md](kinds/go-binary.md) |
| Prebuilt download | Someone else's released binary | `"bake": [{ "class": "download", ... }]` | [kinds/prebuilt-download.md](kinds/prebuilt-download.md) |
| Native C | A C program you compile | `"bake": [{ "class": "docker-c", ... }]` | [kinds/native-c.md](kinds/native-c.md) |
| Kernel module | A `.ko` built against the printer's kernel | `"bake": [{ "class": "docker-ko", ... }]` | [kinds/kernel-module.md](kinds/kernel-module.md) |

They combine. A plugin can bake a Go binary and ship config files, or download a release and add a
Klipper macro on top. Nothing here is exclusive, with one hard exception: the two Python
requirements files are mutually exclusive with each other.

## What a bake is, mechanically

A bake is a build step that runs before the package is assembled, and writes its output into your
`files/` tree. From then on it is just a file like any other: hashed, listed, shipped, placed.

Bakes are declared in one of two ways:

- **By presence**, for Python: you create `requirements.txt` or `klipper_requirements.txt` and that
  is the whole declaration. There is no manifest field.
- **By declaration**, for everything else: a `bake` array in your manifest, one entry per output,
  each keyed on a `class`.

Baking is opt-in on the build. `b3-builder build --bake` runs the bakes; without `--bake` the build
assumes `files/` is already complete and packs what it finds. The release workflow passes
`bake: true` when you set it, and that is where a real release bakes.

## The gate that stops a broken package

After baking and packing, the build runs one last check: **everything your manifest declares must
actually be present**. A `requirements.txt` with no wheels baked, a declared Go binary that is not
there, a kernel module variant missing: any of those refuses to pack.

The check looks at whether the output **exists**, not at whether a bake ran. So a plugin whose payload
you built by hand out of band passes just as cleanly as one built with `--bake`. What it will never
do is let you publish a package that promises something it does not contain.

## Everything targets arm64 Linux

Printers running Bespok3d are arm64 Linux boards. Every bake cross-builds for that target regardless
of what machine the build runs on, and a build machine's own architecture never leaks into the
output. This is why "it worked when I built it on my Pi" is not a thing you have to worry about, and
also why you cannot shortcut a bake by copying a binary from your laptop.

## Choosing

If you are not sure which kind you have, work down this list and stop at the first yes:

1. **Does your plugin need a kernel module?** Kernel module. It is the hardest kind and the one most
   tied to a specific firmware version.
2. **Does it need a C program?** Native C.
3. **Does it wrap a project that already publishes arm64 binaries?** Prebuilt download. Do not
   rebuild what upstream already ships.
4. **Is it a Go program you wrote?** Go binary.
5. **Does any Python code you ship import a package that is not in the standard library?**
   Python, and go read that page carefully, because which requirements file you pick is the decision
   that matters.
6. **Otherwise:** config files only. This covers more plugins than you would expect, and it is the
   only kind that needs no bake at all.
