import assert from 'assert'
import MarkdownIt from 'markdown-it'
import mditStrongJa from '../index.js'
import mditCJKBreaks from '@peaceroad/markdown-it-cjk-breaks-mod'

const runCase = (name, fn, allPassRef) => {
  try {
    fn()
  } catch (err) {
    console.log(`Test [options edge, ${name}] >>>`)
    console.log(err)
    allPassRef.value = false
  }
}

export const runOptionEdgeTests = () => {
  const allPassRef = { value: true }

  runCase('mode alias japanese-only', () => {
    const input = 'これは**[text](url)**です'
    const mdDefault = new MarkdownIt().use(mditStrongJa)
    const mdAlias = new MarkdownIt().use(mditStrongJa, { mode: 'japanese-only' })
    assert.strictEqual(mdAlias.render(input), mdDefault.render(input))
  }, allPassRef)

  runCase('per-render mode override', () => {
    const input = 'これは**[text](url)**です'
    const md = new MarkdownIt().use(mditStrongJa, { mode: 'compatible' })
    assert.strictEqual(
      md.render(input),
      '<p>これは**<a href="url">text</a>**です</p>\n'
    )
    assert.strictEqual(
      md.render(input, { __strongJaTokenOpt: { mode: 'aggressive' } }),
      '<p>これは<strong><a href="url">text</a></strong>です</p>\n'
    )
  }, allPassRef)

  runCase('compat options mdBreaks/dollarMath are accepted', () => {
    const input = 'これは**[text](url)**です'
    const expected = new MarkdownIt().use(mditStrongJa).render(input)
    const md = new MarkdownIt().use(mditStrongJa, {
      mdBreaks: true,
      dollarMath: true
    })
    assert.strictEqual(md.render(input), expected)
    assert.strictEqual(
      md.render(input, { __strongJaTokenOpt: { mdBreaks: false, dollarMath: false } }),
      expected
    )
  }, allPassRef)

  runCase('postprocess off keeps collapsed ref literal', () => {
    const input = '[**Text**][]'
    const env = { references: { TEXT: { href: 'https://example.com', title: '' } } }
    const mdOn = new MarkdownIt().use(mditStrongJa)
    const mdOff = new MarkdownIt().use(mditStrongJa, { postprocess: false })
    assert.strictEqual(
      mdOn.render(input, env),
      '<p><a href="https://example.com"><strong>Text</strong></a></p>\n'
    )
    assert.strictEqual(
      mdOff.render(input, env),
      '<p>[<strong>Text</strong>][]</p>\n'
    )
  }, allPassRef)

  runCase('per-render postprocess override', () => {
    const input = '[**Text**][]'
    const md = new MarkdownIt().use(mditStrongJa, {
      mode: 'compatible',
      postprocess: false
    })
    const env = {
      references: { TEXT: { href: 'https://example.com', title: '' } },
      __strongJaTokenOpt: { mode: 'aggressive', postprocess: true }
    }
    assert.strictEqual(
      md.render(input, env),
      '<p><a href="https://example.com"><strong>Text</strong></a></p>\n'
    )
  }, allPassRef)

  runCase('coreRulesBeforePostprocess reorder + normalize', () => {
    const md = new MarkdownIt()
    md.core.ruler.push('my_custom_rule', () => {})
    md.use(mditStrongJa, {
      coreRulesBeforePostprocess: ['  my_custom_rule  ', 'my_custom_rule']
    })
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const customIdx = names.indexOf('my_custom_rule')
    const postprocessIdx = names.indexOf('strong_ja_token_postprocess')
    assert.ok(customIdx !== -1 && postprocessIdx !== -1)
    assert.ok(customIdx < postprocessIdx)
  }, allPassRef)

  runCase('coreRulesBeforePostprocess with cjk_breaks name', () => {
    const md = new MarkdownIt()
      .use(mditCJKBreaks, { either: true })
      .use(mditStrongJa, {
        coreRulesBeforePostprocess: [' cjk_breaks ', 'cjk_breaks']
      })
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const cjkIdx = names.indexOf('cjk_breaks')
    const postprocessIdx = names.indexOf('strong_ja_token_postprocess')
    assert.ok(cjkIdx !== -1 && postprocessIdx !== -1)
    assert.ok(cjkIdx < postprocessIdx)
  }, allPassRef)

  runCase('coreRulesBeforePostprocess still applies when postprocess is false', () => {
    const md = new MarkdownIt()
    md.core.ruler.push('my_custom_rule', () => {})
    md.use(mditStrongJa, {
      postprocess: false,
      coreRulesBeforePostprocess: ['my_custom_rule']
    })
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const customIdx = names.indexOf('my_custom_rule')
    const postprocessIdx = names.indexOf('strong_ja_token_postprocess')
    assert.ok(customIdx !== -1 && postprocessIdx !== -1)
    assert.ok(customIdx < postprocessIdx)
  }, allPassRef)

  runCase('patchCorePush true moves restore after late cjk rule', () => {
    const md = new MarkdownIt().use(mditStrongJa, {
      mditAttrs: false,
      patchCorePush: true
    })
    md.core.ruler.push('late_cjk_breaks_custom', () => {})
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const lateIdx = names.indexOf('late_cjk_breaks_custom')
    const restoreIdx = names.indexOf('strong_ja_restore_softbreaks')
    assert.ok(lateIdx !== -1 && restoreIdx !== -1)
    assert.ok(lateIdx < restoreIdx)
  }, allPassRef)

  runCase('patchCorePush false keeps restore position', () => {
    const md = new MarkdownIt().use(mditStrongJa, {
      mditAttrs: false,
      patchCorePush: false
    })
    md.core.ruler.push('late_cjk_breaks_custom', () => {})
    const names = md.core.ruler.__rules__.map((rule) => rule.name)
    const lateIdx = names.indexOf('late_cjk_breaks_custom')
    const restoreIdx = names.indexOf('strong_ja_restore_softbreaks')
    assert.ok(lateIdx !== -1 && restoreIdx !== -1)
    assert.ok(restoreIdx < lateIdx)
  }, allPassRef)

  return allPassRef.value
}
