import assert from 'assert'
import fs from 'fs'
import path from 'path'
import url from 'url'

import mdit from 'markdown-it'
import mditAttrs from 'markdown-it-attrs'
import mditCJKBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'
import mditSemanticContainer from '@peaceroad/markdown-it-hr-sandwiched-semantic-container'
import mditSub from 'markdown-it-sub'
import mditSup from 'markdown-it-sup'
import mditStrongJa from '../index.js'
import { runAutoLeadingTests } from './auto-leading.test.js'
import { runOptionEdgeTests } from './options-edge.test.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')

const md = mdit().use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer)
const mdWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer)
const mdWithCJKBreaks = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {either: true})
const mdWithCJKBreaksWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {either: true})
const mdWithCJKBreaksSpaceHalf = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', either: true})
const mdWithCJKBreaksSpaceHalfWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', either: true})
const mdWithCJKBreaksEitherFalse = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks)
const mdWithCJKBreaksEitherFalseWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks)
const mdWithCJKBreaksNormalizeSoftBreaks = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', normalizeSoftBreaks: true, either: true})
const mdWithCJKBreaksNormalizeSoftBreaksWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', normalizeSoftBreaks: true, either: true})
const mdWithCJKBreaksOnly = mdit().use(mditCJKBreaks, {either: true})
const mdWithCJKBreaksOnlyHtml = mdit({html: true}).use(mditCJKBreaks, {either: true})

const mdLeadingGreedy = mdit().use(mditStrongJa, {mode: 'aggressive'}).use(mditAttrs)
const mdLeadingGreedyWithHtml = mdit({html: true}).use(mditStrongJa, {mode: 'aggressive'}).use(mditAttrs)
const mdLeadingMarkdownIt = mdit().use(mditStrongJa, {mode: 'compatible'}).use(mditAttrs)
const mdLeadingMarkdownItWithHtml = mdit({html: true}).use(mditStrongJa, {mode: 'compatible'}).use(mditAttrs)

const mdNoAttrsPlugin = mdit().use(mditStrongJa).use(mditSemanticContainer)
const mdNoAttrsPluginWithHtml = mdit({html: true}).use(mditStrongJa).use(mditSemanticContainer)

const mditNoAttrs = mdit().use(mditStrongJa, {mditAttrs: false}).use(mditSemanticContainer)
const mditNoAttrsWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false}).use(mditSemanticContainer)
const mditNoAttrsCJKBreaks = mdit().use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {either: true})
const mditNoAttrsCJKBreaksWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {either: true})
const mditNoAttrsCJKBreaksNormalizeSoftBreaks = mdit().use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {normalizeSoftBreaks: true, either: true})
const mditNoAttrsCJKBreaksNormalizeSoftBreaksWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {normalizeSoftBreaks: true, either: true})

const mditNoAttrsLinebreak = mdit({breaks: true}).use(mditStrongJa, {mditAttrs: false})
const mditNoAttrsLinebreakWithHtml = mdit({html: true, breaks: true}).use(mditStrongJa, {mditAttrs: false})

const mdSupSub = mdit().use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer).use(mditSup).use(mditSub)
const mdSupSubWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer).use(mditSup).use(mditSub)

const check = (ms, example, allPass, useAttrs) => {
  let n = 1
  while (n < ms.length) {
    //if (n !== 81) { n++; continue }
    const m = ms[n].markdown
    let h = ''
    if (example === 'withLineBreak') {
      h = useAttrs ? mdWithCJKBreaks.render(m) : mditNoAttrsCJKBreaks.render(m)
    } else {
      h = useAttrs ? md.render(m) : mditNoAttrs.render(m)
    }
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Test [' + n + ', HTML: false, useAttrs: ' + useAttrs + '] >>>')
      console.log('Input: ' + ms[n].markdown + '\nOutput: ' + h + 'Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      let hh = ''
      if (example === 'withLineBreak') {
        hh = useAttrs ? mdWithCJKBreaksWithHtml.render(m) : mditNoAttrsCJKBreaksWithHtml.render(m)
      } else {
        hh = useAttrs ? mdWithHtml.render(m) : mditNoAttrsWithHtml.render(m)
      }
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Test [' + n + ', HTML: true, useAttrs: ' + useAttrs + '] >>>')
        console.log('Input: ' + ms[n].markdown + '\nOutput: ' + hh + 'Correct: ' + ms[n].htmlWithHtmlTrue)
        allPass = false
      }
    }
    n++
  }
  return allPass
}

const checkBreaks = (ms, example, allPass, useAttrs) => {
  let n = 1
  while (n < ms.length) {
    //if (n !== 81) { n++; continue }
    const m = ms[n].markdown
    const h = mditNoAttrsLinebreak.render(ms[n].markdown);
    try {
      assert.strictEqual(h, ms[n].html);
    } catch(e) {
      console.log('Test [linebreak, HTML: false, useAttrs: ' + useAttrs + '] >>>');
      console.log('Input: ' + ms[n].markdown + '\nOutput: ' + h + ' Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      let hh = mditNoAttrsLinebreakWithHtml.render(ms[n].markdown)
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Test [' + n + ', HTML: true, useAttrs: ' + useAttrs + '] >>>')
        console.log('Input: ' + ms[n].markdown + '\nOutput: ' + hh + 'Correct: ' + ms[n].htmlWithHtmlTrue)
        allPass = false
      }
    }
    n++
  }
  return allPass
}


const checkSupSub = (ms, example, allPass) => {
  let n = 1
  while (n < ms.length) {
    const m = ms[n].markdown
    const h = mdSupSub.render(m)
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Test [sup/sub, ' + n + ', HTML: false] >>>')
      console.log('Input: ' + ms[n].markdown + '\nOutput: ' + h + 'Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      const hh = mdSupSubWithHtml.render(m)
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Test [sup/sub, ' + n + ', HTML: true] >>>')
        console.log('Input: ' + ms[n].markdown + '\nOutput: ' + hh + 'Correct: ' + ms[n].htmlWithHtmlTrue)
        allPass = false
      }
    }
    n++
  }
  return allPass
}

const checkWithCustomMd = (ms, example, allPass, mdPlain, mdHtml, label) => {
  let n = 1
  while (n < ms.length) {
    const m = ms[n].markdown
    const h = mdPlain.render(m)
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Test [' + label + ', ' + n + ', HTML: false] >>>')
      console.log('Input: ' + ms[n].markdown + '\nOutput: ' + h + 'Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      const hh = mdHtml.render(m)
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Test [' + label + ', ' + n + ', HTML: true] >>>')
        console.log('Input: ' + ms[n].markdown + '\nOutput: ' + hh + 'Correct: ' + ms[n].htmlWithHtmlTrue)
        allPass = false
      }
    }
    n++
  }
  return allPass
}

const checkCjkBreaksSpaceHalf = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdWithCJKBreaksSpaceHalf, mdWithCJKBreaksSpaceHalfWithHtml, 'cjk-breaks-space-half')
}

const checkCjkBreaksEitherFalse = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdWithCJKBreaksEitherFalse, mdWithCJKBreaksEitherFalseWithHtml, 'cjk-breaks-either-false')
}

const checkCjkBreaksNormalizeSoftBreaks = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdWithCJKBreaksNormalizeSoftBreaks, mdWithCJKBreaksNormalizeSoftBreaksWithHtml, 'cjk-breaks-normalize-softbreaks')
}

const checkCjkBreaksNormalizeSoftBreaksNoAttrs = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mditNoAttrsCJKBreaksNormalizeSoftBreaks, mditNoAttrsCJKBreaksNormalizeSoftBreaksWithHtml, 'cjk-breaks-normalize-softbreaks-noattrs')
}

const checkCjkBreaksOnly = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdWithCJKBreaksOnly, mdWithCJKBreaksOnlyHtml, 'cjk-breaks-only')
}

const checkLeadingGreedy = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdLeadingGreedy, mdLeadingGreedyWithHtml, 'leading-aggressive')
}

const checkLeadingCompat = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdLeadingMarkdownIt, mdLeadingMarkdownItWithHtml, 'leading-compat')
}


const checkNoAttrsPlugin = (ms, example, allPass) => {
  let n = 1
  while (n < ms.length) {
    const m = ms[n].markdown
    const h = mdNoAttrsPlugin.render(m)
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Test [no attrs plugin, ' + n + ', HTML: false] >>>')
      console.log('Input: ' + ms[n].markdown + '\nOutput: ' + h + 'Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      const hh = mdNoAttrsPluginWithHtml.render(m)
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Test [no attrs plugin, ' + n + ', HTML: true] >>>')
        console.log('Input: ' + ms[n].markdown + '\nOutput: ' + hh + 'Correct: ' + ms[n].htmlWithHtmlTrue)
        allPass = false
      }
    }
    n++
  }
  return allPass
}

const examples = {
  strong: __dirname + '/p-attrs--o-japaneseonly-strong.txt',
  em: __dirname + '/p-attrs--o-japaneseonly-em.txt',
  complex: __dirname + '/p-attrs--o-japaneseonly-complex.txt',
  withLineBreak: __dirname + '/p-breaks-attrs--o-japaneseonly-cjkeithertrue-with-linebreak.txt',
}

const examplesMditNoAttrs = {
  strong: __dirname + '/mditNoAttrs/p-noattrs--o-japaneseonly-strong.txt',
  em: __dirname + '/mditNoAttrs/p-noattrs--o-japaneseonly-em.txt',
  complex: __dirname + '/mditNoAttrs/p-noattrs--o-japaneseonly-complex.txt',
  withLineBreak: __dirname + '/mditNoAttrs/p-breaks-noattrs--o-japaneseonly-cjkeithertrue-with-linebreak.txt',
}

const examplesMditBreaks = {
  linebreak: __dirname + '/mditNoAttrs/p-noattrs--o-japaneseonly-breaks-true-linebreaks.txt',
}

const examplesNoAttrsPlugin = {
  noAttrsPlugin: __dirname + '/p-attrs-disabled--o-japaneseonly-default.txt',
}

const examplesSupSub = {
  supSub: __dirname + '/p-attrs--o-japaneseonly-sup-sub.txt',
}

const examplesCjkBreaksSpaceHalf = {
  cjkBreaksSpaceHalf: __dirname + '/p-breaks-attrs--o-japaneseonly-cjkeithertrue-spacehalf.txt',
}

const examplesCjkBreaksEitherFalse = {
  cjkBreaksEitherFalse: __dirname + '/p-breaks-attrs--o-japaneseonly-cjkeitherfalse.txt',
}

const examplesCjkBreaksNormalizeSoftBreaks = {
  cjkBreaksNormalizeSoftBreaks: __dirname + '/p-breaks-attrs--o-japaneseonly-cjkeithertrue-spacehalf-normalizesoftbreaks.txt',
}

const examplesCjkBreaksNormalizeSoftBreaksNoAttrs = {
  cjkBreaksNormalizeSoftBreaksNoAttrs: __dirname + '/mditNoAttrs/p-breaks-noattrs--o-japaneseonly-cjkeithertrue-spacehalf-normalizesoftbreaks.txt',
}

const examplesCjkBreaksOnly = {
  cjkBreaksOnly: __dirname + '/p-breaks--o-cjkeithertrue-only.txt',
}

const examplesCjkBreaksCrlf = {
  cjkBreaksCrlf: __dirname + '/p-breaks-attrs--o-japaneseonly-cjkeithertrue-crlf.txt',
}

const examplesLeadingAggressive = {
  leadingAggressive: __dirname + '/p-attrs--o-aggressive-leading.txt',
}

const examplesLeadingCompat = {
  leadingCompat: __dirname + '/p-attrs--o-compatible-leading.txt',
}

const runTests = (examples, checkFunction, useAttrs, labelPrefix) => {
  let allPass = true
  for (let example in examples) {
    const exampleCont = fs.readFileSync(examples[example], 'utf-8').trim()
    let ms = [];
    let ms0 = exampleCont.split(/(?:^|\n+)\[Markdown[^\]]*?\]\n/)
    let n = 1
    while (n < ms0.length) {
      let mhs = ms0[n].split(/\n+\[HTML[^\]]*?\]\n/)
      let i = 1
      while (i < 3) {
        if (mhs[i] === undefined) {
          mhs[i] = ''
        } else {
          mhs[i] = mhs[i].replace(/$/,'\n')
        }
        i++
      }
      ms[n] = {
        markdown: mhs[0],
        html: mhs[1],
        htmlWithHtmlTrue: mhs[2],
      }
      n++
    }
    const label = labelPrefix ? `${labelPrefix} / ${example}` : example
    console.log('Check ' + label + ' =======================')
    allPass = checkFunction(ms, example, allPass, useAttrs)
  }
  return allPass
}

const runTestsCrlf = (examples, checkFunction, useAttrs, labelPrefix) => {
  let allPass = true
  for (let example in examples) {
    const exampleCont = fs.readFileSync(examples[example], 'utf-8')
    let ms = []
    let ms0 = exampleCont.split(/(?:^|(?:\r\n)+)\[Markdown[^\]]*?\]\r\n/)
    let n = 1
    while (n < ms0.length) {
      let mhs = ms0[n].split(/(?:\r\n)+\[HTML[^\]]*?\]\r\n/)
      let i = 1
      while (i < 3) {
        if (mhs[i] === undefined) {
          mhs[i] = ''
        } else {
          mhs[i] = mhs[i].replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          mhs[i] = mhs[i].replace(/\n+$/, '')
          mhs[i] = mhs[i].replace(/$/,'\n')
        }
        i++
      }
      ms[n] = {
        markdown: mhs[0],
        html: mhs[1],
        htmlWithHtmlTrue: mhs[2],
      }
      n++
    }
    const label = labelPrefix ? `${labelPrefix} / ${example}` : example
    console.log('Check ' + label + ' =======================')
    allPass = checkFunction(ms, example, allPass, useAttrs)
  }
  return allPass
}

let allPass = runTests(examples, check, true, 'attrs mode=japanese default')
allPass = runTests(examplesLeadingAggressive, checkLeadingGreedy, true, 'attrs mode=aggressive') && allPass
allPass = runTests(examplesLeadingCompat, checkLeadingCompat, true, 'attrs mode=compatible') && allPass
allPass = runTests(examplesSupSub, checkSupSub, true, 'attrs mode=japanese sup/sub') && allPass
allPass = runTests(examplesCjkBreaksSpaceHalf, checkCjkBreaksSpaceHalf, true, 'attrs mode=japanese cjk_breaks either=true space=half') && allPass
allPass = runTests(examplesCjkBreaksEitherFalse, checkCjkBreaksEitherFalse, true, 'attrs mode=japanese cjk_breaks either=false') && allPass
allPass = runTests(examplesCjkBreaksNormalizeSoftBreaks, checkCjkBreaksNormalizeSoftBreaks, true, 'attrs mode=japanese cjk_breaks normalizeSoftBreaks=true space=half') && allPass
allPass = runTests(examplesCjkBreaksOnly, checkCjkBreaksOnly, true, 'attrs mode=japanese cjk_breaks only') && allPass
allPass = runTestsCrlf(examplesCjkBreaksCrlf, checkCjkBreaksSpaceHalf, true, 'attrs mode=japanese cjk_breaks either=true space=half CRLF') && allPass
allPass = runTestsCrlf(examplesCjkBreaksCrlf, checkCjkBreaksNormalizeSoftBreaks, true, 'attrs mode=japanese cjk_breaks normalizeSoftBreaks=true CRLF') && allPass
allPass = runTests(examplesNoAttrsPlugin, checkNoAttrsPlugin, true, 'attrs mode=japanese attrs-plugin-disabled') && allPass
allPass = runTests(examplesMditNoAttrs, check, false, 'noattrs mode=japanese default') && allPass
allPass = runTests(examplesMditBreaks, checkBreaks, false, 'noattrs mode=japanese breaks=true') && allPass
allPass = runTests(examplesCjkBreaksOnly, checkCjkBreaksOnly, false, 'noattrs mode=japanese cjk_breaks only') && allPass
allPass = runTests(examplesCjkBreaksNormalizeSoftBreaksNoAttrs, checkCjkBreaksNormalizeSoftBreaksNoAttrs, false) && allPass

allPass = runAutoLeadingTests() && allPass
allPass = runOptionEdgeTests() && allPass

if (allPass) console.log('Passed all tests.')
