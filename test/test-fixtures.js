import path from 'path'
import url from 'url'
import MarkdownIt from 'markdown-it'
import mditAttrs from 'markdown-it-attrs'
import mditCJKBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'
import mditSemanticContainer from '@peaceroad/markdown-it-hr-sandwiched-semantic-container'
import mditSub from 'markdown-it-sub'
import mditSup from 'markdown-it-sup'
import mditStrongJa from '../index.js'
import { runFixtureSuites } from './fixture-runner.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')
const fixture = (name) => `${__dirname}/${name}`

const md = new MarkdownIt().use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer)
const mdWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer)
const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' }).use(mditAttrs).use(mditSemanticContainer)
const mdPlusWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mode: 'japanese-boundary-guard' }).use(mditAttrs).use(mditSemanticContainer)

const mdWithCJKBreaks = new MarkdownIt().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, { either: true })
const mdWithCJKBreaksWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, { either: true })

const mdWithCJKBreaksSpaceHalf = new MarkdownIt().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, { spaceAfterPunctuation: 'half', either: true })
const mdWithCJKBreaksSpaceHalfWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, { spaceAfterPunctuation: 'half', either: true })

const mdWithCJKBreaksEitherFalse = new MarkdownIt().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks)
const mdWithCJKBreaksEitherFalseWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks)

const mdWithCJKBreaksNormalizeSoftBreaks = new MarkdownIt().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {
  spaceAfterPunctuation: 'half',
  normalizeSoftBreaks: true,
  either: true
})
const mdWithCJKBreaksNormalizeSoftBreaksWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {
  spaceAfterPunctuation: 'half',
  normalizeSoftBreaks: true,
  either: true
})

const mdWithCJKBreaksOnly = new MarkdownIt().use(mditCJKBreaks, { either: true })
const mdWithCJKBreaksOnlyHtml = new MarkdownIt({ html: true }).use(mditCJKBreaks, { either: true })

const mdLeadingAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' }).use(mditAttrs)
const mdLeadingAggressiveWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mode: 'aggressive' }).use(mditAttrs)

const mdLeadingCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' }).use(mditAttrs)
const mdLeadingCompatibleWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mode: 'compatible' }).use(mditAttrs)

const mdNoAttrsPlugin = new MarkdownIt().use(mditStrongJa).use(mditSemanticContainer)
const mdNoAttrsPluginWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditSemanticContainer)

const mdNoAttrs = new MarkdownIt().use(mditStrongJa, { mditAttrs: false }).use(mditSemanticContainer)
const mdNoAttrsWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mditAttrs: false }).use(mditSemanticContainer)
const mdNoAttrsPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard', mditAttrs: false }).use(mditSemanticContainer)
const mdNoAttrsPlusWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mode: 'japanese-boundary-guard', mditAttrs: false }).use(mditSemanticContainer)
const mdNoAttrsCJKBreaks = new MarkdownIt().use(mditStrongJa, { mditAttrs: false }).use(mditCJKBreaks, { either: true })
const mdNoAttrsCJKBreaksWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mditAttrs: false }).use(mditCJKBreaks, { either: true })

const mdNoAttrsLineBreak = new MarkdownIt({ breaks: true }).use(mditStrongJa, { mditAttrs: false })
const mdNoAttrsLineBreakWithHtml = new MarkdownIt({ html: true, breaks: true }).use(mditStrongJa, { mditAttrs: false })

const mdNoAttrsCJKBreaksNormalizeSoftBreaks = new MarkdownIt().use(mditStrongJa, { mditAttrs: false }).use(mditCJKBreaks, {
  normalizeSoftBreaks: true,
  either: true
})
const mdNoAttrsCJKBreaksNormalizeSoftBreaksWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa, { mditAttrs: false }).use(mditCJKBreaks, {
  normalizeSoftBreaks: true,
  either: true
})

const mdSupSub = new MarkdownIt().use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer).use(mditSup).use(mditSub)
const mdSupSubWithHtml = new MarkdownIt({ html: true }).use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer).use(mditSup).use(mditSub)

const suites = [
  { label: 'attrs mode=japanese default / strong', filePath: fixture('p-attrs--o-japaneseonly-strong.txt'), mdPlain: md, mdHtml: mdWithHtml },
  { label: 'attrs mode=japanese default / em', filePath: fixture('p-attrs--o-japaneseonly-em.txt'), mdPlain: md, mdHtml: mdWithHtml },
  { label: 'attrs mode=japanese-boundary-guard explicit / strong', filePath: fixture('p-attrs--o-japaneseonly-strong.txt'), mdPlain: mdPlus, mdHtml: mdPlusWithHtml },
  { label: 'attrs mode=japanese-boundary-guard explicit / em', filePath: fixture('p-attrs--o-japaneseonly-em.txt'), mdPlain: mdPlus, mdHtml: mdPlusWithHtml },
  { label: 'attrs mode=japanese default / complex', filePath: fixture('p-attrs--o-japaneseonly-complex.txt'), mdPlain: md, mdHtml: mdWithHtml },
  { label: 'attrs mode=japanese default / withLineBreak', filePath: fixture('p-breaks-attrs--o-japaneseonly-cjkeithertrue-with-linebreak.txt'), mdPlain: mdWithCJKBreaks, mdHtml: mdWithCJKBreaksWithHtml },
  { label: 'attrs mode=aggressive / leadingAggressive', filePath: fixture('p-attrs--o-aggressive-leading.txt'), mdPlain: mdLeadingAggressive, mdHtml: mdLeadingAggressiveWithHtml },
  { label: 'attrs mode=compatible / leadingCompat', filePath: fixture('p-attrs--o-compatible-leading.txt'), mdPlain: mdLeadingCompatible, mdHtml: mdLeadingCompatibleWithHtml },
  { label: 'attrs mode=japanese sup/sub / supSub', filePath: fixture('p-attrs--o-japaneseonly-sup-sub.txt'), mdPlain: mdSupSub, mdHtml: mdSupSubWithHtml },
  { label: 'attrs mode=japanese cjk_breaks either=true space=half / cjkBreaksSpaceHalf', filePath: fixture('p-breaks-attrs--o-japaneseonly-cjkeithertrue-spacehalf.txt'), mdPlain: mdWithCJKBreaksSpaceHalf, mdHtml: mdWithCJKBreaksSpaceHalfWithHtml },
  { label: 'attrs mode=japanese cjk_breaks either=false / cjkBreaksEitherFalse', filePath: fixture('p-breaks-attrs--o-japaneseonly-cjkeitherfalse.txt'), mdPlain: mdWithCJKBreaksEitherFalse, mdHtml: mdWithCJKBreaksEitherFalseWithHtml },
  { label: 'attrs mode=japanese cjk_breaks normalizeSoftBreaks=true space=half / cjkBreaksNormalizeSoftBreaks', filePath: fixture('p-breaks-attrs--o-japaneseonly-cjkeithertrue-spacehalf-normalizesoftbreaks.txt'), mdPlain: mdWithCJKBreaksNormalizeSoftBreaks, mdHtml: mdWithCJKBreaksNormalizeSoftBreaksWithHtml },
  { label: 'attrs mode=japanese cjk_breaks only / cjkBreaksOnly', filePath: fixture('p-breaks--o-cjkeithertrue-only.txt'), mdPlain: mdWithCJKBreaksOnly, mdHtml: mdWithCJKBreaksOnlyHtml },
  { label: 'attrs mode=japanese cjk_breaks either=true space=half CRLF / cjkBreaksCrlf', filePath: fixture('p-breaks-attrs--o-japaneseonly-cjkeithertrue-crlf.txt'), mdPlain: mdWithCJKBreaksSpaceHalf, mdHtml: mdWithCJKBreaksSpaceHalfWithHtml, normalizeExpectedEol: true },
  { label: 'attrs mode=japanese cjk_breaks normalizeSoftBreaks=true CRLF / cjkBreaksCrlf', filePath: fixture('p-breaks-attrs--o-japaneseonly-cjkeithertrue-crlf.txt'), mdPlain: mdWithCJKBreaksNormalizeSoftBreaks, mdHtml: mdWithCJKBreaksNormalizeSoftBreaksWithHtml, normalizeExpectedEol: true },
  { label: 'attrs mode=japanese attrs-plugin-disabled / noAttrsPlugin', filePath: fixture('p-attrs-disabled--o-japaneseonly-default.txt'), mdPlain: mdNoAttrsPlugin, mdHtml: mdNoAttrsPluginWithHtml },
  { label: 'noattrs mode=japanese default / strong', filePath: fixture('mditNoAttrs/p-noattrs--o-japaneseonly-strong.txt'), mdPlain: mdNoAttrs, mdHtml: mdNoAttrsWithHtml },
  { label: 'noattrs mode=japanese default / em', filePath: fixture('mditNoAttrs/p-noattrs--o-japaneseonly-em.txt'), mdPlain: mdNoAttrs, mdHtml: mdNoAttrsWithHtml },
  { label: 'noattrs mode=japanese-boundary-guard explicit / strong', filePath: fixture('mditNoAttrs/p-noattrs--o-japaneseonly-strong.txt'), mdPlain: mdNoAttrsPlus, mdHtml: mdNoAttrsPlusWithHtml },
  { label: 'noattrs mode=japanese-boundary-guard explicit / em', filePath: fixture('mditNoAttrs/p-noattrs--o-japaneseonly-em.txt'), mdPlain: mdNoAttrsPlus, mdHtml: mdNoAttrsPlusWithHtml },
  { label: 'noattrs mode=japanese default / complex', filePath: fixture('mditNoAttrs/p-noattrs--o-japaneseonly-complex.txt'), mdPlain: mdNoAttrs, mdHtml: mdNoAttrsWithHtml },
  { label: 'noattrs mode=japanese default / withLineBreak', filePath: fixture('mditNoAttrs/p-breaks-noattrs--o-japaneseonly-cjkeithertrue-with-linebreak.txt'), mdPlain: mdNoAttrsCJKBreaks, mdHtml: mdNoAttrsCJKBreaksWithHtml },
  { label: 'noattrs mode=japanese breaks=true / linebreak', filePath: fixture('mditNoAttrs/p-noattrs--o-japaneseonly-breaks-true-linebreaks.txt'), mdPlain: mdNoAttrsLineBreak, mdHtml: mdNoAttrsLineBreakWithHtml },
  { label: 'noattrs mode=japanese cjk_breaks normalizeSoftBreaks=true', filePath: fixture('mditNoAttrs/p-breaks-noattrs--o-japaneseonly-cjkeithertrue-spacehalf-normalizesoftbreaks.txt'), mdPlain: mdNoAttrsCJKBreaksNormalizeSoftBreaks, mdHtml: mdNoAttrsCJKBreaksNormalizeSoftBreaksWithHtml }
]

export const runFixtureTests = () => runFixtureSuites(suites)

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (runFixtureTests()) {
    console.log('Passed fixture tests.')
  } else {
    process.exitCode = 1
  }
}
