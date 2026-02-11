import { runAutoLeadingTests } from './auto-leading.test.js'
import { runOptionEdgeTests } from './options-edge.test.js'
import { pathToFileURL } from 'url'

export const runEdgeTests = () => {
  let allPass = true
  allPass = runAutoLeadingTests() && allPass
  allPass = runOptionEdgeTests() && allPass
  return allPass
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (runEdgeTests()) {
    console.log('Passed edge tests.')
  } else {
    process.exitCode = 1
  }
}
