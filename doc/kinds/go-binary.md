# Go binary

Your plugin runs a program written in Go. The build clones the source at an exact commit,
cross-compiles it for the printer, and drops the binary into your `files/` tree.

## Declaring it

```json
"bake": [
  {
    "class": "go",
    "source": "https://github.com/prometheus/node_exporter",
    "commit": "b9d0932179a0c5b3a8863f3d6cdafe8584cf7c34",
    "package": "./cmd/node_exporter",
    "output": "files/bin/node-exporter"
  }
]
```

| Field | Meaning |
| --- | --- |
| `source` | A git URL to clone |
| `commit` | The exact commit to build. Required, and it must be a commit, not a branch or a tag |
| `package` | The package within the repo to build. Defaults to `.` |
| `output` | Where to write the binary, relative to your plugin directory. Almost always under `files/` |

## What the build actually runs

```sh
git clone <source> <tmp>
git -C <tmp> checkout <commit>
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go -C <tmp> build -o <output> <package>
```

`CGO_ENABLED=0` produces a fully static binary, so it does not care which libc the printer ships or
which version of it. That is the whole reason Go is the easy case: one command, no toolchain image,
no QEMU, and the result runs on any arm64 Linux board.

## Why the commit must be pinned

`commit` is required and it must be an exact commit hash. A branch name would mean two builds of the
same plugin version producing two different binaries, and a user would have no way to tell which one
they have. A tag is not enough either, because a tag can be moved.

When you want to move to a newer upstream, change the commit and bump your plugin's `version`. That
is a release, and it should look like one.

## Running it

A binary that nothing starts is just a file. Place it as a `system-bin` and declare a service:

```json
"permissions": ["system-bin", "service"],
"install": {
  "place": [{ "class": "system-bin", "src": "files/bin/node-exporter" }],
  "service": [
    {
      "name": "node-exporter",
      "command": "node-exporter",
      "args": ["--web.listen-address=:$EXPORTER_PORT"],
      "ports": ["$EXPORTER_PORT"],
      "autostart": true
    }
  ]
}
```

The daemon writes the startup script and manages the service. You do not ship an init script.

## Building it

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin --bake
```

You need `git` and a Go toolchain on the build machine. GitHub's runners have both, so in CI you
just set `bake: 'true'`.

Without `--bake`, the build packs whatever is already at `output`. That is useful when you built the
binary yourself out of band, and it is why the final gate checks for the file's **existence** rather
than for a bake having run: it refuses to pack a plugin that declares a Go binary and has none.

## Checking what you produced

```sh
file files/bin/node-exporter
```

Expect `ELF 64-bit LSB executable, ARM aarch64, ... statically linked`. If it says `x86-64`, the
cross-compile environment did not apply. If it says `dynamically linked`, `CGO_ENABLED=0` did not
apply and the binary may not run on the printer.
