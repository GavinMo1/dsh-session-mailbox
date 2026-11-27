// A resolve hook for test/compact-async.test.mjs.
//
// `index.js` has one bare ESM import of a host package (`@deepseek-ai/schemastery`,
// for the `Config` export). The repository deliberately ships no node_modules —
// plugins are `link:`ed into a profile and resolve host packages from the install
// anchor — so a plain `import('../index.js')` in a test cannot resolve it.
//
// Only that one specifier is mapped; everything else goes to the normal resolver,
// which is what keeps this from quietly stubbing more of the host than intended.
// The `@deepseek-ai/dsh-tools` / `dsh-llm` lookups inside `apply()` go through
// `createRequire(anchor)`, so those are stubbed by the anchor the test builds in
// its temp directory, not here.

const STUBS = new Map([
  ['@deepseek-ai/schemastery', new URL('./schemastery-stub.mjs', import.meta.url).href],
])

export async function resolve(specifier, context, nextResolve) {
  const url = STUBS.get(specifier)
  if (url !== undefined) return { url, shortCircuit: true }
  return nextResolve(specifier, context)
}
