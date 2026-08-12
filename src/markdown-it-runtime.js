import MarkdownIt from 'markdown-it'

const Token = MarkdownIt.Token

if (typeof Token !== 'function') {
  throw new Error('markdown-it Token API is unavailable; markdown-it 15 is required')
}

export { Token }
