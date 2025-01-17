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

const mdNa = mdit().use(mditStrongJa)
const mdWithHtmlNa = mdit({html: true}).use(mditStrongJa)

const check = (ms, example, allPass) => {
  let n = 1
  while (n < ms.length) {
    //if (n !== 37 ) { n++; continue }
    //if (n !== 9) { n++; continue }
    const m = ms[n].markdown
    console.log('Test [' + n + ', HTML: false] >>>')
    let h = ''
    if (example === 'withLineBreak') {
      h = mdWithCJKBreaks.render(m)
    } else {
      h = md.render(m)
    }
    try {
      assert.strictEqual(h, ms[n].html)
    } catch(e) {
      console.log('Input: ' + ms[n].markdown + '\nConvert: ' + h + 'Correct: ' + ms[n].html)
      allPass = false
    }
    if (ms[n].htmlWithHtmlTrue) {
      console.log('Test [' + n + ', HTML: true] >>>')
      let hh = ''
      if (example === 'withLineBreak') {
        hh = mdWithCJKBreaksWithHtml.render(m)
      } else {
        hh = mdWithHtml.render(m)
      }
      try {
        assert.strictEqual(hh, ms[n].htmlWithHtmlTrue)
      } catch(e) {
        console.log('Input: ' + ms[n].markdown + '\nConvert: ' + hh + 'Correct: ' + ms[n].htmlWithHtmlTrue)
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

const naExamples = {
  strong: __dirname + '/mditNoAttrs/example-strong.txt',
  em: __dirname + '/mditNoAttrs/example-em.txt',
  complex: __dirname + '/mditNoAttrs/example-complex.txt',
  withLineBreak: __dirname + '/mditNoAttrs/example-with-linebreak.txt',
}


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
  console.log('Check ' + example + " process. =======================")
  allPass = check(ms, example, allPass)
}
if (allPass) console.log('Passed all tests.')
