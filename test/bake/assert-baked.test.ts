import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertBaked, bakedGaps } from '../../src/core/bake/assert-baked.js'
import { runPipeline } from '../../src/core/index.js'
import type { JsonObject } from '../../src/core/types.js'
import type { PluginSource } from '../../src/core/build/plugin-source.js'

// The refuse-to-pack gate (R2) inspects the filesystem only: a fixture dir carrying (or missing) the
// outputs a manifest declares exercises every class without network / docker / pip. A source with the
// baked outputs present has no gap; the same source without them is refused.
function fixture(manifest: JsonObject, bakedFiles: Record<string, string> = {}): PluginSource {
  const dir = mkdtempSync(join(tmpdir(), 'b3-gate-'))
  Object.entries(bakedFiles).forEach(([relativePath, content]) => {
    const target = join(dir, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
  return { name: String(manifest.name ?? 'demo'), dir, manifest }
}

const GO_STEP = { class: 'go', source: 'https://example.invalid/x.git', commit: 'abc', output: 'files/bin/exporter' }
const DOWNLOAD_STEP = { class: 'download', fetch: [{ url: 'file:///x.tgz', sha256: 'deadbeef', archive: 'tar.gz', members: [{ path: 'ts', dest: 'files/bin/tailscaled', mode: '0755' }] }] }
const DOCKER_C_STEP = { class: 'docker-c', dockerfile: 'Dockerfile', members: [{ path: 'libcam.so', dest: 'files/camera/libcam.so' }, { path: 'camd', dest: 'files/camera/camd' }] }
const DOCKER_KO_STEP = { class: 'docker-ko', dockerfile: 'Dockerfile', module: 'tun.ko', kernel: { release: '6.1.0', vermagic: '6.1.0 SMP mod_unload aarch64' }, variant_dest: 'files/modules/6.1.0/tun.ko' }

describe('assertBaked: class 1 (binary-only)', () => {
  it('a plugin with no Python deps and no bake step declares nothing, so it packs clean', () => {
    const source = fixture({ name: 'idle-timeout', version: '0.1.0', install: { place: [{ src: 'files/idle.cfg' }] } }, { 'files/idle.cfg': '[idle_timeout]\n' })
    expect(bakedGaps(source)).toEqual([])
    expect(() => assertBaked(source)).not.toThrow()
  })
})

describe('assertBaked: class 2 (Python deps, presence-driven)', () => {
  it('refuses a requirements.txt plugin with an empty files/wheels', () => {
    const source = fixture({ name: 'status-feed', version: '0.1.0' }, { 'requirements.txt': 'humanize\n' })
    expect(bakedGaps(source)).toHaveLength(1)
    expect(() => assertBaked(source)).toThrow(/status-feed/)
  })

  it('passes a requirements.txt plugin whose files/wheels is baked', () => {
    const source = fixture({ name: 'status-feed', version: '0.1.0' }, { 'requirements.txt': 'humanize\n', 'files/wheels/humanize-4.0-py3-none-any.whl': 'wheel' })
    expect(bakedGaps(source)).toEqual([])
  })

  it('refuses a klipper_requirements.txt plugin with an empty files/site-packages', () => {
    const source = fixture({ name: 'moonraker-notify', version: '0.1.0' }, { 'klipper_requirements.txt': 'apprise\n' })
    expect(() => assertBaked(source)).toThrow(/site-packages/)
  })

  it('passes a klipper_requirements.txt plugin whose files/site-packages is baked', () => {
    const source = fixture({ name: 'moonraker-notify', version: '0.1.0' }, { 'klipper_requirements.txt': 'apprise\n', 'files/site-packages/apprise/__init__.py': 'x = 1\n' })
    expect(bakedGaps(source)).toEqual([])
  })
})

describe('assertBaked: class 3 (go binary)', () => {
  it('refuses a go plugin whose declared output is missing', () => {
    const source = fixture({ name: 'prometheus-exporter', version: '0.1.0', bake: [GO_STEP] })
    expect(() => assertBaked(source)).toThrow(/files\/bin\/exporter/)
  })

  it('passes a go plugin whose output is baked', () => {
    const source = fixture({ name: 'prometheus-exporter', version: '0.1.0', bake: [GO_STEP] }, { 'files/bin/exporter': 'ELF' })
    expect(bakedGaps(source)).toEqual([])
  })
})

describe('assertBaked: class 4 (sha-pinned download)', () => {
  it('refuses a download plugin whose fetched member is missing', () => {
    const source = fixture({ name: 'tailscale', version: '0.1.0', bake: [DOWNLOAD_STEP] })
    expect(() => assertBaked(source)).toThrow(/files\/bin\/tailscaled/)
  })

  it('passes a download plugin whose members are staged', () => {
    const source = fixture({ name: 'tailscale', version: '0.1.0', bake: [DOWNLOAD_STEP] }, { 'files/bin/tailscaled': 'binary' })
    expect(bakedGaps(source)).toEqual([])
  })
})

describe('assertBaked: class 5 (docker C binary)', () => {
  it('refuses a docker-c plugin missing any declared member', () => {
    const source = fixture({ name: 'u1-hw-camera', version: '0.1.0', bake: [DOCKER_C_STEP] }, { 'files/camera/libcam.so': 'so' })
    expect(bakedGaps(source)).toEqual([expect.stringContaining('files/camera/camd')])
  })

  it('passes a docker-c plugin with every declared member staged', () => {
    const source = fixture({ name: 'u1-hw-camera', version: '0.1.0', bake: [DOCKER_C_STEP] }, { 'files/camera/libcam.so': 'so', 'files/camera/camd': 'bin' })
    expect(bakedGaps(source)).toEqual([])
  })
})

describe('assertBaked: class 6 (docker kernel module, per vermagic variant)', () => {
  it('refuses a docker-ko plugin whose variant .ko is missing', () => {
    const source = fixture({ name: 'tun-module', version: '0.1.0', bake: [DOCKER_KO_STEP] })
    expect(() => assertBaked(source)).toThrow(/tun\.ko/)
  })

  it('passes a docker-ko plugin whose variant .ko is baked', () => {
    const source = fixture({ name: 'tun-module', version: '0.1.0', bake: [DOCKER_KO_STEP] }, { 'files/modules/6.1.0/tun.ko': 'ko' })
    expect(bakedGaps(source)).toEqual([])
  })

  it('names the one missing variant when a sibling variant is already baked', () => {
    const otherVariant = { ...DOCKER_KO_STEP, kernel: { release: '6.6.0', vermagic: '6.6.0 SMP mod_unload aarch64' }, variant_dest: 'files/modules/6.6.0/tun.ko' }
    const source = fixture({ name: 'tun-module', version: '0.1.0', bake: [DOCKER_KO_STEP, otherVariant] }, { 'files/modules/6.1.0/tun.ko': 'ko' })
    expect(bakedGaps(source)).toEqual([expect.stringContaining('files/modules/6.6.0/tun.ko')])
  })
})

describe('gate as a pipeline step (post-pack, build-failing)', () => {
  it('a single-plugin pipeline rejects an unbaked Python plugin', async () => {
    const source = fixture({ name: 'status-feed', version: '0.1.0' }, { 'requirements.txt': 'humanize\n' })
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-out-'))
    await expect(runPipeline({ unit: 'plugin', sourceDir: source.dir, outputDir, identity: { atomRepo: 'demo-org/demo' } })).rejects.toThrow(/status-feed/)
  })

  it('a single-plugin pipeline packs a baked Python plugin through the gate', async () => {
    const source = fixture({ name: 'status-feed', version: '0.1.0' }, { 'requirements.txt': 'humanize\n', 'files/wheels/humanize-4.0-py3-none-any.whl': 'wheel' })
    const outputDir = mkdtempSync(join(tmpdir(), 'b3-out-'))
    const artifacts = await runPipeline({ unit: 'plugin', sourceDir: source.dir, outputDir, identity: { atomRepo: 'demo-org/demo' } })
    expect(artifacts.packages).toHaveLength(1)
  })
})
