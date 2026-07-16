import { chmodSync, copyFileSync, cpSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Stage a produced file into the plugin payload at destAbs with an octal mode string (e.g. "0755"),
// creating its parent dir: the one place every baker installs an output file, so mode handling and
// parent creation are not re-hand-rolled per class. Mirrors the legacy `install -m <mode> <src> <dest>`.
export function stageFile(srcAbs: string, destAbs: string, mode: string): void {
  mkdirSync(dirname(destAbs), { recursive: true })
  copyFileSync(srcAbs, destAbs)
  chmodSync(destAbs, Number.parseInt(mode, 8))
}

// Copy a produced directory tree into the payload (the extracted image /out of a docker bake), merging
// into an existing dest.
export function stageTree(srcDir: string, destDir: string): void {
  cpSync(srcDir, destDir, { recursive: true })
}
