# Signing, step by step

From nothing to a correctly signed plugin. Fifteen minutes, once, and then it is automatic forever.

If you want to know what a signature actually proves before you make one, read
[signatures.md](signatures.md) first.

You need GPG installed. On macOS, `brew install gnupg`. On Debian or Ubuntu, `apt install gnupg`.

## 1. Make a key

```sh
gpg --full-generate-key
```

Answer:

| Question | Answer |
| --- | --- |
| Kind of key | `(9) ECC (sign and encrypt)`, then `(1) Curve 25519`. Or `(1) RSA and RSA` with size `4096` if you prefer something older and more widely supported |
| Expiry | `2y` is sensible. You can extend it later; a key that never expires is a key you can never let go of |
| Real name | The name you want users to associate with your plugins |
| Email | An address you will still read in two years |
| Passphrase | Yes, use one. It protects the key on your own disk |

## 2. Find the fingerprint

```sh
gpg --list-secret-keys --keyid-format=long
```

Look for the long hexadecimal line under `sec`. That is your fingerprint, forty characters, no
spaces:

```text
sec   ed25519/A1B2C3D4E5F60789 2026-08-11 [SC] [expires: 2028-08-11]
      679939555819FB5F6423DC68C4388E76BFA9B4E0
      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ this
uid   [ultimate] Jane Example <jane@example.com>
```

Write it down. You do **not** put it in your plugin's manifest: `publisher` stays `PLACEHOLDER` there
and the build stamps the real value. You need the fingerprint if you publish your own list of plugins,
where it goes in the `list-publisher` workflow input.

## 3. Export the private key

```sh
gpg --armor --export-secret-keys A1B2C3D4E5F60789 > signing-key.asc
```

The file starts with `-----BEGIN PGP PRIVATE KEY BLOCK-----`. That is the whole secret. Treat the file
as you would treat a password: do not commit it, do not email it, delete it once step 4 is done.

## 4. Put it in a repository secret

In your plugin repository on GitHub: **Settings**, **Secrets and variables**, **Actions**, **New
repository secret**.

- Name: `REGISTRY_SIGNING_KEY`
- Value: the entire contents of `signing-key.asc`, including both `BEGIN` and `END` lines

Then delete the local file:

```sh
rm signing-key.asc
```

Your key is still in your own GPG keyring; the exported copy was only a courier.

## 5. Tell the workflow to use it

In `.github/workflows/release.yml`:

```yaml
      - uses: Bespok3d/b3-builder@<commit-sha>
        with:
          unit: repo
          atom-repo: ${{ github.repository }}
          signing-key: ${{ secrets.REGISTRY_SIGNING_KEY }}
          bake: 'true'
```

That is the whole wiring. Every release from now on is signed.

## 6. Signing on your own machine

Two ways, and both exist because a key must never travel on a command line.

**From your GPG keyring**, using a key id or a file path:

```sh
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin --sign A1B2C3D4E5F60789
```

`--sign` takes a *reference*, not the key. b3-builder exports the secret key from your keyring, or
reads the file you point it at. If the reference resolves to no secret key, the build **fails**; it
never quietly falls back to producing an unsigned package.

**From the environment**, which is what CI does:

```sh
export B3D_SIGNING_KEY="$(gpg --armor --export-secret-keys A1B2C3D4E5F60789)"
npx b3-builder build --source ./my-plugin --out dist --atom-repo you/my-plugin
```

An explicit `--sign` wins over the environment.

There is no `--signing-key` flag and there will not be one. An armored key begins with a dash, which
the argument parser refuses outright, and anything on a command line is readable by every process on
the machine through `ps`.

## 7. Check that it worked

Three checks, in increasing strength.

**Is the signature in the package?**

```sh
unzip -l dist/my-plugin-0.1.0.b3 | grep manifest.json.sig
```

**Did the real fingerprint get stamped in?**

```sh
unzip -p dist/my-plugin-0.1.0.b3 manifest.json | jq -r .publisher
```

Expect your forty-character fingerprint. If it prints `PLACEHOLDER`, the build ran unsigned and you
are looking at the exact defect this check exists to catch. Do not publish it.

**Does the signature actually verify?**

```sh
cd "$(mktemp -d)" && unzip -o /path/to/dist/my-plugin-0.1.0.b3 manifest.json manifest.json.sig
gpg --verify manifest.json.sig manifest.json
```

Expect `Good signature from "Jane Example <jane@example.com>"`. A warning that the key is not
certified by a trusted signature is normal and expected; it means your local GPG has no web of trust
opinion about the key, not that the signature is bad.

## 8. Publish your fingerprint somewhere people can find it

A signature is only useful to someone who knows which fingerprint to expect. Put it in your plugin
repository's README, on your project page, wherever people will look. It is public information; that
is what a fingerprint is for.

## Rotating or losing a key

**Rotating on purpose** (an expiry approaching, a machine replaced): make the new key, replace the
repository secret, publish the new fingerprint alongside the old one for a while, and release. Nothing
in any manifest changes, because no manifest ever named the old key. This is exactly why `publisher`
stays `PLACEHOLDER` in your source.

**A key you think leaked**: revoke it with GPG, publish the revocation, generate a new one and
re-release. Do not keep publishing under a key you are not sure about; a signature you do not trust is
worse than no signature, because users trust it on your behalf.

**A key you lost entirely**: you cannot revoke it, so say so publicly, and publish under a new one.
This is why a revocation certificate generated on day one and stored somewhere separate is worth the
two minutes it takes.

## Common mistakes

| Symptom | Cause |
| --- | --- |
| `publisher` reads `PLACEHOLDER` in the built package | No key reached the build. Check the secret name and the workflow input |
| The build refuses, saying the manifest claims a publisher | You hand-wrote a real fingerprint into the manifest and built unsigned. Put `PLACEHOLDER` back |
| `--sign` fails saying no secret key | The key id is wrong, or the key is on a different machine |
| The signature verifies locally but the app refuses the install | The bytes served are not the bytes you signed. Re-check what your release actually uploaded |
