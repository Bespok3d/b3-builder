// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { consumerFixture, fixtureFile } from './consumer-rehearsal-fixtures.js'
import { consumerSource } from './consumer-source.js'

export interface WorkflowStep { id?: string; name?: string; uses?: string; if?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string> }
export interface EventValues { inputs: Record<string, unknown>; github: Record<string, unknown>; steps: Record<string, { outputs: Record<string, unknown> }> }
export function releaseSteps(repo: string): WorkflowStep[] {
  const document = parseDocument(consumerSource(`${repo}/.github/workflows/release.yml`).toString())
  if (document.errors.length) throw new Error(String(document.errors))
  return document.toJS().jobs['build-and-release'].steps as WorkflowStep[]
}
export function expression(value: unknown, values: EventValues): unknown {
  if (typeof value !== 'string' || !value.startsWith('${{')) return value
  const source = value.slice(3, -2).trim()
  if (source.includes('&&')) return source.split('&&').every((part) => Boolean(expression(`\${{ ${part.trim()} }}`, values)))
  const equality = /^(\S+) (==|!=) '([^']*)'$/.exec(source)
  if (equality) return equality[2] === '==' ? lookup(equality[1]!, values) === equality[3] : lookup(equality[1]!, values) !== equality[3]
  return lookup(source, values)
}
function lookup(path: string, values: EventValues): unknown {
  return path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], values) ?? ''
}
export function stepInputs(step: WorkflowStep, values: EventValues): Record<string, string> {
  return Object.fromEntries(Object.entries(step.with ?? {}).map(([name, value]) => [name, String(expression(value, values))]))
}
export function runs(step: WorkflowStep, values: EventValues): boolean { return step.if === undefined || Boolean(expression(step.if, values)) }
export function git(root: string, args: string[]): string { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim() }
export function consumerCheckout(repo: string, version = '1.0.0-pre'): { root: string; name: string; tag: string; commit: string; version: string } {
  const family = repo === 'daemon' ? 'daemon' : 'jinni'
  const fixture = repo.startsWith('plugins/') ? pluginCheckout(repo) : consumerFixture(family)
  const manifestPath = repo.startsWith('plugins/') ? `${fixture.name}/manifest.json` : { daemon: 'manifest.json', adapters: 'snapmaker-u1/jinni/manifest.json' }[repo]!
  const manifest = readFileSync(join(fixture.root, manifestPath), 'utf8').replaceAll('1.0.0-pre', version)
  writeFileSync(join(fixture.root, manifestPath), manifest)
  if (repo === 'daemon') writeFileSync(join(fixture.root, 'version.py'), readFileSync(join(fixture.root, 'version.py'), 'utf8').replaceAll('1.0.0-pre', version))
  git(fixture.root, ['init', '-q'])
  git(fixture.root, ['config', 'user.name', 'Fixture'])
  git(fixture.root, ['config', 'user.email', 'fixture@example.invalid'])
  git(fixture.root, ['add', '.'])
  git(fixture.root, ['commit', '-qm', 'candidate source'])
  const prefixes: Record<string, string> = { daemon: 'daemon', adapters: 'jinni-snapmaker-u1' }
  const prefix = prefixes[repo] ?? `plugin-${fixture.name}`
  return { root: fixture.root, name: fixture.name, tag: `${prefix}-v${version}`, version, commit: git(fixture.root, ['rev-parse', 'HEAD']) }
}
function pluginCheckout(repo: string): { root: string; name: string } {
  const root = mkdtempSync(join(tmpdir(), 'plugin-event-'))
  fixtureFile(root, 'selected/manifest.json', JSON.stringify({ name: 'selected', version: '1.0.0-pre', publisher: 'PLACEHOLDER' }))
  fixtureFile(root, 'selected/files/payload', 'selected source')
  fixtureFile(root, 'unrelated/manifest.json', JSON.stringify({ name: 'unrelated', version: '4.0.0', publisher: 'PLACEHOLDER' }))
  fixtureFile(root, 'unrelated/files/payload', 'unrelated source')
  fixtureFile(root, 'scripts/tag_version_guard.sh', consumerSource(`${repo}/scripts/tag_version_guard.sh`).toString())
  return { root, name: 'selected' }
}
export function eventEnvironment(repo: string, fixture: ReturnType<typeof consumerCheckout>, values: EventValues, ghPath?: string): NodeJS.ProcessEnv {
  const action = releaseSteps(repo).find((entry) => entry.id === 'release')!
  const push = values.github.event_name === 'push'
  const inputs = values.inputs
  const configured = { B3D_BUILDER_COMMIT: action.uses!.split('@')[1]!, B3D_REGISTER_COMMIT: String(action.with?.['register-commit']), B3D_MANIFEST_PATH: String(action.with?.['manifest-path'] ?? ''), B3D_TAG_PREFIX: String(action.with?.['tag-prefix'] ?? 'plugin-{unit}'), B3D_PROSPECTIVE_TAG: String(inputs['prospective-tag'] ?? ''), B3D_SELECTED_IDS: String(inputs['selected-ids'] ?? ''), B3D_EXPECTED_SOURCE: String(inputs['expected-source-sha'] ?? ''), B3D_RELEASE_KIND: String(inputs['release-kind'] ?? ''), B3D_PUBLISH: String(push || inputs.publish === true), B3D_PREPARED_RECEIPT: String(inputs['prepared-receipt'] ?? '') }
  return { ...process.env, ...configured, PATH: ghPath ? `${ghPath}:${process.env.PATH}` : process.env.PATH, GITHUB_EVENT_NAME: String(values.github.event_name), GITHUB_REF_TYPE: String(values.github.ref_type), GITHUB_REF_NAME: String(values.github.ref_name), GITHUB_REPOSITORY: String(values.github.repository), GITHUB_SHA: fixture.commit, GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: join(fixture.root, 'github-output') }
}

export function contextCli(root: string, operation: string, env: NodeJS.ProcessEnv): Record<string, string> {
  writeFileSync(env.GITHUB_OUTPUT!, '')
  execFileSync(process.execPath, [resolve(import.meta.dirname, '../../dist/action/release-context-main.js'), operation], { cwd: root, env, stdio: 'pipe' })
  return Object.fromEntries(readFileSync(env.GITHUB_OUTPUT!, 'utf8').trim().split('\n').filter(Boolean).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
}
export function mockGithub(metadata: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'prepared-gh-'))
  writeFileSync(join(root, 'responses.json'), JSON.stringify(metadata))
  writeFileSync(join(root, 'gh'), `#!${process.execPath}\nconst fs=require('node:fs'); const path=require('node:path'); const root=path.dirname(process.argv[1]); const responses=JSON.parse(fs.readFileSync(path.join(root,'responses.json'))); const endpoint=process.argv[3]; fs.appendFileSync(path.join(root,'calls'),endpoint+'\\n'); if(!responses[endpoint])process.exit(1);process.stdout.write(JSON.stringify(responses[endpoint]));\n`)
  chmodSync(join(root, 'gh'), 0o755)
  return root
}
