import test from 'node:test'
import assert from 'node:assert/strict'
import { compareMatches, displayMoment } from './competitions.js'

test('date-only fixtures retain their date and timed fixtures use Beijing time', () => {
  assert.equal(displayMoment(null), '待定')
  assert.equal(displayMoment('2026-11-22'), '2026-11-22（时间未注明）')
  assert.match(displayMoment('2026-11-22T23:30:00-05:00'), /11月23日.*12:30/)
  const event = { title: 'Final', starts_at: '2026-11-22T23:30:00-05:00' }
  const earlier = { title: 'Semi', starts_at: '2026-11-23T09:30:00+08:00' }
  assert.deepEqual([event, earlier].sort(compareMatches), [earlier, event])
})
