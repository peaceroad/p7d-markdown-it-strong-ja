import { spawnSync } from 'node:child_process'

const STEPS = [
  { label: 'core fixtures', command: 'npm test' },
  { label: 'README examples', command: 'npm run test:readme' },
  { label: 'map diagnostics', command: 'npm run test:map' }
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

console.log('\nALL TESTS PASSED')
console.log('Included: npm test, test:readme, test:map')
