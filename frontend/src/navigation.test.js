import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoute } from './navigation.js'

test('navigation supports active menus and retires import destinations', () => {
  assert.deepEqual(resolveRoute('#/follows'), { page: 'follows', anchor: '' })
  assert.deepEqual(resolveRoute('#show-95'), { page: 'media', anchor: 'show-95' })
  assert.deepEqual(resolveRoute('#/media/95'), { page: 'detail', anchor: '', showId: '95' })
  assert.deepEqual(resolveRoute('#/media/95/extra'), { page: 'home', anchor: '' })
  assert.deepEqual(resolveRoute('#/competitions/sports/7'), { page: 'competitions', anchor: '', kind: 'sports', eventId: '7' })
  assert.deepEqual(resolveRoute('#/competitions/esports'), { page: 'competitions', anchor: '', kind: 'esports', eventId: null })
  assert.deepEqual(resolveRoute('#/events/festival/2'), { page: 'events', anchor: '', kind: 'festival', eventId: '2' })
  assert.deepEqual(resolveRoute('#/events/activity'), { page: 'events', anchor: '', kind: 'activity', eventId: null })
  assert.deepEqual(resolveRoute('#calendar-section'), { page: 'film-calendar', anchor: 'calendar-section' })
  assert.deepEqual(resolveRoute('#/calendar'), { page: 'calendar', anchor: '' })
  for (const anchor of ['smart-import', 'current-work', 'links-panel']) {
    assert.deepEqual(resolveRoute(`#${anchor}`), { page: 'home', anchor: '' })
  }
  assert.deepEqual(resolveRoute('#/__proto__'), { page: 'home', anchor: '' })
})
