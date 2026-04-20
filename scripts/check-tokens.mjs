#!/usr/bin/env node
// Design-system guardrail: fails if the canonical accent gradient literal
// shows up anywhere under src/ except where it is legitimately defined
// (design-tokens.css). New code must reference var(--accent-gradient).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SRC = join(ROOT, 'src')

const CANONICAL_GRADIENT = 'linear-gradient(135deg, #9061f0 0%, #7c3aed 55%, #5b21b6 100%)'

// Only design-tokens.css is allowed to host the literal.
const ALLOW = new Set([join(SRC, 'design-tokens.css')])

const OFFENDERS = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(full)
      continue
    }
    if (!/\.(css|jsx?|tsx?|html)$/.test(name)) continue
    if (ALLOW.has(full)) continue
    const body = readFileSync(full, 'utf8')
    if (body.includes(CANONICAL_GRADIENT)) {
      OFFENDERS.push(relative(ROOT, full))
    }
  }
}

walk(SRC)

if (OFFENDERS.length) {
  console.error('\n[check-tokens] Hard-coded accent gradient found outside design-tokens.css:')
  for (const path of OFFENDERS) console.error(`  - ${path}`)
  console.error('\nReplace with: var(--accent-gradient)\n')
  process.exit(1)
}

console.log('[check-tokens] OK — no hard-coded accent gradients outside design-tokens.css.')
