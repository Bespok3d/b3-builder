# Plugin sources

A source is a place the app gets plugins from. Understanding the three kinds tells you where your
plugin will appear, how it gets there, and how a user ends up with it.

## The three kinds

| Kind | Where it comes from | Trust | Can a user add one? |
| --- | --- | --- | --- |
| **Bundled** | Ships inside the app itself | Bespok3d project | No |
| **Official remote** | The published index, fetched over the network | Bespok3d project | No, it is always present |
| **Sideloaded local** | A `.b3` file the user dropped onto the app | Unknown publisher | Yes, by dropping a file |

Adding an arbitrary remote source is not available today. The app's "Add source" button exists and is
disabled, labelled as coming in a future update. So for now, a user gets your plugin either from the
official index or by receiving your `.b3` file directly.

## How a catalog is actually assembled

Three levels, each a plain signed JSON file:

```text
index of lists   ->  names each publisher's list and where to fetch it
   list          ->  names each plugin in one publisher's repo, and its entries
      entry      ->  one plugin at one version: title, description, category,
                     channel, publisher, download_url, doc_url
```

Your release workflow produces the bottom two: an entry per plugin, assembled into your list, uploaded
as a release asset, and then registered by reference in the index of lists. The app walks that chain
and shows the result as one store.

Notice what is not in the chain: nobody hosts your files. Your `.b3` is a release asset in your own
repository, and the entry points at it. The index is a directory, not a warehouse.

## What a catalog entry carries, and what it does not

An entry is the **shop window**. It has enough to show your plugin and to fetch it:

name, title, version, description, tagline, category, channel, publisher, whether it is printer
specific, publication dates, and optionally an icon, homepage, software version, macros, config
fields, minimum daemon and jinni versions, plus the download and doc URLs.

It does **not** carry your `install` block, your permissions, or your file list. Those live inside the
package, where they are covered by the signature. The store cannot promise what the plugin will do;
the package declares it, and the daemon reads it from the signed manifest at install time.

## Precedence: a local build shadows a published one

When two sources offer the same plugin at the same name and version, the app takes the first one in
its ordering, and bundled comes first.

That is not an accident, it is the local development story: a plugin you built yourself and put in the
bundled set shadows the published one, so you test your build rather than the one already shipped.

## The local registry

When a user drops a `.b3` onto the app window, or double-clicks one, the app:

1. Opens the archive and validates the manifest.
2. Copies the package into a local registry directory.
3. Stages the plugin's docs so its store page reads normally.
4. Rebuilds the local index.
5. Offers to install it, if a printer is currently selected.

On macOS that registry lives at:

```text
~/Library/Application Support/Bespok3d/local-plugins/
  index.json
  <name>-<version>.b3
  origins.json
  <name>/doc/
```

The plugin shows up in the store as any other, marked as coming from an unknown publisher, and
installs normally. Everything about it works: config, permissions, updates through a new drop.

This is the whole distribution mechanism you need to test your plugin, to share a beta with somebody,
or to run something you never intend to publish. See [local-testing.md](local-testing.md).

## Trust travels with the source

Each source carries a trust level, and a plugin inherits its source's level unless its own signature
says otherwise. The published index is a project source. A dropped file is an unknown publisher.

That is why a sideloaded plugin says "Unknown publisher": not a judgement about your code, just an
accurate statement that the app has no basis for saying where it came from. Sign it and the label
becomes about your key instead. See [signatures.md](signatures.md).

## What this means for you as an author

- **Your repository is the host.** No upload, no store approval, no review queue. You cut a release,
  the entry points at it.
- **To be in the official index**, your list gets registered there once. After that every release you
  cut is picked up automatically.
- **To distribute outside it entirely**, hand people your `.b3`. It works, it always will, and nothing
  in the design gets in the way of it.
- **Your entry is only as good as your manifest.** Title, tagline, description, category and icon are
  what a user reads before deciding. They come straight from your manifest, so write them for a person
  looking at a store, not for yourself.
