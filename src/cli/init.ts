// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { basename, join } from 'node:path'
import type { JsonObject } from '../core/index.js'

// `b3-builder init plugin` / `init list`: scaffold the one JSON document a publisher hand-authors (a
// plugin manifest, or a list reference for an index's lists[]), the way `npm init` scaffolds a
// package.json. Everything else (atoms, the assembled sub-list) the build pipeline generates, so it is
// never scaffolded here. An answer is gathered through an injected `ask`, so the whole flow is testable
// without a terminal: the real CLI backs `ask` with readline, a test backs it with a scripted map. Each
// field's KEY is its domain name and doubles as the prompt label; a blank answer takes the fallback.
export type Ask = (field: string, fallback: string) => Promise<string>

const DEFAULT_AUTHOR = 'bespoked'
const PLACEHOLDER_PUBLISHER = 'PLACEHOLDER'

export interface InitPlan {
  path: string
  document: JsonObject
}

export async function planInit(unit: string, cwd: string, ask: Ask, today: string): Promise<InitPlan> {
  if (unit === 'plugin') return planPlugin(cwd, ask, today)
  if (unit === 'list') return planList(cwd, ask)
  throw new Error(`unknown init unit "${unit}" (expected "plugin" or "list")`)
}

// A minimal but complete manifest: identity and catalog fields prompted (name defaults to the dir it is
// scaffolded in), the service graph left empty for the author to fill, and `publisher` a placeholder
// because a repo cannot know the key that will sign its release (a signed build stamps the real one).
// `sw_version` is written only when the plugin packages external software and the author names its
// upstream version.
async function planPlugin(cwd: string, ask: Ask, today: string): Promise<InitPlan> {
  const name = await ask('plugin id', basename(cwd))
  const title = await ask('title', titleCase(name))
  const version = await ask('version', '0.1.0')
  const swVersion = await ask('sw_version (upstream version packaged, blank if none)', '')
  const author = await ask('author', DEFAULT_AUTHOR)
  const description = await ask('description', '')
  const tagline = await ask('tagline', '')
  const category = await ask('category', 'utility')
  const channel = await ask('channel', 'stable')
  const printerSpecific = affirmative(await ask('printer_specific (y/N)', 'n'))
  const document: JsonObject = {
    name,
    title,
    version,
    ...(swVersion === '' ? {} : { sw_version: swVersion }),
    author,
    description,
    tagline,
    category,
    channel,
    printer_specific: printerSpecific,
    published_at: today,
    updated_at: today,
    publisher: PLACEHOLDER_PUBLISHER,
    provides: [],
    require: [],
    conflicts: [],
    requires: { capabilities: [], variables: [] },
  }
  return { path: join(cwd, 'manifest.json'), document }
}

// A list reference: the {name, url, author, publisher} entry an index's lists[] holds. `author` (display
// name) and `publisher` (signing-key fingerprint) are separate because the two may name different
// parties; `publisher` starts as a placeholder until the referenced list is signed.
async function planList(cwd: string, ask: Ask): Promise<InitPlan> {
  const name = await ask('list name', titleCase(basename(cwd)))
  const url = await ask('url (e.g. https://github.com/Owner/repo/releases/latest/download/index.json)', '')
  const author = await ask('author', DEFAULT_AUTHOR)
  const publisher = await ask('publisher (fingerprint, PLACEHOLDER until signed)', PLACEHOLDER_PUBLISHER)
  const document: JsonObject = { name, url, author, publisher }
  return { path: join(cwd, `${slug(name)}.json`), document }
}

function titleCase(value: string): string {
  return words(value).map(capitalize).join(' ')
}

function words(value: string): string[] {
  return value.split(/[-_\s]+/).filter((word) => word.length > 0)
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+)|(-+$)/g, '')
}

function affirmative(answer: string): boolean {
  return /^y(es)?$/i.test(answer.trim())
}
