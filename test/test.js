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

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')

const md = mdit().use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer)
const mdWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditSemanticContainer)
const mdWithCJKBreaks = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {either: true})
const mdWithCJKBreaksWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {either: true})
const mdWithCJKBreaksSpaceHalf = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', either: true})
const mdWithCJKBreaksSpaceHalfWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', either: true})
const mdWithCJKBreaksNormalizeSoftBreaks = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', normalizeSoftBreaks: true, either: true})
const mdWithCJKBreaksNormalizeSoftBreaksWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {spaceAfterPunctuation: 'half', normalizeSoftBreaks: true, either: true})

const mdNoAttrsPlugin = mdit().use(mditStrongJa).use(mditSemanticContainer)
const mdNoAttrsPluginWithHtml = mdit({html: true}).use(mditStrongJa).use(mditSemanticContainer)

const mditNoAttrs = mdit().use(mditStrongJa, {mditAttrs: false}).use(mditSemanticContainer)
const mditNoAttrsWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false}).use(mditSemanticContainer)
const mditNoAttrsCJKBreaks = mdit().use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {either: true})
const mditNoAttrsCJKBreaksWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {either: true})

const mditNoAttrsLinebreak = mdit({breaks: true}).use(mditStrongJa, {mditAttrs: false})
const mditNoAttrsLinebreakWithHtml = mdit({html: true, breaks: true}).use(mditStrongJa, {mditAttrs: false})

// For disallowMixed: true tests
const mdDisallowMixed = mdit().use(mditStrongJa, {disallowMixed: true}).use(mditAttrs)
const mdDisallowMixedWithHtml = mdit({html: true}).use(mditStrongJa, {disallowMixed: true}).use(mditAttrs)
const mditNoAttrsDisallowMixed = mdit().use(mditStrongJa, {mditAttrs: false, disallowMixed: true})
const mditNoAttrsDisallowMixedWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false, disallowMixed: true})

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

const checkDisallowMixed = (ms, example, allPass, useAttrs) => {
  let n = 1
  while (n < ms.length) {
    const m = ms[n].markdown
    const h = useAttrs ? mdDisallowMixed.render(m) : mditNoAttrsDisallowMixed.render(m)
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Test [disallowMixed: true, ' + n + ', HTML: false, useAttrs: ' + useAttrs + '] >>>')
      console.log('Input: ' + ms[n].markdown + '\nOutput: ' + h + 'Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      const hh = useAttrs ? mdDisallowMixedWithHtml.render(m) : mditNoAttrsDisallowMixedWithHtml.render(m)
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Test [disallowMixed: true, ' + n + ', HTML: true, useAttrs: ' + useAttrs + '] >>>')
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

const checkCjkBreaksNormalizeSoftBreaks = (ms, example, allPass) => {
  return checkWithCustomMd(ms, example, allPass, mdWithCJKBreaksNormalizeSoftBreaks, mdWithCJKBreaksNormalizeSoftBreaksWithHtml, 'cjk-breaks-normalize-softbreaks')
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
  strong: __dirname + '/example-strong.txt',
  em: __dirname + '/example-em.txt',
  complex: __dirname + '/example-complex.txt',
  withLineBreak: __dirname + '/example-with-linebreak.txt',
}

const examplesMditNoAttrs = {
  strong: __dirname + '/mditNoAttrs/example-strong.txt',
  em: __dirname + '/mditNoAttrs/example-em.txt',
  complex: __dirname + '/mditNoAttrs/example-complex.txt',
  withLineBreak: __dirname + '/mditNoAttrs/example-with-linebreak.txt',
}

const examplesMditBreaks = {
  linebreak: __dirname + '/mditNoAttrs/example-mdit-linebrek.txt',
}

const examplesDisallowMixed = {
  disallowMixed: __dirname + '/example-disallow-mixed.txt',
}

const examplesNoAttrsPlugin = {
  noAttrsPlugin: __dirname + '/example-no-attrs-plugin.txt',
}

const examplesSupSub = {
  supSub: __dirname + '/example-sup-sub.txt',
}

const examplesCjkBreaksSpaceHalf = {
  cjkBreaksSpaceHalf: __dirname + '/example-cjk-breaks-space-half.txt',
}

const examplesCjkBreaksNormalizeSoftBreaks = {
  cjkBreaksNormalizeSoftBreaks: __dirname + '/example-cjk-breaks-normalize-softbreaks.txt',
}

const examplesCjkBreaksCrlf = {
  cjkBreaksCrlf: __dirname + '/example-cjk-breaks-crlf.txt',
}

const runTests = (examples, checkFunction, useAttrs) => {
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
    console.log('Check ' + example + ' process [mditAttrs: ' + useAttrs + '] =======================')
    allPass = checkFunction(ms, example, allPass, useAttrs)
  }
  return allPass
}

const runTestsCrlf = (examples, checkFunction, useAttrs) => {
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
    console.log('Check ' + example + ' process [mditAttrs: ' + useAttrs + '] =======================')
    allPass = checkFunction(ms, example, allPass, useAttrs)
  }
  return allPass
}

let allPass = runTests(examples, check, true)
allPass = runTests(examplesDisallowMixed, checkDisallowMixed, true) && allPass
allPass = runTests(examplesSupSub, checkSupSub, true) && allPass
allPass = runTests(examplesCjkBreaksSpaceHalf, checkCjkBreaksSpaceHalf, true) && allPass
allPass = runTests(examplesCjkBreaksNormalizeSoftBreaks, checkCjkBreaksNormalizeSoftBreaks, true) && allPass
allPass = runTestsCrlf(examplesCjkBreaksCrlf, checkCjkBreaksSpaceHalf, true) && allPass
allPass = runTestsCrlf(examplesCjkBreaksCrlf, checkCjkBreaksNormalizeSoftBreaks, true) && allPass
allPass = runTests(examplesNoAttrsPlugin, checkNoAttrsPlugin, true) && allPass
allPass = runTests(examplesMditNoAttrs, check, false) && allPass
allPass = runTests(examplesMditBreaks, checkBreaks, false) && allPass
allPass = runTests(examplesDisallowMixed, checkDisallowMixed, false) && allPass

if (allPass) console.log('Passed all tests.')
