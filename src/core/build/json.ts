import type { JsonObject, JsonValue } from '../types.js'

// Thin accessors over the opaque manifest JSON (types.ts models it that way deliberately, so its
// schema is never re-declared here). Every plugin manifest field the build core reads goes through
// one of these narrowings instead of an unchecked cast at each call site.

export function asObject(value: JsonValue | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

export function asString(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asBool(value: JsonValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function asArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : []
}

export function fieldPresent(manifest: JsonObject, key: string): boolean {
  return manifest[key] !== undefined
}

export function copyIfPresent(target: JsonObject, source: JsonObject, keys: string[]): void {
  keys.forEach((key) => {
    if (fieldPresent(source, key)) target[key] = source[key] as JsonValue
  })
}

export function omitFields(source: JsonObject, keys: string[]): JsonObject {
  return Object.fromEntries(Object.entries(source).filter(([field]) => !keys.includes(field)))
}
