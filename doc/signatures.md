# What the signature is for

Every `.b3` can carry a GPG signature. This page explains what it proves, what it does not prove, and
what a user sees because of it. The next page, [signing-a-plugin.md](signing-a-plugin.md), is the
how-to.

## The one-sentence version

A signature proves that the package a user is about to install is byte for byte the package you built,
and that it came from you and not from somebody wearing your name.

## What is actually signed

Your `.b3` contains a `manifest.json`, and that manifest contains a `files` list with a SHA-256 hash of
every single file in the package. The signature is a detached signature over the manifest.

That is a chain, and it is why signing one small file is enough:

```text
signature  ->  covers manifest.json
manifest   ->  contains a sha256 for every file
files      ->  are the whole payload
```

Change any file and its hash no longer matches the manifest. Change the manifest to fix the hash and
the signature no longer matches the manifest. There is no way to alter a signed package that leaves
both checks passing without the private key.

The signature file, `manifest.json.sig`, travels inside the same archive. The catalog that lists your
plugin is signed the same way, over the exact bytes a reader is served.

## What it proves, and what it does not

**It proves identity, and integrity.** The package came from the holder of that key, and nothing in it
was altered after they signed it.

**It does not prove the plugin is good.** A signature says nothing about whether the code works,
whether it is safe, or whether the author knows what they are doing. It is a name badge, not a
certificate of quality. Anyone can make a key.

That distinction matters because it decides what the signature is allowed to do to a user.

## The publisher is a key, not a name

Your manifest has two identity fields, and they do different jobs.

| Field | What it is | Trusted? |
| --- | --- | --- |
| `author` | A display name. `Jane`, `Fire-Devils`, whatever you like | No. It is shown, never checked |
| `publisher` | The fingerprint of the key that signed the package | Yes. It is what the signature is checked against |

Anyone can type any `author`. Nobody can produce a valid signature for a `publisher` fingerprint
without that key. So the name you read is decoration and the fingerprint is the fact.

**In your source repository, `publisher` is the literal string `PLACEHOLDER`, and it stays that way
forever.** Your repository cannot know which key will sign its release, and rotating a key should not
mean hand-editing every repo you own. The build fills in the real fingerprint from the signing key
just before it signs, so a package and the catalog entry offering it can never name two different
publishers.

One consequence worth knowing: a build with **no** signing key over a manifest that hand-declares a
real fingerprint is refused rather than packed. Declaring a publisher is a claim, and the signature is
its only proof. Shipping the claim without the proof would hand the reader an identity they can never
check, so the build stops.

## What the user sees

The store shows a trust label on every plugin, derived from the signature check:

| What happened | Label the user sees |
| --- | --- |
| Signed by a key the source is trusted for, at manufacturer level | Manufacturer |
| Signed by a key the source is trusted for, at project level | Bespok3d project |
| Signed by a known community key | Community verified |
| No signature at all | Unknown publisher / Signature not verified |
| A signature that did not match | **Signature did not match** |

## Unsigned installs, a broken signature does not

This asymmetry is the whole design, and it is on purpose:

- **No signature is not an error.** An unsigned package loads, shows as unverified, and installs. You
  can build a plugin, hand the `.b3` to a friend, and it works. Nobody needs permission from anybody
  to write a plugin for their own printer.
- **A signature that fails is a hard refusal.** The package does not install. Not a warning, not a
  "continue anyway" button.

The reasoning: absent proof is just absent proof, and it is shown honestly as such. A **failed** proof
is different in kind. It means something claimed an identity and could not back it, which is either
tampering or corruption, and neither of those is something to click past.

So signing never gates who is allowed to publish. It gates nothing at all. What it does is let a user
tell the difference between "I do not know who wrote this" and "this is from the person I already
trust", and that difference is worth a great deal once you have installed a few things.

## Why you should sign anyway

You are not required to. Here is what you get if you do:

- Your users can see that an update came from the same place the original did.
- A mirror, a proxy, or a compromised release asset cannot quietly modify your package.
- Your plugin can be listed in an index that others trust, because there is something to trust.

And what it costs: one key, generated once, stored as a repository secret. That is the whole thing.

## Keep your private key private

The signature is only as good as the key. Concretely:

- The private key lives in a repository secret and in your own keyring. Nowhere else.
- It never appears in a workflow file, a command line, or a log. The build reads it from the
  environment for exactly this reason.
- If it leaks, revoke it and publish under a new one. A key you are not sure about is not a key.

[signing-a-plugin.md](signing-a-plugin.md) walks through generating one and wiring it up.
