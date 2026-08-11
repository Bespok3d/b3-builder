# Kernel module

Your plugin ships a `.ko`, a driver the printer's Linux kernel loads. This is the hardest kind, and
the only one where getting it slightly wrong takes the printer down rather than just failing to
start. Read the whole page before you begin.

The Bespok3d VPN plugins need this: the stock U1 kernel ships without the `tun` module, and a VPN
cannot work without it.

## Why it is different

A kernel module is compiled against one exact kernel. Not "Linux 4.19", not "the U1 firmware": the
exact kernel source revision and the exact `.config` the printer's kernel was built with. A module
built against anything else either refuses to load or, worse, loads and then misbehaves.

So a kernel-module plugin ships **one module per firmware version**, and the manifest picks the right
one for the printer in front of it. Adding support for a new firmware release means a new bake, a new
variant, and a new device test. There is no build-once-run-anywhere here.

## Declaring it

One bake step per kernel you support:

```json
"bake": [
  {
    "class": "docker-ko",
    "dockerfile": "kernel/Dockerfile",
    "context": ".",
    "module": "tun.ko",
    "out": "/out",
    "kernel": {
      "release": "4.19.193",
      "vermagic": "4.19.193 SMP preempt mod_unload aarch64"
    },
    "variant_dest": "files/modules/4.19.193/tun.ko"
  }
]
```

| Field | Meaning |
| --- | --- |
| `dockerfile` | The build image that compiles the module |
| `context` | Docker build context. Defaults to `.` |
| `module` | The module filename produced inside `out` |
| `out` | Directory inside the image holding the built module. Defaults to `/out` |
| `kernel.release` | The kernel release string this variant is for |
| `kernel.vermagic` | The exact vermagic string the printer's kernel accepts |
| `variant_dest` | Where the module lands in your plugin, one path per variant |

Note that this bake is **not** built with `--platform linux/arm64`. It is a cross-compile: an x86
image runs an aarch64 kernel toolchain natively, which is both faster and how kernel builds are
normally done. That is the opposite of the native C case, and it is intentional.

## The vermagic check

After building, the bake reads the module's own vermagic and compares it to the one you declared:

```sh
docker run --rm --entrypoint modinfo <tag> -F vermagic <out>/<module>
```

A mismatch stops the build with a message naming both strings and telling you not to ship the module.
When you see it, something moved: the kernel source point you built against, or the `.config`. Fix
the build; do not adjust the declared string to match what came out.

## What the check does not tell you

**The bake asserts vermagic. It never claims the module works.**

This is the single most important sentence on the page, and it is written from an incident. Kernel
modules on this board are built with symbol versioning off, which means there is no per-symbol
checksum to catch a mismatch. A module built from the *wrong commit of the right kernel version* has
a perfectly matching vermagic, loads without complaint, appears in `lsmod`, and then fails the moment
you actually use it. In our case it was `TUNSETIFF` returning `EINVAL`: the module was loaded, and
the interface could not be created.

So a green build means the module is plausible, and nothing more. The real gate is a device test that
**exercises the capability**, not one that checks the module loaded:

- Wrong test: `lsmod | grep tun`.
- Right test: create a tun interface on the printer and confirm it comes up.

Nothing ships from this page without that test having passed on a real printer, on that exact
firmware version.

## Getting the kernel source right

Everything depends on building against the same source the vendor built the running kernel from. Work
in this order:

1. Read the running kernel's own strings from the printer: `uname -r`, and `cat /proc/version`.
2. Find the vendor's published kernel source for that firmware release. A release tarball tied to the
   firmware version is worth far more than a branch tip.
3. Get the running `.config`. If `/proc/config.gz` exists, that is the truth and you should use it.
4. Build, and only then compare vermagic.

If you cannot get a `.config` you trust, stop. A guessed `.config` produces exactly the failure
described above: it builds, it matches, and it does not work.

## Loading it on the printer

Declare the `kernel-module` permission and the module in `install.kmodule`. The daemon places it in
the right directory for the running kernel, refreshes the module index, and loads it. It also loads
it again after a reboot, because the printer's own boot process knows nothing about your module.

Which variant gets placed is decided by the kernel release on the printer in front of the user. If
there is no variant for that release, the plugin does not install, and the user is told the firmware
is not supported rather than being handed a module that cannot work.

## Building it

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin --bake
```

Needs Docker. Expect the build to be slow and to fail several times before it succeeds; that is
normal for kernel work and it is failing in the right place, on your machine, rather than on somebody
else's printer.

## Before you take this on

Ask whether you need a module at all. On this board, most of what people reach for a kernel module to
do can be done with a user-space program, and a user-space program that crashes takes nothing with
it. If the answer is genuinely yes, then commit to the whole obligation: one variant per firmware
version, a device test that exercises the capability, and a new release every time the vendor ships a
new kernel.

A printer that will not boot is the one failure this project treats as unacceptable, and this is the
only plugin kind that can cause it.
