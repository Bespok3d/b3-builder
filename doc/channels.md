# Channels

Every plugin declares a channel in its manifest. It is one word, and it tells a user how much they
should trust this release with a printer they need working tomorrow.

```json
"channel": "stable"
```

## The five channels

| Channel | What the user is told |
| --- | --- |
| `lts` | Long-term support. Thoroughly tested, quarterly cadence. |
| `stable` | Production-ready releases. Bi-weekly cadence. |
| `rc` | Release candidates. Mostly stable; some rough edges. |
| `testing` | Early access builds. May have known issues. |
| `experiment` | Proof-of-concept. Expect breakage; do not use on printers you need. |

Those are the exact words the app shows. Pick the row that honestly describes your release, and the
description a user reads is already written.

## How a user's setting works

The user picks one channel as a **ceiling**, meaning "this one or anything more stable". The default
is `stable`.

So a user set to `stable` sees `lts` and `stable` plugins. A user set to `testing` sees everything
except `experiment`. Someone on `lts` sees only `lts`.

They can also switch individual channels back off, and override the setting for a single plugin when
they want the bleeding edge of one thing and stability everywhere else.

The practical consequence for you: **most users are on the default.** A plugin published as `testing`
is invisible to them until they go looking. That is the point of the setting, and it is also the thing
to keep in mind when you wonder why nobody installed your release.

## Choosing yours

Ask what happens to a stranger's printer if this release is wrong.

- **`experiment`**: it might not work at all, and you know it. Anything device-specific you have only
  ever run on your own machine starts here.
- **`testing`**: it works for you, it has known rough edges, and you want people to try it. This is a
  good place for a first release.
- **`rc`**: you believe it is finished and you want confirmation before promoting it.
- **`stable`**: you have used it, someone else has used it, and you would install it on a printer in
  the middle of a job. **Most published plugins belong here.**
- **`lts`**: you are committing to a slow, careful cadence and to not surprising anyone. Do not claim
  this unless you mean it.

Do not publish `stable` because it gets more installs. A user set to `stable` has told you what they
expect, and a plugin that breaks their printer is a much bigger deal than a plugin nobody tried.

## Promoting a release

A channel is a property of the version, so promoting means a new release:

1. Change `channel` in the manifest.
2. Bump `version`.
3. Tag and release.

Users on the wider setting keep the release they have; users on the narrower one now see the new one.
There is no separate promote button, and there does not need to be one.

## Channels are not release branches

One thing to be clear about: a channel says how risky the release is. It has nothing to do with which
branch you develop on, and the app has no concept of a "development variant" of a plugin. One plugin,
one name, one version, one channel per release.

If you want to run something on your own machine that you never publish, that is a
[local build](local-testing.md), not a channel.
