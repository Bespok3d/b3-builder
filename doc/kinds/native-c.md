# Native C

Your plugin needs a C program compiled for the printer, and there is no prebuilt binary to download.
The build compiles it inside a Docker image targeting arm64, then takes the named artifacts out.

This is how the U1 hardware camera plugin works.

## Declaring it

```json
"bake": [
  {
    "class": "docker-c",
    "dockerfile": "toolchain/Dockerfile",
    "context": ".",
    "platform": "linux/arm64",
    "out": "/out",
    "members": [
      { "path": "hw-camera", "dest": "files/bin/hw-camera", "mode": "0755" },
      { "path": "libcamhal.so", "dest": "files/lib/libcamhal.so", "mode": "0755" }
    ]
  }
]
```

| Field | Meaning |
| --- | --- |
| `dockerfile` | Path to your Dockerfile, relative to your plugin directory |
| `context` | The Docker build context. Defaults to `.` |
| `platform` | The target platform. Defaults to `linux/arm64`, which is what you want |
| `out` | The directory inside the built image holding the artifacts. Defaults to `/out` |
| `members[]` | Exactly what to take out: `path` inside `out`, `dest` in your plugin, `mode` |

## What the build actually runs

```sh
docker info                       # fails early with a clear message if Docker is not running
docker buildx build --platform linux/arm64 -f <dockerfile> -t <tag> <context>
# extracts <out> from the built image
# checks the declared members, then copies each one to its dest
```

Your Dockerfile does the compiling, and its only contract with the builder is: **put the finished
artifacts in `/out`**. How you get there is yours. A typical one installs a toolchain, copies the
source in, runs `make`, and copies the results to `/out`.

Because `--platform linux/arm64` is passed, the build runs the arm64 image under emulation on an x86
runner. That works and it is slow: expect minutes, not seconds. A GitHub runner needs the QEMU setup
step before this bake, which the Bespok3d release action does for you.

## `members` must be exhaustive, and here is why

The bake checks the extracted `out` directory twice:

- **Every member you declared must exist.** A missing one stops the build and tells you which.
- **Nothing undeclared may be left there.** An extra top-level file or directory in `/out` with no
  matching member also stops the build.

The second check exists because of a real incident: an earlier build staged the whole `/out`
directory, a Dockerfile left a stale `html/` tree behind, and that tree shipped to a printer. Nobody
noticed, because a check that only asks "did the binary appear?" cannot see what else came with it.

So when your build fails saying something was left in `/out` with no matching member, the fix is one
of two things: declare it because you meant to ship it, or stop producing it. Do not widen the
declaration to make the message go away.

## Building it

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin --bake
```

Needs Docker running. If it is not, the bake stops with a plain message saying so rather than a raw
socket error, because that is the mistake everyone makes at least once.

## Checking what you produced

```sh
file files/bin/hw-camera
```

Expect `ELF 64-bit LSB ..., ARM aarch64`. Then think about linking: unlike a Go binary, a C binary is
usually dynamically linked, so anything it links against must also be present on the printer or
shipped by you. Check it:

```sh
docker run --rm --platform linux/arm64 -v "$PWD/files:/f" <your-image> readelf -d /f/bin/hw-camera | grep NEEDED
```

Every library named there must either be part of the printer's base system or be one of your own
members. A binary that needs a library that is not on the printer fails at start, and it fails on the
user's machine, not on yours.

## Before you take this on

A native C bake is the second hardest kind, and most of its cost is in things this page cannot check
for you: which libc the printer has, which kernel headers your code assumes, whether the library you
link against exists there at all. Work down the alternatives first:

1. Does upstream publish an arm64 binary? Use [prebuilt-download.md](prebuilt-download.md).
2. Can it be a Go program? Use [go-binary.md](go-binary.md) and skip the whole toolchain problem.
3. Is it actually a Python package with a C extension? Then it is a
   [Python plugin](python.md), and the question is whether an arm64 wheel exists.

If none of those apply, you are in the right place.
