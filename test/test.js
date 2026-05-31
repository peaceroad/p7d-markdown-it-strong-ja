import { runFixtureTests } from './test-fixtures.js'
import { runEdgeTests } from './test-edge.js'
import { runAstralDelimiterTests } from './astral-delimiters.test.js'

let allPass = true
allPass = runFixtureTests() && allPass
allPass = runEdgeTests() && allPass
allPass = runAstralDelimiterTests() && allPass

if (allPass) {
  console.log('Passed all tests.')
} else {
  process.exitCode = 1
}
