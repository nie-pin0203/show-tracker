import test from 'node:test'
import assert from 'node:assert/strict'
import { beijingDate, addDays, untilBeijingMidnight, scheduleStats } from './calendar.js'
import { scheduleSummary, scheduleText } from './calendar.js'

test('dated variety halves count as one period and never as episodes', () => {
  const a={show_id:1,category:'variety',period_date:'2026-10-29',period_part:'upper',planned_count:1}
  const result=scheduleSummary([a,{...a,period_part:'lower'},{...a,platform:'another'}])
  assert.equal(result.episodeCount,0)
  assert.equal(result.periodCount,1)
  assert.equal(result.partCount,2)
  assert.equal(scheduleText(a),'2026-10-29期（上期）')
})
test('numeric periods and episodic content use separate units', () => {
  const result=scheduleSummary([{show_id:1,category:'variety',period_number:3,period_part:'full',planned_count:1},
    {show_id:2,category:'animation',episode_start:1,episode_end:2,planned_count:2}])
  assert.equal(result.episodeCount,2)
  assert.equal(result.periodCount,1)
  assert.equal(scheduleText({category:'variety',period_number:3,period_part:'lower'}),'第3期（下期）')
})
test('missing schedule and unknown counts stay unknown', () => {
  assert.equal(scheduleSummary([]).episodeCount,null)
  assert.equal(scheduleSummary([{show_id:1,category:'variety',planned_count:null}]).periodCount,null)
  assert.equal(scheduleSummary([{show_id:1,category:'variety',planned_count:0}]).showCount,0)
  assert.equal(scheduleSummary([{show_id:1,category:'variety',period_date:'2026-10-29',planned_count:1},
    {show_id:1,category:'variety',period_number:1,planned_count:1}]).periodCount,null)
})

test('explicit counts without episode IDs are counted only when cross-platform overlap is unambiguous', () => {
  const rows = [{show_id:1,planned_count:2}, {show_id:2,planned_count:0}]
  assert.equal(scheduleStats(rows).episodeCount,2)
  rows.push({show_id:1,planned_count:3})
  assert.equal(scheduleStats(rows).episodeCount,null)
})

test('Beijing midnight changes day independently of local timezone', () => {
  const before = Date.parse('2026-10-29T15:59:59Z')
  assert.equal(beijingDate(before), '2026-10-29')
  assert.equal(untilBeijingMidnight(before), 1000)
  assert.equal(beijingDate(before + 1000), '2026-10-30')
  assert.equal(untilBeijingMidnight(before + 1000), 86400000)
})
test('week navigation crosses month, year and leap day', () => {
  assert.equal(addDays('2026-10-29', 7), '2026-11-05')
  assert.equal(addDays('2026-10-29', -7), '2026-10-22')
  assert.equal(addDays('2026-12-29', 7), '2027-01-05')
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
})
test('statistics union overlapping episode ranges across platforms', () => {
  const rows = [
    { show_id: 1, planned_count: 2, episode_start: 1, episode_end: 2 },
    { show_id: 1, planned_count: 2, episode_start: 2, episode_end: 3 },
    { show_id: 2, planned_count: 1, episode_start: 1, episode_end: 1 },
  ]
  assert.deepEqual(scheduleStats(rows), { showCount: 2, episodeCount: 4, knownCount: 4, unknownCount: 0 })
  rows.push({ show_id: 3, planned_count: null })
  assert.deepEqual(scheduleStats(rows), { showCount: 3, episodeCount: null, knownCount: 4, unknownCount: 1 })
  assert.deepEqual(scheduleStats([]), { showCount: 0, episodeCount: 0, knownCount: 0, unknownCount: 0 })
})
