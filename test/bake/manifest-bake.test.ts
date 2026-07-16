import { describe, expect, it } from 'vitest'
import { parseBakeSteps } from '../../src/core/bake/manifest-bake.js'
import type { DockerKoBake, DownloadBake, GoBake } from '../../src/core/bake/manifest-bake.js'

// The declarative bake field parse: a manifest with no `bake` yields no steps (so an ordinary plugin is
// untouched), each class parses into its typed shape with defaults, and a bad declaration fails loudly
// rather than silently skip a build.
describe('parseBakeSteps', () => {
  it('a manifest with no bake field yields no steps', () => {
    expect(parseBakeSteps({ name: 'demo-plugin', version: '0.0.1' })).toEqual([])
  })

  it('parses a go step with a default package', () => {
    const [step] = parseBakeSteps({
      bake: [{ class: 'go', source: 'https://example.invalid/repo.git', commit: 'abc123', output: 'files/bin/tool' }],
    })
    expect(step).toEqual({
      class: 'go',
      source: 'https://example.invalid/repo.git',
      commit: 'abc123',
      package: '.',
      output: 'files/bin/tool',
    } satisfies GoBake)
  })

  it('parses a download step with fetch members and includes', () => {
    const [step] = parseBakeSteps({
      bake: [
        {
          class: 'download',
          fetch: [{ url: 'https://example.invalid/x.tgz', sha256: 'deadbeef', archive: 'tar.gz', members: [{ path: 'x', dest: 'files/bin/x', mode: '0755' }] }],
          include: [{ src: 'src/run', dest: 'files/bin/run', mode: '0755' }],
        },
      ],
    })
    expect((step as DownloadBake).fetch[0]?.members[0]?.dest).toBe('files/bin/x')
    expect((step as DownloadBake).include[0]?.src).toBe('src/run')
  })

  it('parses a docker-ko step carrying the kernel axis distinctly (release + vermagic, not an arch tuple)', () => {
    const [step] = parseBakeSteps({
      bake: [
        {
          class: 'docker-ko',
          dockerfile: 'toolchain/Dockerfile',
          context: 'toolchain',
          module: 'tun.ko',
          kernel: { release: '6.1.99', vermagic: '6.1.99 SMP preempt mod_unload aarch64' },
          variant_dest: 'files/modules/tun-6.1.99.ko',
        },
      ],
    })
    expect((step as DockerKoBake).kernel).toEqual({ release: '6.1.99', vermagic: '6.1.99 SMP preempt mod_unload aarch64' })
  })

  it('rejects an unknown bake class', () => {
    expect(() => parseBakeSteps({ bake: [{ class: 'rust' }] })).toThrow(/unknown bake class "rust"/)
  })

  it('rejects a step missing a required field', () => {
    expect(() => parseBakeSteps({ bake: [{ class: 'go', source: 'x' }] })).toThrow(/missing required "commit"/)
  })
})
