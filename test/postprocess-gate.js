import { spawnSync } from 'node:child_process'

const STEPS = [
  { label: 'postprocess fail-safe', command: 'node test/post-processing.test.js' },
  { label: 'postprocess noop-heavy', command: 'node test/post-processing-noop.test.js' },
  { label: 'postprocess progress', command: 'node test/post-processing-progress.test.js' },
  { label: 'postprocess fastpath', command: 'node test/post-processing-fastpath.test.js' },
  { label: 'postprocess fastpath roster', command: 'node test/post-processing-fastpath-roster.test.js' },
  { label: 'postprocess flow', command: 'node test/post-processing-flow.test.js' },
  {
    label: 'postprocess-call analyzer',
    command: 'npm run analyze:postprocess-calls -- --count 2500 --seed 20260214'
  },
  {
    label: 'fastpath analyzer',
    command: 'npm run analyze:fastpath -- --count 8000 --seed 20260214 --mode aggressive'
  }
]

const runStep = (step, index, total) => {
  console.log(`\n[${index}/${total}] Running ${step.label}...`)
  const result = spawnSync(step.command, {
    stdio: 'inherit',
    shell: true
  })
  if (result.status !== 0) {
    console.error(`\n[FAIL] ${step.label}`)
    process.exit(result.status || 1)
  }
  console.log(`[PASS] ${step.label}`)
}

for (let i = 0; i < STEPS.length; i++) {
  runStep(STEPS[i], i + 1, STEPS.length)
}

console.log('\nPOSTPROCESS GATE PASSED')
console.log('Included:')
console.log('- node test/post-processing.test.js')
console.log('- node test/post-processing-noop.test.js')
console.log('- node test/post-processing-progress.test.js')
console.log('- node test/post-processing-fastpath.test.js')
console.log('- node test/post-processing-fastpath-roster.test.js')
console.log('- node test/post-processing-flow.test.js')
console.log('- npm run analyze:postprocess-calls -- --count 2500 --seed 20260214')
console.log('- npm run analyze:fastpath -- --count 8000 --seed 20260214 --mode aggressive')
