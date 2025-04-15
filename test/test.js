import assert from 'assert'
import fs from 'fs'
import path from 'path'
import url from 'url'

import mdit from 'markdown-it'
import mditAttrs from 'markdown-it-attrs'
import mditCJKBreaks from '@sup39/markdown-it-cjk-breaks'
import mditStrongJa from '../index.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url)).replace(/\\/g, '/')

const md = mdit().use(mditStrongJa).use(mditAttrs)
const mdWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs)
const mdWithCJKBreaks = mdit().use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {either: true})
const mdWithCJKBreaksWithHtml = mdit({html: true}).use(mditStrongJa).use(mditAttrs).use(mditCJKBreaks, {either: true})

const mditNoAttrs = mdit().use(mditStrongJa, {mditAttrs: false})
const mditNoAttrsWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false})
const mditNoAttrsCJKBreaks = mdit().use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {either: true})
const mditNoAttrsCJKBreaksWithHtml = mdit({html: true}).use(mditStrongJa, {mditAttrs: false}).use(mditCJKBreaks, {either: true})

const mditNoAttrsLinebreak = mdit({breaks: true}).use(mditStrongJa, {mditAttrs: false})
const mditNoAttrsLinebreakWithHtml = mdit({html: true, breaks: true}).use(mditStrongJa, {mditAttrs: false})


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

let allPass = runTests(examples, check, true)
allPass = runTests(examplesMditNoAttrs, check, false) && allPass
allPass = runTests(examplesMditBreaks, checkBreaks, false) && allPass

if (allPass) console.log('Passed all tests.')
