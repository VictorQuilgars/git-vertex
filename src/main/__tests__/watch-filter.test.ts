import { MAX_BATCH, makeWatchFilter } from '../watch-filter'

// A refresh is ten git processes. A build running in a window left open used
// to buy one every 1.5 seconds, for files the repository ignores. What this
// module must never do is the opposite mistake — decide a real change is not
// worth showing — so every uncertainty below resolves to "refresh".

/** A probe over a fixed ignore list, counting how often it is asked. */
function probeFor(ignored: string[]) {
  const calls: string[][] = []
  const probe = async (paths: string[]) => {
    calls.push(paths)
    return paths.filter(p => ignored.some(i => p === i || p.startsWith(`${i}/`)))
  }
  return { probe, calls }
}

test('a batch of nothing but ignored paths is not worth a refresh', async () => {
  const { probe, calls } = probeFor(['node_modules', 'dist'])
  const filter = makeWatchFilter(probe)
  expect(await filter.worthRefreshing(['node_modules/react/index.js', 'dist/app.js'])).toBe(false)
  expect(calls).toHaveLength(1)
})

test('one watched path in the batch is enough', async () => {
  const { probe } = probeFor(['node_modules'])
  const filter = makeWatchFilter(probe)
  expect(await filter.worthRefreshing(['node_modules/a.js', 'src/App.tsx'])).toBe(true)
})

test('the same ignored paths are not asked about twice', async () => {
  const { probe, calls } = probeFor(['dist'])
  const filter = makeWatchFilter(probe)
  await filter.worthRefreshing(['dist/a.js', 'dist/b.js'])
  expect(await filter.worthRefreshing(['dist/a.js', 'dist/b.js'])).toBe(false)
  expect(calls).toHaveLength(1)
})

// The one that makes an ordinary edit free: after the first answer, a path
// known to be watched settles the batch before any process is started.
test('a path already known to be watched short-circuits the whole batch', async () => {
  const { probe, calls } = probeFor(['dist'])
  const filter = makeWatchFilter(probe)
  await filter.worthRefreshing(['src/App.tsx'])
  expect(calls).toHaveLength(1)
  expect(await filter.worthRefreshing(['src/App.tsx', 'dist/new.js'])).toBe(true)
  expect(calls).toHaveLength(1)
})

test('a .gitignore edit refreshes, and every decision is taken again', async () => {
  const { probe, calls } = probeFor(['dist'])
  const filter = makeWatchFilter(probe)
  await filter.worthRefreshing(['dist/a.js'])
  expect(calls).toHaveLength(1)
  expect(await filter.worthRefreshing(['.gitignore'])).toBe(true)
  // Same batch as the first: it must be asked again, the rules have moved.
  expect(await filter.worthRefreshing(['dist/a.js'])).toBe(false)
  expect(calls).toHaveLength(2)
})

test('.gitattributes counts too, and a nested one as well', async () => {
  const { probe } = probeFor([])
  const filter = makeWatchFilter(probe)
  expect(await filter.worthRefreshing(['.gitattributes'])).toBe(true)
  expect(await filter.worthRefreshing(['packages/app/.gitignore'])).toBe(true)
})

test('git failing to answer refreshes rather than guesses', async () => {
  const filter = makeWatchFilter(async () => { throw new Error('git is gone') })
  expect(await filter.worthRefreshing(['whatever.txt'])).toBe(true)
})

test('a batch too big to be an edit refreshes without asking', async () => {
  const { probe, calls } = probeFor([])
  const filter = makeWatchFilter(probe)
  const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => `node_modules/p${i}/index.js`)
  expect(await filter.worthRefreshing(many)).toBe(true)
  expect(calls).toHaveLength(0)
})

test('an empty batch is nothing at all', async () => {
  const { probe, calls } = probeFor([])
  expect(await makeWatchFilter(probe).worthRefreshing([])).toBe(false)
  expect(calls).toHaveLength(0)
})

test('a Windows separator names the same file', async () => {
  const { probe } = probeFor([])
  const filter = makeWatchFilter(probe)
  expect(await filter.worthRefreshing(['packages\\app\\.gitignore'])).toBe(true)
})
