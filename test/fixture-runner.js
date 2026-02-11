import assert from 'assert'
import fs from 'fs'

const normalizeNewlines = (value) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const finalizeExpected = (value, normalizeExpectedEol) => {
  if (value === undefined) return ''
  let out = value
  if (normalizeExpectedEol) {
    out = normalizeNewlines(out).replace(/\n+$/, '')
  }
  return out + '\n'
}

export const readMarkdownHtmlCases = (filePath, { normalizeExpectedEol = false } = {}) => {
  const content = fs.readFileSync(filePath, 'utf8').trim()
  const blocks = content.split(/(?:^|(?:\r?\n)+)\[Markdown[^\]]*?\](?:\r?\n)/)
  const cases = []
  for (let i = 1; i < blocks.length; i++) {
    const parts = blocks[i].split(/(?:\r?\n)+\[HTML[^\]]*?\](?:\r?\n)/)
    cases.push({
      markdown: parts[0],
      html: finalizeExpected(parts[1], normalizeExpectedEol),
      htmlWithHtmlTrue: finalizeExpected(parts[2], normalizeExpectedEol)
    })
  }
  return cases
}

export const runFixtureSuites = (suites) => {
  let allPass = true

  for (let s = 0; s < suites.length; s++) {
    const suite = suites[s]
    const cases = readMarkdownHtmlCases(suite.filePath, {
      normalizeExpectedEol: !!suite.normalizeExpectedEol
    })
    console.log(`Check ${suite.label} =======================`)

    for (let i = 0; i < cases.length; i++) {
      const testCase = cases[i]
      const index = i + 1

      try {
        assert.strictEqual(suite.mdPlain.render(testCase.markdown), testCase.html)
      } catch (err) {
        console.log(`Test [${suite.label}, ${index}, HTML: false] >>>`)
        console.log(`Input: ${testCase.markdown}\nOutput: ${suite.mdPlain.render(testCase.markdown)}Correct: ${testCase.html}`)
        allPass = false
      }

      if (testCase.htmlWithHtmlTrue) {
        try {
          assert.strictEqual(suite.mdHtml.render(testCase.markdown), testCase.htmlWithHtmlTrue)
        } catch (err) {
          console.log(`Test [${suite.label}, ${index}, HTML: true] >>>`)
          console.log(`Input: ${testCase.markdown}\nOutput: ${suite.mdHtml.render(testCase.markdown)}Correct: ${testCase.htmlWithHtmlTrue}`)
          allPass = false
        }
      }
    }
  }

  return allPass
}

