// SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Thrown by a pipeline step whose real behavior a later Relay Stage still owns. It exists so the
// scaffold fails LOUDLY (never ships an empty or half-built .b3) and so the golden-equivalence
// harness stays honestly RED until the owning Stage lands, instead of a step silently returning
// nothing that reads as success.
export class NotPortedError extends Error {
  constructor(step: string, owner: string) {
    super(`b3-builder core step "${step}" is not yet ported (owner: ${owner}); the golden-equivalence harness stays red until it lands.`)
    this.name = 'NotPortedError'
  }
}

// Turn an unknown thrown value into a display string. Both faces report failures the same way, so the
// coercion lives once here rather than duplicated at each catch (and a third face, the app dev tools,
// reuses it too).
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
