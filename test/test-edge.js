import { runAutoLeadingTests } from './auto-leading.test.js'
import { runOptionEdgeTests } from './options-edge.test.js'
import { runModeGoldenTests } from './mode-golden.test.js'
import { runCompatibleParityTests } from './compatible-parity.test.js'
import { runPostprocessFailSafeTests } from './post-processing.test.js'
import { runTokenOnlyProgressTests } from './post-processing-progress.test.js'
import { runPostprocessNoopHeavyTests } from './post-processing-noop.test.js'
import { runPostprocessFastPathTests } from './post-processing-fastpath.test.js'
import { runPostprocessFastPathRosterTests } from './post-processing-fastpath-roster.test.js'
import { runPostprocessFlowTests } from './post-processing-flow.test.js'
import { pathToFileURL } from 'url'

export const runEdgeTests = () => {
  let allPass = true
  allPass = runAutoLeadingTests() && allPass
  allPass = runOptionEdgeTests() && allPass
  allPass = runModeGoldenTests() && allPass
  allPass = runCompatibleParityTests() && allPass
  allPass = runPostprocessFailSafeTests() && allPass
  allPass = runPostprocessNoopHeavyTests() && allPass
  allPass = runPostprocessFastPathTests() && allPass
  allPass = runPostprocessFastPathRosterTests() && allPass
  allPass = runPostprocessFlowTests() && allPass
  allPass = runTokenOnlyProgressTests() && allPass
  return allPass
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (runEdgeTests()) {
    console.log('Passed edge tests.')
  } else {
    process.exitCode = 1
  }
}
