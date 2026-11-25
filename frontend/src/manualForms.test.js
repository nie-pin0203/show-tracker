import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { saveManual, listShows, readShow, saveWatchState, readActivities, readCalendar,
  reviewActivity, commitActivity, reviewWorkImport, commitWorkImport, saveFollow, listFollows } from './library.js'
import { emptyLibrary, exportLibrary, importLibrary } from './localStore.js'
import { manualMoment, videoPlatforms } from './manualForms.js'
const reset = () => importLibrary(JSON.stringify({ app: 'show-tracker-local', ...emptyLibrary() }))

test('all manual media platforms save empty optional fields without network or URL identification', async t => {
  await reset()
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network') })
  for (const platform of videoPlatforms) {
    const { id } = await saveManual('media', { title: platform, category: 'drama', platform })
    const show = await readShow(id)
    assert.equal(show.platforms[0].platform, platform)
    assert.equal(show.total_episodes, null)
    assert.equal(show.premiere_date, null)
    assert.deepEqual(show.schedules, [])
    assert.deepEqual(show.rating_history, [])
  }
  const { id } = await saveManual('media', { title: '普通链接', category: 'movie', platform: '其他', url: 'https://example.com/any/path' })
  assert.equal((await readShow(id)).platforms[0].source_url, 'https://example.com/any/path')
  assert.equal(network.mock.callCount(), 0)
})

test('same names remain independent and duplicate URLs cannot overwrite existing favorites or progress', async () => {
  await reset()
  const fields = { title: '同名作品', category: 'animation', platform: '哔哩哔哩', url: 'https://example.com/show', total_episodes: 12 }
  const { id } = await saveManual('media', fields)
  await saveWatchState(id, { is_favorite: true, version: 1 })
  await saveWatchState(id, { watched_episodes: 3, version: 2 })
  const before = await exportLibrary()
  await assert.rejects(saveManual('media', { ...fields, title: '覆盖' }), /已有作品/)
  assert.equal(await exportLibrary(), before)
  await saveManual('media', { ...fields, platform: '其他' })
  assert.equal((await listShows()).length, 2)
  assert.equal((await readShow(id)).watched_episodes, 3)
  assert.equal((await readShow(id)).is_favorite, true)
})

test('manual dates retain date-only semantics and use explicitly chosen Beijing times', () => {
  assert.equal(manualMoment('', ''), null)
  assert.equal(manualMoment('2026-12-01', ''), '2026-12-01')
  assert.equal(manualMoment('2026-12-01', '19:30'), '2026-12-01T19:30:00+08:00')
  for (const values of [['', '19:00'], ['2026-02-30', ''], ['2026-12-01', '25:00']]) {
    assert.throws(() => manualMoment(...values))
  }
})

test('manual competitions, performances and custom activities save and appear in the correct calendar', async () => {
  await reset()
  for (const kind of ['esports', 'sports', 'performance', 'festival', 'activity']) {
    const { id } = await saveManual(kind, { title: kind, type: kind === 'activity' ? 'exhibition' : 'cup',
      date: '2026-12-01', time: '19:00', artist: '手填艺人', venue: '手填地点', notes: '手填备注' })
    const collection = ['esports','sports'].includes(kind) ? 'competitions' : 'events'
    const saved = await readActivities(collection, id)
    assert.equal(saved.bundle.event.description, '手填备注')
    const entries = (await readCalendar({ start: '2026-12-01', end: '2026-12-01' })).items
    assert.ok(entries.some(row => row.target === `${kind}:${id}`))
    if (collection === 'events') {
      assert.equal(saved.bundle.people[0].name, '手填艺人')
      assert.equal(saved.bundle.sessions[0].venue, '手填地点')
    }
    const bundle = structuredClone(saved.bundle)
    bundle.event.title += '修订'
    const identity = collection === 'events' ? { event_id: id } : { competition_id: id }
    const body = { bundle, ...identity, version: saved.version }
    const preview = await reviewActivity(collection, body)
    await commitActivity(collection, { ...body, preview_token: preview.preview_token })
    const updated = await readActivities(collection, id)
    assert.equal(updated.bundle.event.title, `${kind}修订`)
    assert.deepEqual(updated.bundle.people, saved.bundle.people)
    assert.deepEqual(updated.bundle.participants, saved.bundle.participants)
    assert.equal(updated.history.length, 2)
  }
})

test('invalid manual forms roll back completely and optional event fields may all be blank', async () => {
  await reset()
  const before = await exportLibrary()
  for (const [kind, fields] of [
    ['media', { title: '坏链接', category: 'drama', platform: '优酷', url: 'javascript:alert(1)' }],
    ['sports', { title: '坏日期', type: 'cup', date: '2026-02-30' }],
    ['activity', { title: '坏类型', type: 'missing' }],
  ]) {
    await assert.rejects(saveManual(kind, fields))
    assert.equal(await exportLibrary(), before)
  }
  for (const kind of ['sports','performance','activity']) {
    await saveManual(kind, { title: kind, type: kind === 'sports' ? 'cup' : 'other' })
  }
  assert.equal((await readCalendar({ start: '2026-12-01', end: '2026-12-01' })).items.length, 0)
})

test('old rich records, links, scores, schedules and follows survive edits and JSON backup round trips', async () => {
  await reset()
  const content = JSON.stringify([{ title: '旧作品', category: 'variety', platform: '优酷', source_id: 'old',
    calendar_url: 'https://example.com/calendar', score: 8.5, rating_source: '豆瓣',
    update_date: '2026-12-01', audience: 'svip', period_date: '2026-12-01', period_part: 'upper' }])
  const preview = await reviewWorkImport({ format: 'json', content }, 'manual')
  await commitWorkImport({ format: 'json', content, preview_token: preview.preview_token }, 'manual')
  const show = (await listShows())[0]
  await saveWatchState(show.id, { is_favorite: true, version: 1 })
  await saveFollow({ target: `media:${show.id}`, state: 'active', version: 0 })
  const backup = JSON.parse(await exportLibrary())
  const platform = backup.shows[0].platforms[0]
  backup.links.push({ id: backup.nextId++, show_id: show.id, platform: '优酷',
    detail_url: 'https://example.com/detail', calendar_url: 'https://example.com/calendar' })
  await importLibrary(JSON.stringify(backup))
  const before = await readShow(show.id)
  await saveManual('media', { title: '另一个作品', category: 'movie', platform: '其他' })
  assert.deepEqual(await readShow(show.id), before)
  const exported = await exportLibrary()
  await importLibrary(exported)
  assert.deepEqual(await readShow(show.id), before)
  assert.equal((await listFollows()).items[0].state, 'active')
  assert.equal(before.rating_history[0].score, 8.5)
  assert.equal(before.schedules[0].period_part, 'upper')
})
