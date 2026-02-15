import path from 'path'
import url from 'url'
import assert from 'assert'
import MarkdownIt from 'markdown-it'
import mditAttrs from 'markdown-it-attrs'
import mditCJKBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'
import mditSemanticContainer from '@peaceroad/markdown-it-hr-sandwiched-semantic-container'
import mditSub from 'markdown-it-sub'
import mditSup from 'markdown-it-sup'
import mditStrongJa from '../index.js'
import { readMarkdownHtmlCases } from './fixture-runner.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')
const fixture = (name) => `${__dirname}/${name}`

const SUITES = [
  {
    label: 'attrs+semantic',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }).use(mditAttrs).use(mditSemanticContainer),
    mdBaseline: new MarkdownIt().use(mditAttrs).use(mditSemanticContainer),
    files: ['p-attrs--o-japaneseonly-strong.txt', 'p-attrs--o-japaneseonly-em.txt', 'p-attrs--o-japaneseonly-complex.txt', 'p-attrs--o-aggressive-leading.txt', 'p-attrs--o-compatible-leading.txt']
  },
  {
    label: 'attrs+cjk(either=true)',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }).use(mditAttrs).use(mditCJKBreaks, { either: true }),
    mdBaseline: new MarkdownIt().use(mditAttrs).use(mditCJKBreaks, { either: true }),
    files: ['p-breaks-attrs--o-japaneseonly-cjkeithertrue-with-linebreak.txt', 'p-breaks-attrs--o-japaneseonly-cjkeithertrue-spacehalf.txt', 'p-breaks-attrs--o-japaneseonly-cjkeithertrue-spacehalf-normalizesoftbreaks.txt', 'p-breaks-attrs--o-japaneseonly-cjkeithertrue-crlf.txt'],
    normalizeExpectedEol: true
  },
  {
    label: 'attrs+cjk(either=false)',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }).use(mditAttrs).use(mditCJKBreaks),
    mdBaseline: new MarkdownIt().use(mditAttrs).use(mditCJKBreaks),
    files: ['p-breaks-attrs--o-japaneseonly-cjkeitherfalse.txt']
  },
  {
    label: 'attrs+semantic+sup/sub',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }).use(mditAttrs).use(mditSemanticContainer).use(mditSup).use(mditSub),
    mdBaseline: new MarkdownIt().use(mditAttrs).use(mditSemanticContainer).use(mditSup).use(mditSub),
    files: ['p-attrs--o-japaneseonly-sup-sub.txt']
  },
  {
    label: 'semantic only',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }).use(mditSemanticContainer),
    mdBaseline: new MarkdownIt().use(mditSemanticContainer),
    files: ['p-attrs-disabled--o-japaneseonly-default.txt']
  },
  {
    label: 'noattrs+semantic',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible', mditAttrs: false }).use(mditSemanticContainer),
    mdBaseline: new MarkdownIt().use(mditSemanticContainer),
    files: ['mditNoAttrs/p-noattrs--o-japaneseonly-strong.txt', 'mditNoAttrs/p-noattrs--o-japaneseonly-em.txt', 'mditNoAttrs/p-noattrs--o-japaneseonly-complex.txt']
  },
  {
    label: 'breaks=true',
    mdCompatible: new MarkdownIt({ breaks: true }).use(mditStrongJa, { mode: 'compatible', mditAttrs: false }),
    mdBaseline: new MarkdownIt({ breaks: true }),
    files: ['mditNoAttrs/p-noattrs--o-japaneseonly-breaks-true-linebreaks.txt']
  },
  {
    label: 'noattrs+cjk',
    mdCompatible: new MarkdownIt().use(mditStrongJa, { mode: 'compatible', mditAttrs: false }).use(mditCJKBreaks, { either: true }),
    mdBaseline: new MarkdownIt().use(mditCJKBreaks, { either: true }),
    files: ['mditNoAttrs/p-breaks-noattrs--o-japaneseonly-cjkeithertrue-with-linebreak.txt', 'mditNoAttrs/p-breaks-noattrs--o-japaneseonly-cjkeithertrue-spacehalf-normalizesoftbreaks.txt']
  }
]

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [compatible parity, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

export const runCompatibleParityTests = () => {
  const allPassRef = { value: true }
  for (let s = 0; s < SUITES.length; s++) {
    const suite = SUITES[s]
    for (let f = 0; f < suite.files.length; f++) {
      const file = suite.files[f]
      const cases = readMarkdownHtmlCases(fixture(file), {
        normalizeExpectedEol: !!suite.normalizeExpectedEol
      })
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i]
        runCase(`${suite.label} / ${file} #${i + 1}`, () => {
          const compatible = suite.mdCompatible.render(c.markdown)
          const baseline = suite.mdBaseline.render(c.markdown)
          assert.strictEqual(compatible, baseline)
        }, allPassRef)
      }
    }
  }
  return allPassRef.value
}

