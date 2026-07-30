// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonObject } from '../types.js'
import { DEP_DECLARATION_NAMES, walkPackedFiles } from './file-tree.js'
import { asString } from './json.js'

// A plugin dir with nothing under files/ and no Python dep declaration packs into a .b3 that carries a
// manifest and, at most, a README: installing it places nothing on the printer, so the release is empty in
// the only sense that matters to an owner who installs it. Two such releases were published before this
// refusal existed, which is what asks for it here rather than at a caller: every packing path (the
// pipeline's pack step, a skip-unchanged rebuild, the app's bundle glue) funnels through packPlugin, so
// refusing there is the one placement no caller can forget.
//
// doc/ is NOT payload. It is prose that reaches no printer behaviour, exactly as the equivalence rail
// treats it, so a dir holding only doc/ is still an empty package.
//
// A kind:collection source has no payload BY DESIGN (it is install-orchestration metadata that reaches a
// device only through the index) and is filtered out before packing by every caller, so it never arrives
// here and needs no exemption of its own.
export function refuseEmptyPayload(manifest: JsonObject, pluginDir: string): void {
  if (hasInstallablePayload(pluginDir)) return

  throw new Error(
    `${asString(manifest.name)}: the plugin dir holds no payload (nothing under files/ and no ` +
      'requirements.txt or klipper_requirements.txt), so the packaged .b3 would install nothing on a ' +
      'printer. Bake or add the payload before packing, or declare the source kind:collection if it is ' +
      'install-orchestration metadata rather than an installable artifact.',
  )
}

function hasInstallablePayload(pluginDir: string): boolean {
  const payload = walkPackedFiles(join(pluginDir, 'files'))
  if (payload.length > 0) return true
  return DEP_DECLARATION_NAMES.some((depName) => existsSync(join(pluginDir, depName)))
}
