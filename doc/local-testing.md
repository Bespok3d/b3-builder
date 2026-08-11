# Testing your plugin locally

Nothing here needs a release, a signature, or a repository. Build a `.b3`, get it onto a printer,
watch it work or watch it fail. Do this many times before you publish anything.

## Build it

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin
```

Add `--bake` if your plugin has a payload to build. You get `dist/my-plugin-0.1.0.b3`.

No signing key needed. An unsigned package installs; it is simply shown as coming from an unknown
publisher. See [signatures.md](signatures.md).

## Look inside before you install it

Thirty seconds here saves a lot of confusion later:

```sh
unzip -l dist/my-plugin-0.1.0.b3            # is everything there, and nothing extra?
unzip -p dist/my-plugin-0.1.0.b3 manifest.json | jq .
```

Check for a `__pycache__` directory, a `.DS_Store`, a stray backup file. Everything in `files/` is
shipped and hashed whether you meant it or not. The archive and the manifest's `files` list must
match exactly: a package carrying a file the list does not name is refused whole by the printer.

## Get it onto the app: drag and drop

The quickest loop, and the one to use for almost everything.

**Drag the `.b3` file onto the app window.** Double-clicking the file also works once the app is
installed, because it registers the file type.

The app opens the package, validates the manifest, copies it into your local plugin registry, stages
its docs, and offers to install it if you have a printer selected. From there it behaves exactly like
any other plugin: it has a store page, config fields, permissions and an uninstall.

To test a new build, drop the new file. Bump the version first if you want both to coexist; keep the
same version and you are replacing what is there.

The registry, if you want to look at it, is under your user application support directory in a
`Bespok3d/local-plugins/` folder: the packages themselves, an `index.json`, and each plugin's staged
docs.

## Get it onto the app: the development bundle

If you are working from an app source checkout, there is a second route that puts your plugin in the
bundled set, exactly where the shipped plugins live.

`Bespok3d-desktop/scripts/bundle.dev.json`:

```json
{
  "bundle": ["fluidd", "afc-lite", "mainsail", "spoolman", "my-plugin"],
  "variantDirs": []
}
```

- `bundle` lists the plugin names to pack into the development bundle.
- `variantDirs` names source directories under the sibling `plugins/` tree, when a plugin's directory
  name is not its plugin name.

Then:

```sh
npm run predev     # packs the listed plugins into the bundled index
npm run dev
```

Your plugin now appears in the store on launch, with no dropping and no network. Because the bundled
source is consulted first, a plugin you build here **shadows** the published one at the same name and
version, so you are testing your build rather than the one already released.

Release builds read a different file and never see `bundle.dev.json`, so nothing you put here can
escape into a shipped app.

Which route to use: drag and drop if you are writing a plugin, the development bundle if you are also
working on the app.

## Install it on a printer

Select an enrolled printer in the app and install from the store page like any user would. There is no
special developer install path, and that is the point: you are exercising the same flow your users
will.

Things to actually check, rather than "it installed":

| Check | Why |
| --- | --- |
| The store page reads properly | Title, tagline, description, icon and README are what a stranger sees first |
| Every config field behaves | A number field that accepts text, a toggle you declared as a dropdown: all visible here |
| The permissions prompt is honest | It lists what you declared. Anything surprising means your manifest is wrong |
| Klipper and Moonraker come back up | Watch the restart. This is where a bad config fragment shows itself |
| The thing your plugin does actually happens | Not "the service started". Exercise the capability |
| Uninstall leaves the printer clean | Reinstall afterwards and confirm it still works |

That last pair is the one people skip. A plugin that installs and never cleanly uninstalls is a
plugin that traps a user.

## Iterating quickly

Rebuild, drop, reinstall. The loop is short on purpose. Two things make it shorter:

- Bump the patch version on every build you test, so you are never wondering which one is installed.
- Keep a `tests/run.sh` that catches your dumb mistakes locally, before the printer is involved. Even
  `python3 -m py_compile` over your Python files pays for itself.

## Before you call it done

- Installed, worked, uninstalled, reinstalled.
- Tested on a printer that is not the one you developed against, if you can reach one.
- Tested after a printer reboot: does your service come back?
- Read your own store page as though you had never seen the plugin.

Then go to [publishing-a-plugin.md](publishing-a-plugin.md).
