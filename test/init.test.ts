import { describe, expect, it } from 'vitest'
import type { Ask } from '../src/cli/init.js'
import { planInit } from '../src/cli/init.js'

function scriptedAsk(answers: Record<string, string>): Ask {
  return async function ask(field, fallback) {
    const scripted = answers[field]
    return scripted === undefined ? fallback : scripted
  }
}

const acceptDefaults = scriptedAsk({})

describe('init plugin', () => {
  it('infers the plugin id from the directory and fills the identity defaults', async () => {
    const plan = await planInit('plugin', '/repo/fluidd', acceptDefaults, '2026-07-23')
    expect(plan.path).toBe('/repo/fluidd/manifest.json')
    expect(plan.document).toMatchObject({
      name: 'fluidd',
      title: 'Fluidd',
      version: '0.1.0',
      author: 'bespoked',
      channel: 'stable',
      printer_specific: false,
      published_at: '2026-07-23',
      updated_at: '2026-07-23',
      publisher: 'PLACEHOLDER',
    })
    expect('sw_version' in plan.document).toBe(false)
  })

  it('writes sw_version only when a packaged upstream version is given', async () => {
    const plan = await planInit(
      'plugin',
      '/repo/fluidd',
      scriptedAsk({ 'sw_version (upstream version packaged, blank if none)': '1.37.2', 'printer_specific (y/N)': 'y' }),
      '2026-07-23',
    )
    expect(plan.document.sw_version).toBe('1.37.2')
    expect(plan.document.printer_specific).toBe(true)
  })
})

describe('init list', () => {
  it('scaffolds a list reference with a slugged filename and separate author and publisher', async () => {
    const plan = await planInit(
      'list',
      '/repo/u1-extras',
      scriptedAsk({ 'url (e.g. github:Owner/repo/index.json)': 'github:Bespok3d/u1-extras/index.json' }),
      '2026-07-23',
    )
    expect(plan.path).toBe('/repo/u1-extras/u1-extras.json')
    expect(plan.document).toEqual({
      name: 'U1 Extras',
      url: 'github:Bespok3d/u1-extras/index.json',
      author: 'bespoked',
      publisher: 'PLACEHOLDER',
    })
  })
})

describe('init with an unknown unit', () => {
  it('rejects anything but plugin or list', async () => {
    await expect(planInit('widget', '/repo/x', acceptDefaults, '2026-07-23')).rejects.toThrow(/plugin.*list/)
  })
})
