# Prebuilt download

Your plugin wraps a project that already publishes arm64 Linux binaries. Do not rebuild what upstream
already ships: fetch their release, check it against a hash you pinned, and put the pieces you need
into your `files/` tree.

This is how the Tailscale and ZeroTier plugins work.

## Declaring it

```json
"bake": [
  {
    "class": "download",
    "fetch": [
      {
        "url": "https://pkgs.tailscale.com/stable/tailscale_1.78.1_arm64.tgz",
        "sha256": "9f2c1e...c7",
        "archive": "tar.gz",
        "members": [
          { "path": "tailscale_1.78.1_arm64/tailscaled", "dest": "files/bin/tailscaled", "mode": "0755" },
          { "path": "tailscale_1.78.1_arm64/tailscale", "dest": "files/bin/tailscale", "mode": "0755" }
        ]
      }
    ],
    "include": [
      { "src": "files/wrappers/ts-run", "dest": "files/bin/ts-run", "mode": "0755" }
    ]
  }
]
```

| Field | Meaning |
| --- | --- |
| `fetch[].url` | The exact release artifact to download |
| `fetch[].sha256` | Its hash. **Required.** The bake fails if the download does not match |
| `fetch[].archive` | `tar.gz`, `tar.xz`, or `deb` |
| `fetch[].members[]` | Which files to take out of the archive: `path` inside the archive, `dest` in your plugin, `mode` (defaults to `0755`) |
| `include[]` | Files already in your repo to copy into place alongside the download: `src`, `dest`, `mode` |

You can list several `fetch` entries in one step, for a project that ships its pieces separately.

## What the build actually runs

```sh
curl -fsSL <url> -o <tmp>
# compares sha256 against your pinned value, and stops if it differs
tar -xzf <tmp> -C <work>          # or -xJf for tar.xz
# copies each declared member to its dest with its mode
```

A `.deb` takes one extra step. Debian packages are `ar` archives with the real payload inside
`data.tar.xz`, so the bake runs `ar x` and then untars that member. There is no `dpkg` involved and
nothing is installed anywhere; the `.deb` is just a container to open.

## The hash is the point

`sha256` is required, and it is what makes this kind safe. You are shipping somebody else's binary to
somebody else's printer, so the version you tested is the version that must arrive. If upstream
replaces the artifact at that URL, the bake stops with a mismatch rather than quietly shipping
something you never looked at.

Get the hash the honest way, from the file you actually tested:

```sh
curl -fsSL -o artifact.tgz https://pkgs.tailscale.com/stable/tailscale_1.78.1_arm64.tgz
shasum -a 256 artifact.tgz
```

Upstream publishing their own checksum file is worth cross-checking against, but the value in your
manifest should be one you computed from the bytes you tested.

Upgrading upstream means changing the URL, the hash, and your plugin's `version` together, plus the
`sw_version` field if you set it. That is one commit and it reads as exactly what it is.

## `include`: your own launcher scripts

Most wrapped programs need a small wrapper: set an environment variable, point at a data directory
under the plugin's own tree, then exec the real binary. Those wrappers are yours, they live in your
repo, and `include` copies them into the payload with an executable mode. It is not a download; it is
there so that the file arriving next to the upstream binary is described in the same place.

## Building it

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin --bake
```

Needs `curl`, `tar`, and `ar` for a `.deb`. All present on a GitHub runner.

This is the cheapest bake to run and the easiest to verify locally, so if you are learning how bakes
work, this is a good one to try first.

## Checking what you produced

```sh
file files/bin/tailscaled
ls -l files/bin/
```

Expect `ARM aarch64`, and expect the mode you declared. A binary that arrives without the executable
bit will not run, and the mode in the manifest is exactly the mode the file has on disk after the
bake.
