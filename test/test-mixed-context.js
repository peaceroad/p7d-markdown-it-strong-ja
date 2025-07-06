const MarkdownIt = require('markdown-it')
const mditStrongJa = require('../index.js').default

// Test cases for disallowMixed option
const testCases = [
  // disallowMixed: true (default) - should NOT apply strong emphasis for English-prefixed patterns
  {
    name: 'disallowMixed: true - English prefix with link',
    input: 'string**[text](url)**',
    options: { disallowMixed: true },
    expected: '<p>string**<a href="url">text</a>**</p>'
  },
  {
    name: 'disallowMixed: true - English prefix with HTML',
    input: 'string**<span>text</span>**',
    options: { disallowMixed: true },
    expectedHtmlFalse: '<p>string**&lt;span&gt;text&lt;/span&gt;**</p>',
    expectedHtmlTrue: '<p>string**<span>text</span>**</p>'
  },
  {
    name: 'disallowMixed: true - English prefix with code',
    input: 'text**`code`**',
    options: { disallowMixed: true },
    expected: '<p>text**<code>code</code>**</p>'
  },
  
  // disallowMixed: false - should apply strong emphasis
  {
    name: 'disallowMixed: false - English prefix with link',
    input: 'string**[text](url)**',
    options: { disallowMixed: false },
    expected: '<p>string<strong><a href="url">text</a></strong></p>'
  },
  {
    name: 'disallowMixed: false - English prefix with HTML',
    input: 'string**<span>text</span>**',
    options: { disallowMixed: false },
    expectedHtmlFalse: '<p>string<strong>&lt;span&gt;text&lt;/span&gt;</strong></p>',
    expectedHtmlTrue: '<p>string<strong><span>text</span></strong></p>'
  },
  {
    name: 'disallowMixed: false - English prefix with code',
    input: 'text**`code`**',
    options: { disallowMixed: false },
    expected: '<p>text<strong><code>code</code></strong></p>'
  },
  
  // Japanese context - should always apply strong emphasis regardless of disallowMixed
  {
    name: 'Japanese context with link - disallowMixed: true',
    input: '文字列**[テキスト](url)**',
    options: { disallowMixed: true },
    expected: '<p>文字列<strong><a href="url">テキスト</a></strong></p>'
  },
  {
    name: 'Japanese context with link - disallowMixed: false',
    input: '文字列**[テキスト](url)**',
    options: { disallowMixed: false },
    expected: '<p>文字列<strong><a href="url">テキスト</a></strong></p>'
  },
  {
    name: 'Japanese context with HTML - disallowMixed: true',
    input: 'テキスト**<span>内容</span>**',
    options: { disallowMixed: true },
    expectedHtmlFalse: '<p>テキスト<strong>&lt;span&gt;内容&lt;/span&gt;</strong></p>',
    expectedHtmlTrue: '<p>テキスト<strong><span>内容</span></strong></p>'
  }
]

function runTests() {
  console.log('=== Mixed Language Context Tests ===\\n')
  
  let passCount = 0
  let totalCount = 0
  
  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`)
    console.log(`Input: ${testCase.input}`)
    
    // Test with HTML disabled
    if (testCase.expected || testCase.expectedHtmlFalse) {
      const md = new MarkdownIt({ html: false })
      md.use(mditStrongJa, testCase.options)
      const result = md.render(testCase.input).trim()
      const expected = testCase.expected || testCase.expectedHtmlFalse
      
      totalCount++
      if (result === expected) {
        console.log(`✓ HTML:false - PASS`)
        passCount++
      } else {
        console.log(`✗ HTML:false - FAIL`)
        console.log(`  Expected: ${expected}`)
        console.log(`  Got:      ${result}`)
      }
    }
    
    // Test with HTML enabled
    if (testCase.expectedHtmlTrue) {
      const md = new MarkdownIt({ html: true })
      md.use(mditStrongJa, testCase.options)
      const result = md.render(testCase.input).trim()
      const expected = testCase.expectedHtmlTrue
      
      totalCount++
      if (result === expected) {
        console.log(`✓ HTML:true - PASS`)
        passCount++
      } else {
        console.log(`✗ HTML:true - FAIL`)
        console.log(`  Expected: ${expected}`)
        console.log(`  Got:      ${result}`)
      }
    }
    
    console.log('')
  })
  
  console.log(`=== Results: ${passCount}/${totalCount} tests passed ===`)
  
  if (passCount === totalCount) {
    console.log('🎉 All tests passed!')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed!')
    process.exit(1)
  }
}

runTests()
