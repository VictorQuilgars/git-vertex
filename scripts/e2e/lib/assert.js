'use strict'
class E2EFailure extends Error {}
function expect(condition, message) { if (!condition) throw new E2EFailure(message) }
expect.equal = (actual, expected, what) => { if (actual !== expected) throw new E2EFailure(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) }
expect.match = (actual, re, what) => { if (!re.test(String(actual))) throw new E2EFailure(`${what}: expected to match ${re}, got ${JSON.stringify(actual)}`) }
module.exports = { expect, E2EFailure }
