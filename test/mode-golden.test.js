import assert from 'assert'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'

const MODE_CASES = [
  {
    label: 'single-star japanese-leading',
    input: '*味噌汁。*umai*',
    expected: {
      base: '<p><em>味噌汁。</em>umai*</p>\n',
      plus: '<p><em>味噌汁。</em>umai*</p>\n',
      aggressive: '<p><em>味噌汁。</em>umai*</p>\n',
      compatible: '<p>*味噌汁。<em>umai</em></p>\n'
    }
  },
  {
    label: 'space-adjacent single-star in mixed sentence',
    input: '日本語です。* Japanese food culture* です。',
    expected: {
      base: '<p>日本語です。<em> Japanese food culture</em> です。</p>\n',
      plus: '<p>日本語です。* Japanese food culture* です。</p>\n',
      aggressive: '<p>日本語です。<em> Japanese food culture</em> です。</p>\n',
      compatible: '<p>日本語です。* Japanese food culture* です。</p>\n'
    }
  },
  {
    label: 'space-adjacent strong in mixed sentence',
    input: '日本語です。** Japanese food culture** です。',
    expected: {
      base: '<p>日本語です。<strong> Japanese food culture</strong> です。</p>\n',
      plus: '<p>日本語です。** Japanese food culture** です。</p>\n',
      aggressive: '<p>日本語です。<strong> Japanese food culture</strong> です。</p>\n',
      compatible: '<p>日本語です。** Japanese food culture** です。</p>\n'
    }
  },
  {
    label: 'english mixed double-star split',
    input: '**sushi.**umami**という書き方です。',
    expected: {
      base: '<p>**sushi.<strong>umami</strong>という書き方です。</p>\n',
      plus: '<p>**sushi.<strong>umami</strong>という書き方です。</p>\n',
      aggressive: '<p><strong>sushi.</strong>umami**という書き方です。</p>\n',
      compatible: '<p>**sushi.<strong>umami</strong>という書き方です。</p>\n'
    }
  },
  {
    label: 'inline-link english label',
    input: 'メニューではmenu**[ramen](url)**と書きます。',
    expected: {
      base: '<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>\n',
      plus: '<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>\n',
      aggressive: '<p>メニューではmenu<strong><a href="url">ramen</a></strong>と書きます。</p>\n',
      compatible: '<p>メニューではmenu**<a href="url">ramen</a>**と書きます。</p>\n'
    }
  },
  {
    label: 'inline-link japanese label',
    input: '説明文ではこれは**[寿司](url)**です。',
    expected: {
      base: '<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>\n',
      plus: '<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>\n',
      aggressive: '<p>説明文ではこれは<strong><a href="url">寿司</a></strong>です。</p>\n',
      compatible: '<p>説明文ではこれは**<a href="url">寿司</a>**です。</p>\n'
    }
  }
]

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [mode golden, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

export const runModeGoldenTests = () => {
  const allPassRef = { value: true }

  const mdBase = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary' })
  const mdPlus = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-boundary-guard' })
  const mdAggressive = new MarkdownIt().use(mditStrongJa, { mode: 'aggressive' })
  const mdCompatible = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
  const mdJapaneseAlias = new MarkdownIt().use(mditStrongJa, { mode: 'japanese' })

  for (let i = 0; i < MODE_CASES.length; i++) {
    const c = MODE_CASES[i]
    runCase(c.label, () => {
      assert.strictEqual(mdBase.render(c.input), c.expected.base, 'base')
      assert.strictEqual(mdPlus.render(c.input), c.expected.plus, 'plus')
      assert.strictEqual(mdAggressive.render(c.input), c.expected.aggressive, 'aggressive')
      assert.strictEqual(mdCompatible.render(c.input), c.expected.compatible, 'compatible')
      assert.strictEqual(mdJapaneseAlias.render(c.input), c.expected.plus, 'japanese(alias->plus)')
    }, allPassRef)
  }

  return allPassRef.value
}
