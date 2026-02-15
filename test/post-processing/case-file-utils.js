import fs from 'fs'

const CASE_HEADER_RE = /^\[case\s+(.+)\]$/i
const SECTION_HEADER_RE = /^\[([a-z0-9_]+)\]$/i

const toSectionKey = (text) => {
  if (!text) return ''
  return String(text).trim().toLowerCase()
}

const trimMultilineTail = (text) => {
  if (!text) return ''
  return text.replace(/\n+$/, '')
}

export const parseCaseSections = (filePath, spec = {}) => {
  const {
    defaults = {},
    fieldMap = {},
    multilineFields = ['markdown'],
    transforms = {},
    isValid = () => true
  } = spec

  const multilineSet = new Set(multilineFields)
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const cases = []
  let current = null
  let section = ''

  const initCase = (name) => {
    return { name, ...defaults }
  }

  const pushCurrent = () => {
    if (!current) return

    const keys = Object.keys(current)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const value = current[key]
      if (typeof value !== 'string') continue
      current[key] = multilineSet.has(key)
        ? trimMultilineTail(value)
        : value.trim()
    }

    const transformKeys = Object.keys(transforms)
    for (let i = 0; i < transformKeys.length; i++) {
      const key = transformKeys[i]
      const transform = transforms[key]
      if (typeof transform !== 'function') continue
      current[key] = transform(current[key], current)
    }

    if (isValid(current)) {
      cases.push(current)
    }

    current = null
    section = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const caseMatch = line.match(CASE_HEADER_RE)
    if (caseMatch) {
      pushCurrent()
      current = initCase(caseMatch[1].trim())
      continue
    }
    if (!current) continue

    const sectionMatch = line.trim().match(SECTION_HEADER_RE)
    if (sectionMatch) {
      const rawKey = toSectionKey(sectionMatch[1])
      section = fieldMap[rawKey] || rawKey
      if (current[section] === undefined) {
        current[section] = multilineSet.has(section) ? '' : ''
      }
      continue
    }

    if (!section) continue
    if (multilineSet.has(section)) {
      current[section] += line + '\n'
      continue
    }

    const candidate = line.trim()
    if (!candidate) continue
    if (current[section] === '' || current[section] == null) {
      current[section] = candidate
    }
  }

  pushCurrent()
  return cases
}
