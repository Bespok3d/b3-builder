import type { BuildKind, BundleChannel } from './types.js'

// The core owns what a valid BuildRequest is, so both faces (the CLI and the GitHub Action) coerce
// their raw string inputs through here rather than each casting on its own. The default is the
// publisher-facing case, a co-repo build (the same default action.yml declares); a monorepo bundle is
// the internal Bespok3d build and is asked for explicitly. An unrecognized channel falls back to
// release. A bad value becomes a safe default, never a broken build.
export function coerceKind(rawKind: string | undefined): BuildKind {
  return rawKind === 'monorepo-bundle' ? 'monorepo-bundle' : 'co-repo'
}

export function coerceChannel(rawChannel: string | undefined): BundleChannel {
  return rawChannel === 'dev' ? 'dev' : 'release'
}
