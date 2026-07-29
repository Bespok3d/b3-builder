# Contributing

Thanks for working on `b3-builder`, the Bespok3d publisher tool. It packs a plugin's source into a
signed `.b3`, cuts a release, and registers the atom in the org index. It runs both as a local CLI and
as the CI Action every plugin repo calls. See [README.md](README.md) for the commands and the build
flow.

## Before you write code

Read [CLAUDE.md](CLAUDE.md). It is the contract for changes here: the non-negotiables (RULE ZERO: no
em-dash or en-dash; every identifier carries domain meaning; nesting beyond one level is suspicious;
rule of three), and the working procedure. If you use an AI assistant, point it at that file;
`AGENTS.md` sends non-Claude tools there too.

The publishing org identity is always an input to a build, never baked into the tool. Keep it that
way: the same builder must publish for any org that runs it.

## Develop

```sh
bash scripts/check.sh
```

Run it before every push; CI runs the same gate.

## Constraints

- The maintainer owns git history and releases; submit changes as a pull request against `dev`.
- A change to the pack, sign, or register flow ships with a test; this tool is the trust boundary for
  every package the ecosystem installs.

## Signing off your work

Every commit must carry a `Signed-off-by` line. It is your statement that you wrote the change, or
that you otherwise have the right to contribute it, under the terms of the Developer Certificate of
Origin (<https://developercertificate.org/>). Git writes the line for you:

```sh
git commit -s -m "your message"
```

A pull request whose commits are not signed off cannot be merged.

## Licence

This repository is under the GNU Affero General Public License, version 3 or any later version. The
full text is in [LICENSE](LICENSE).

By contributing you agree that your contribution is licensed under those same terms. You keep the
copyright in what you write. There is no copyright assignment and no contributor licence agreement to
sign.
