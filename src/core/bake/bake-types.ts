// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// The declarative bake field's typed shape (R1). A plugin whose payload is a build output declares HOW
// to build it in its manifest, so the tool runs the right baker instead of the plugin hand-rolling a
// build.sh. The field is a list (a plugin may bake more than one artifact), each entry a discriminated
// union keyed on `class`, covering the four compiled / fetched classes: go, download, docker-c, docker-ko.
//
// Class 2 (Python deps) is NOT a bake entry, by design: ADR-0036 fixes its declaration as a plain
// requirements FILE at the plugin root, never a manifest field. The dispatcher runs the pip baker off
// that file's presence (see python-deps.ts), so class 2 keeps its established contract while the four
// classes here are declaration-driven. The parse from opaque manifest JSON lives in manifest-bake.ts.

// The archive shapes the download baker knows how to extract, matching the current sha-pinned samples:
// a Debian `.deb` (ar then its inner data.tar.xz), an xz tarball, and a gzip tarball (`.tgz` included).
export type ArchiveKind = 'deb' | 'tar.xz' | 'tar.gz'

// One member to lift out of a baker's produced tree (a fetched archive, an extracted image /out) and
// stage into the plugin's files/ tree. Shared by the download and docker-c classes: both declare WHICH
// members of that tree are the payload, so neither ships whatever the producer happened to leave behind.
export interface PayloadMember {
  path: string
  dest: string
  mode: string
}

export interface DownloadFetch {
  url: string
  sha256: string
  archive: ArchiveKind
  members: PayloadMember[]
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

// `members` is the EXHAUSTIVE payload declaration, not a smoke test: the image's out dir must hold
// exactly these and nothing else, so a toolchain change that quietly enlarges or reshapes what installs
// on a printer fails the bake instead of shipping. Same contract the download class carries.
export interface DockerCBake {
  class: 'docker-c'
  dockerfile: string
  context: string
  platform: string
  out: string
  members: PayloadMember[]
}

// The kernel a `.ko` must load into, modeled as its OWN axis (release + vermagic), NOT an arch tuple:
// "target platform" for a kernel module is an exact kernel build, keyed at runtime on kernel_release /
// vermagic (ADR-0039). `vermagic` is the bake-time assertion; a match is necessary but NOT sufficient,
// so it never stands in for the on-device capability exercise (stage 7).
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
