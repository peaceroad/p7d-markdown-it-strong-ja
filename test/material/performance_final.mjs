import MarkdownIt from 'markdown-it'
import markdownItStrongJa from '../../index.js'

// Test content with mixed Japanese/English
const testContent = `
これは**日本語**と*English*が混在した文章です。
**Bold text** with *italic* and 普通のテキスト。
\`code block\` and $math$ expressions are handled.
<strong>HTML tags</strong> with **markdown emphasis**.
[Link text](http://example.com) and **strong text**.
大量の**強調**テキストと*斜体*テキストが含まれています。
`.repeat(100) // Repeat for performance testing

const md = new MarkdownIt()
md.use(markdownItStrongJa, {
  disallowMixed: false,
  dollarMath: true,
  mditAttrs: true
})

// Warm-up runs
console.log('Warming up...')
for (let i = 0; i < 10; i++) {
  md.render(testContent)
}

// Performance test
console.log('Running performance test...')
const iterations = 1000
const startTime = process.hrtime.bigint()

for (let i = 0; i < iterations; i++) {
  md.render(testContent)
}

const endTime = process.hrtime.bigint()
const totalTime = Number(endTime - startTime) / 1000000 // Convert to milliseconds
const averageTime = totalTime / iterations

console.log(`Total time: ${totalTime.toFixed(2)}ms`)
console.log(`Average time per render: ${averageTime.toFixed(3)}ms`)
console.log(`Renders per second: ${(1000 / averageTime).toFixed(0)}`)

// Memory usage
console.log('\nMemory usage:')
console.log(process.memoryUsage())
