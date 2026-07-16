// The declarative bake field's typed shape (R1). A plugin whose payload is a build output declares HOW
// to build it in its manifest, so the tool runs the right baker instead of the plugin hand-rolling a
// build.sh. The field is a list (a plugin may bake more than one artifact), each entry a discriminated
// union keyed on `class`, covering the four compiled / fetched classes: go, download, docker-c, docker-ko.
//
// Class 2 (Python deps) is deliberately NOT a bake entry: ADR-0036 fixes its declaration as a plain
// requirements FILE at the plugin root, never a manifest field. The dispatcher runs the pip baker off
// that file's presence (see python-deps.ts), so class 2 keeps its established contract while the four
// classes here are declaration-driven. The parse from opaque manifest JSON lives in manifest-bake.ts.

// The archive shapes the download baker knows how to extract, matching the current sha-pinned samples:
// a Debian `.deb` (ar then its inner data.tar.xz), an xz tarball, and a gzip tarball (`.tgz` included).
export type ArchiveKind = 'deb' | 'tar.xz' | 'tar.gz'

// One member to lift out of a fetched archive and stage into the plugin's files/ tree.
export interface ArchiveMember {
  path: string
  dest: string
  mode: string
}

export interface DownloadFetch {
  url: string
  sha256: string
  archive: ArchiveKind
  members: ArchiveMember[]
}

// A local file copied into the payload alongside the fetched binaries (the zt-run / ts-run launcher
// wrappers the mesh-VPN plugins ship next to the upstream binary).
export interface IncludeFile {
  src: string
  dest: string
  mode: string
}

export interface GoBake {
  class: 'go'
  source: string
  commit: string
  package: string
  output: string
}

export interface DownloadBake {
  class: 'download'
  fetch: DownloadFetch[]
  include: IncludeFile[]
}

export interface DockerCBake {
  class: 'docker-c'
  dockerfile: string
  context: string
  platform: string
  out: string
  dest: string
  expect: string[]
}

// The kernel a `.ko` must load into, modeled as its OWN axis (release + vermagic), NOT an arch tuple:
// "target platform" for a kernel module is an exact kernel build, keyed at runtime on kernel_release /
// vermagic (ADR-0039). `vermagic` is the bake-time assertion; a match is necessary but NOT sufficient,
// so it never stands in for the on-device capability exercise (packet 7).
export interface KernelTarget {
  release: string
  vermagic: string
}

export interface DockerKoBake {
  class: 'docker-ko'
  dockerfile: string
  context: string
  module: string
  out: string
  kernel: KernelTarget
  variantDest: string
}

export type BakeStep = GoBake | DownloadBake | DockerCBake | DockerKoBake
