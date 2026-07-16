import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../../src/core/index.js'
import { bakePlugin } from '../../src/core/bake/dispatch.js'
import { sha256OfFile } from '../../src/core/build/file-tree.js'
import { sourceFromDir } from '../../src/core/build/plugin-source.js'
import { fakeRunner } from './fake-runner.js'

// A fake plugin dir whose only bake step is a class-4 download of a local fixture tarball, so the bake
// runs for REAL (curl file:// + tar) without network, exercising the pipeline's opt-in bake end to end.
function pluginWithDownloadBake(): string {
  const dir = mkdtempSync(join(tmpdir(), 'b3-dispatch-'))
  mkdirSync(join(dir, 'files'), { recursive: true })
  const content = mkdtempSync(join(tmpdir(), 'b3-dispatch-fixture-'))
  writeFileSync(join(content, 'demo-binary'), 'fixture\n')
  const tarball = join(content, 'demo.tgz')
  spawnSync('tar', ['-czf', tarball, '-C', content, 'demo-binary'])
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      name: 'demo-plugin',
      version: '0.0.1',
      bake: [
        {
          class: 'download',
          fetch: [{ url: `file://${tarball}`, sha256: sha256OfFile(tarball), archive: 'tar.gz', members: [{ path: 'demo-binary', dest: 'files/bin/demo', mode: '0755' }] }],
        },
      ],
    }),
  )
  return dir
}

describe('bake as a pipeline step (opt-in)', () => {
  it('does NOT bake when bake is off, so an already-baked tree packs untouched', async () => {
    const sourceDir = pluginWithDownloadBake()
    // Bake-off is only ever run over an already-baked tree, so stage the declared payload first. The
    // download baker would overwrite it with the tarball's own bytes, so an unchanged sentinel proves the
    // baker never ran and the class-aware gate passed on the pre-baked output.
    mkdirSync(join(sourceDir, 'files/bin'), { recursive: true })
    writeFileSync(join(sourceDir, 'files/bin/demo'), 'already-baked')
    await runPipeline({ unit: 'plugin', sourceDir, outputDir: mkdtempSync(join(tmpdir(), 'b3-out-')), identity: { atomRepo: 'demo-org/demo' } })
    expect(readFileSync(join(sourceDir, 'files/bin/demo'), 'utf8')).toBe('already-baked')
  })

  it('bakes each declared step when bake is on', async () => {
    const sourceDir = pluginWithDownloadBake()
    await runPipeline({ unit: 'plugin', sourceDir, outputDir: mkdtempSync(join(tmpdir(), 'b3-out-')), identity: { atomRepo: 'demo-org/demo' }, bake: true })
    expect(existsSync(join(sourceDir, 'files/bin/demo'))).toBe(true)
  })
})

describe('bakePlugin dispatch', () => {
  it('runs the presence-driven python bake AND the declared bake steps together', () => {
    const dir = mkdtempSync(join(tmpdir(), 'b3-both-'))
    writeFileSync(join(dir, 'requirements.txt'), 'humanize\n')
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        name: 'demo-plugin',
        version: '0.0.1',
        bake: [{ class: 'go', source: 'https://example.invalid/x.git', commit: 'abc', output: 'files/bin/x' }],
      }),
    )
    const { calls, runner } = fakeRunner()

    bakePlugin(sourceFromDir(dir), runner)

    expect(calls.some((call) => call.args.includes('pip'))).toBe(true)
    expect(calls.some((call) => call.command === 'go')).toBe(true)
  })
})
