import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

function worker(base = '/', network = async () => { throw new TypeError('offline') }) {
  const handlers = {}, assets = [], deleted = []
  let skipped = 0
  const html = new Response('<html>saved</html>')
  const cache = { async addAll(values) { assets.push(...values.map(x => x.url)) },
    async match(url) { return url === base + 'index.html' ? html.clone() : null } }
  runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
    .replace('__TRACKER_REVISION__', '"fixture"')
    .replace('__TRACKER_ASSETS__', '["index.html","assets/hash.js"]'), {
    URL, Response, Set,
    Request: class { constructor(url) { this.url = url } },
    self: { addEventListener: (key, fn) => { handlers[key] = fn },
      skipWaiting: async () => { skipped++ },
      registration: { scope: 'https://tracker.example' + base },
      clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [
      'show-tracker-shell-/:old', 'show-tracker-shell-/show-tracker/:old', 'other-app',
    ], delete: async name => { deleted.push(name) } },
    fetch: network,
  })
  function dispatch(type, params) {
    let result
    handlers[type]({ ...params, waitUntil: promise => { result = promise }, respondWith: promise => { result = promise } })
    return result
  }
  return { dispatch, assets, deleted, skipped: () => skipped }
}

test('shell installation waits for an explicit update and can open offline', async () => {
  const { dispatch, assets, skipped } = worker()
  await dispatch('install', {})
  assert.deepEqual(assets, ['/index.html', '/assets/hash.js'])
  assert.equal(skipped(), 0)
  dispatch('message', { data: 'other' })
  assert.equal(skipped(), 0)
  await dispatch('message', { data: 'tracker-update' })
  assert.equal(skipped(), 1)
  assert.equal(dispatch('fetch', { request: { url: 'https://tracker.example/unlisted.json', method: 'GET' } }), undefined)
  const page = await dispatch('fetch', { request: { url: 'https://tracker.example/', method: 'GET', mode: 'navigate' } })
  assert.match(await page.text(), /saved/)
})

test('opening the site while online uses the current page before the offline copy', async () => {
  const { dispatch } = worker('/show-tracker/', async () => new Response('<html>current</html>'))
  const page = await dispatch('fetch', { request: {
    url: 'https://tracker.example/show-tracker/', method: 'GET', mode: 'navigate',
  } })
  assert.match(await page.text(), /current/)
})

test('Pages scope isolates shell resources, navigation and updates', async () => {
  const { dispatch, assets, deleted } = worker('/show-tracker/')
  await dispatch('install', {})
  assert.deepEqual(assets, ['/show-tracker/index.html', '/show-tracker/assets/hash.js'])
  await dispatch('activate', {})
  assert.deepEqual(deleted, ['show-tracker-shell-/show-tracker/:old'])
  const navigate = url => dispatch('fetch', { request: { url, method: 'GET', mode: 'navigate' } })
  assert.match(await (await navigate('https://tracker.example/show-tracker/')).text(), /saved/)
  assert.equal(navigate('https://tracker.example/other/'), undefined)
  assert.equal(navigate('https://other.example/show-tracker/'), undefined)
})
