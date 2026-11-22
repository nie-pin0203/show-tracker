import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarRange, moveDate, recordsOn } from './trackerCalendar.js'

test('month navigation does not overflow the end of February and weeks start Monday', () => {
  assert.deepEqual(calendarRange('month', '2028-02-29'), { start: '2028-02-01', end: '2028-02-29' })
  assert.equal(moveDate('month', '2027-01-31', 1), '2027-02-01')
  assert.deepEqual(calendarRange('week', '2026-11-22'), { start: '2026-11-16', end: '2026-11-22' })
  assert.deepEqual(calendarRange('day', '2026-11-22'), { start: '2026-11-22', end: '2026-11-22' })
})

test('multi-day records appear across their interval using the real reported dates', () => {
  const record = { key: 'a', day: '2026-11-22', end_day: '2026-11-24', title: 'x' }
  assert.deepEqual(recordsOn([record], '2026-11-24'), [record])
  assert.deepEqual(recordsOn([record], '2026-11-25'), [])
})
