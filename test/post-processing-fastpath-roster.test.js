import assert from 'assert'
import fs from 'fs'
import path from 'path'
import url from 'url'
import { parseCaseSections } from './post-processing/case-file-utils.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const CASE_FILE = path.join(__dirname, 'post-processing', 'fastpath-cases.txt')
const POSTPROCESS_FILE_CANDIDATES = [
  path.join(__dirname, '..', 'src', 'token-postprocess', 'fastpaths.js'),
  path.join(__dirname, '..', 'src', 'token-postprocess.js')
]

const extractBrokenRefFastPathNames = (source) => {
  const anchor = 'const BROKEN_REF_TOKEN_ONLY_FAST_PATHS = ['
  const anchorIdx = source.indexOf(anchor)
  assert.ok(anchorIdx !== -1, 'BROKEN_REF_TOKEN_ONLY_FAST_PATHS anchor not found')

  const openIdx = source.indexOf('[', anchorIdx)
  assert.ok(openIdx !== -1, 'BROKEN_REF_TOKEN_ONLY_FAST_PATHS opening bracket not found')

  let depth = 0
  let closeIdx = -1
  for (let i = openIdx; i < source.length; i++) {
    const ch = source.charCodeAt(i)
    if (ch === 0x5B) {
      depth++
      continue
    }
    if (ch !== 0x5D) continue
    depth--
    if (depth === 0) {
      closeIdx = i
      break
    }
  }
  assert.ok(closeIdx > openIdx, 'BROKEN_REF_TOKEN_ONLY_FAST_PATHS closing bracket not found')

  const body = source.slice(openIdx + 1, closeIdx)
  const names = []
  const nameRe = /name:\s*'([^']+)'/g
  let match
  while ((match = nameRe.exec(body)) !== null) {
    names.push(match[1])
  }
  return names
}

const extractFixtureBrokenRefKeys = () => {
  const cases = parseCaseSections(CASE_FILE, {
    defaults: { bucket: '', key: '' },
    multilineFields: ['markdown'],
    isValid: (c) => !!(c.name && c.bucket && c.key)
  })
  const out = new Set()
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    if (c.bucket !== 'brokenRefFastPaths') continue
    out.add(c.key)
  }
  return Array.from(out)
}

export const runPostprocessFastPathRosterTests = () => {
  let allPass = true
  const runCase = (name, fn) => {
    try {
      fn()
    } catch (err) {
      console.log(`Test [postprocess fastpath roster, ${name}] >>>`)
      console.log(err)
      allPass = false
    }
  }

  runCase('broken-ref fastpath roster is fixture-backed', () => {
    let source = ''
    for (let i = 0; i < POSTPROCESS_FILE_CANDIDATES.length; i++) {
      const file = POSTPROCESS_FILE_CANDIDATES[i]
      if (!fs.existsSync(file)) continue
      const next = fs.readFileSync(file, 'utf8')
      if (next.indexOf('const BROKEN_REF_TOKEN_ONLY_FAST_PATHS = [') !== -1) {
        source = next
        break
      }
    }
    assert.ok(source, 'BROKEN_REF_TOKEN_ONLY_FAST_PATHS source file not found')
    const sourceNames = extractBrokenRefFastPathNames(source)
    const uniqueSourceNames = Array.from(new Set(sourceNames))
    assert.strictEqual(
      uniqueSourceNames.length,
      sourceNames.length,
      'duplicate broken-ref fastpath names are not allowed'
    )

    const fixtureNames = extractFixtureBrokenRefKeys()
    const left = uniqueSourceNames.slice().sort()
    const right = fixtureNames.slice().sort()
    assert.deepStrictEqual(
      left,
      right,
      'broken-ref fastpath roster must match fixture-backed keys in fastpath-cases.txt'
    )
  })

  if (allPass) {
    console.log('Passed postprocess fast-path roster tests.')
  }
  return allPass
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (!runPostprocessFastPathRosterTests()) {
    process.exitCode = 1
  }
}
