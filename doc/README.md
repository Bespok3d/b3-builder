# Plugin documentation

A plugin adds something to a Klipper printer: a macro, a config change, a web page, a service, a
driver. These pages are how you build one and how you ship it to other people.

No prior knowledge of Bespok3d is assumed. If you have written a Klipper config, you can write a
plugin.

## Read in this order

| Page | Answers |
| --- | --- |
| [overview.md](overview.md) | What a plugin is, and what the system does for you |
| [plugin-zero-to-hero.md](plugin-zero-to-hero.md) | Build and publish one, start to finish. Start here if you want to be doing rather than reading |
| [anatomy-of-a-plugin.md](anatomy-of-a-plugin.md) | What a plugin is made of, directory by directory |
| [anatomy-of-the-manifest.md](anatomy-of-the-manifest.md) | Every field in `manifest.json`, and which ones you never write |
| [anatomy-of-a-b3-file.md](anatomy-of-a-b3-file.md) | What the build produces and what is inside it |
| [kinds-of-plugins.md](kinds-of-plugins.md) | The six kinds, and how to tell which one you are writing |
| [local-testing.md](local-testing.md) | Get it onto a real printer without publishing anything |
| [publishing-a-plugin.md](publishing-a-plugin.md) | Turn it into something other people can install |

## The kinds, one by one

| Kind | Page |
| --- | --- |
| Config files and patches | [kinds/files-only.md](kinds/files-only.md) |
| Python dependencies | [kinds/python.md](kinds/python.md) |
| A Go program | [kinds/go-binary.md](kinds/go-binary.md) |
| A binary somebody else publishes | [kinds/prebuilt-download.md](kinds/prebuilt-download.md) |
| Something compiled from C | [kinds/native-c.md](kinds/native-c.md) |
| A kernel module | [kinds/kernel-module.md](kinds/kernel-module.md) |

Writing anything in Python? Read [kinds/python.md](kinds/python.md) before you add a requirements
file. There are two of them, they are not interchangeable, and picking the wrong one can break the
printer for every other plugin.

## Signing and publishing

| Page | Answers |
| --- | --- |
| [signatures.md](signatures.md) | What a signature proves, what it does not, and what a user sees |
| [signing-a-plugin.md](signing-a-plugin.md) | From no key to a correctly signed release |
| [github-actions.md](github-actions.md) | The Action that builds, signs, releases and indexes for you |
| [plugin-sources.md](plugin-sources.md) | Where the app gets plugins from, and how yours gets there |
| [channels.md](channels.md) | `stable`, `testing`, `experiment`: which one to publish under |

## Elsewhere in the repo

- [../README.md](../README.md): b3-builder itself, the tool these pages tell you to run.
- [../CONTRIBUTING.md](../CONTRIBUTING.md): how to develop and submit a change to the build tool.
- [../SECURITY.md](../SECURITY.md): how to report a vulnerability.
