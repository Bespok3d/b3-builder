import type { PluginSource } from './plugin-source.js'

// A manifest's `publisher` is a CLAIM, and the detached signature packed beside it is the only proof of
// that claim. A source repo cannot know which key will sign its release, so it checks in a placeholder and
// a signed build stamps the real signer's fingerprint over it. A build with NO key stamps nothing and
// signs nothing, so a manifest that hand-declares a fingerprint would ship that name inside the .b3 with
// nothing behind it: a reader who checks the named key finds no signature to check and can only rate the
// package unknown, while the entry offering it says it is that publisher's. This is the same hole
// action/prove-published-list.ts closes for a published list, closed here at the package.

const KEY_FINGERPRINT = /^[0-9a-f]{40}$/i

// Only a fingerprint is a claim. The placeholder a source repo checks in promises nothing to prove.
export function namesAPublisher(publisher: unknown): publisher is string {
  return typeof publisher === 'string' && KEY_FINGERPRINT.test(publisher)
}

export function refuseUnprovenPublisherClaims(sources: PluginSource[], signingKey: string | undefined): void {
  if (signingKey !== undefined) return
  const claiming = sources.filter((source) => namesAPublisher(source.manifest.publisher))
  if (claiming.length === 0) return

  throw new Error(
    `${claiming.map((source) => source.name).join(', ')}: the manifest names a key fingerprint as its publisher ` +
      'and this build holds no signing key, so the package would ship that name with no signature behind it. ' +
      'Give the build the signing key, or check in "PLACEHOLDER" as the publisher and let the signed build stamp it.',
  )
}
