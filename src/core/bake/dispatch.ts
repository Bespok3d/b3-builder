import type { CommandRunner } from './runner.js'
import { spawnRunner } from './runner.js'
import type { PluginSource } from '../build/plugin-source.js'
import { parseBakeSteps } from './manifest-bake.js'
import type { BakeStep } from './manifest-bake.js'
import { bakePythonDeps } from './python-deps.js'
import { bakeGo } from './go.js'
import { bakeDownload } from './download.js'
import { bakeDockerC } from './docker-c.js'
import { bakeDockerKo } from './docker-ko.js'

// The one bake dispatcher (R1): run every baker a plugin source needs, so a plugin's payload is produced
// the same way regardless of which repo it lives in. Two declaration sources, one dispatcher: the
// presence-driven Python bake (ADR-0036 fixes it as a requirements FILE) plus each declared bake step in
// the manifest's `bake` field (go / download / docker-c / docker-ko). The runner is injectable so a unit
// test proves each baker's command without executing docker / pip / go in the gate.
export function bakePlugin(source: PluginSource, runner: CommandRunner = spawnRunner): void {
  bakePythonDeps(source.dir, runner)
  parseBakeSteps(source.manifest).forEach((step) => runBakeStep(step, source.dir, runner))
}

function runBakeStep(step: BakeStep, pluginDir: string, runner: CommandRunner): void {
  switch (step.class) {
    case 'go':
      return bakeGo(step, pluginDir, runner)
    case 'download':
      return bakeDownload(step, pluginDir, runner)
    case 'docker-c':
      return bakeDockerC(step, pluginDir, runner)
    case 'docker-ko':
      return bakeDockerKo(step, pluginDir, runner)
  }
}
