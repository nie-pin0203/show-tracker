import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { commitActivity, commitWorkImport, inspectLink, listFollows, listLinks, listShows,
  readActivities, readCalendar, readShow, readToday, readWeek, removeLink,
  reviewActivity, reviewWorkImport, saveFollow, saveWatchState, writeLink } from './library.js'
import { parseText } from './localImport.js'
import { emptyLibrary, exportLibrary, importLibrary, readBackup } from './localStore.js'
import { beijingDate } from './calendar.js'

const snapshot = data => JSON.stringify({ app:'show-tracker-local', ...data })
const row = { title:'验收剧集', category:'drama', platform:'腾讯视频', source_id:'test-id',
  total_episodes:12, captured_at:'2026-11-22T08:00:00+08:00' }
const payload = (...rows) => ({ format:'json', content:JSON.stringify(rows) })
const preview = body => reviewWorkImport(body, 'manual')
async function commit(body, flags = {}) {
  const review = await preview(body)
  assert.equal(review.valid,true)
  return commitWorkImport({ ...body, ...flags, preview_token:review.preview_token }, 'manual')
}
const clear = () => importLibrary(snapshot(emptyLibrary()))

test('first launch has an empty library, with no fixtures or network', async t => {
  const fetch = t.mock.method(globalThis,'fetch',() => { throw new Error('No HTTP requests are permitted') })
  assert.deepEqual(await listShows(),[])
  assert.deepEqual((await readToday()).items,[])
  assert.equal((await readWeek()).days.length,7)
  assert.equal(fetch.mock.callCount(),0)
})

test('work, progress, favorite, score and explicit schedule persist in IndexedDB', async () => {
  await clear()
  const day = beijingDate()
  const body = payload({ ...row, latest_episode:4, update_date:day, audience:'vip', episode_start:3, episode_end:4,
    score:8.2, rating_source:'豆瓣', rating_count:100 })
  const result = await commit(body)
  const id = result.items[0].show_id
  await saveWatchState(id, { is_favorite:true, version:1 })
  await saveWatchState(id, { version:2, watched_episodes:3 })
  const detail = await readShow(id)
  assert.equal(detail.is_favorite,true)
  assert.equal(detail.watched_episodes,3)
  assert.equal(detail.ratings[0].score,8.2)
  assert.equal(detail.schedules[0].planned_count,2)
  const planned = (await readWeek(day)).days[0].items[0]
  assert.equal(planned.show_id,id)
  assert.equal(planned.latest_episode,4)
  assert.equal((await listFollows()).items[0].target,`media:${id}`)
})

test('writes are serialized across concurrent tabs and stale revisions cannot overwrite progress', async () => {
  await clear()
  const { items:[{ show_id:id }] } = await commit(payload(row))
  const results = await Promise.allSettled([
    saveWatchState(id, { version:1, watched_episodes:2 }),
    saveWatchState(id, { version:1, watched_episodes:8 }),
  ])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
  assert.deepEqual(results.find(x=>x.status==='rejected').reason.current, {
    version:2, is_favorite:false, watched_episodes:2,
  })
  assert.equal((await readShow(id)).watched_episodes,2)
})

test('whole-library JSON round trips and invalid records leave saved data intact', async () => {
  await clear()
  await commit(payload(row))
  const backup = await exportLibrary()
  const data = readBackup(backup)
  await clear()
  assert.equal((await listShows()).length,0)
  assert.equal(await importLibrary(backup),1)
  assert.deepEqual((await listShows()).map(x=>x.title),[row.title])
  const bad = snapshot({ ...data, shows:[{ ...data.shows[0], poster_url:'data:text/html,invalid' }] })
  await assert.rejects(importLibrary(bad),/HTTP/)
  assert.equal((await listShows()).length,1)
})

test('preview is read-only, rejects a mixed invalid import and protects intentional updates', async () => {
  await clear()
  const broken = payload(row,{...row, source_id:'outside', update_date:'2026-02-30', audience:'vip', planned_count:1})
  const invalid = await preview(broken)
  assert.equal(invalid.valid,false)
  await assert.rejects(commitWorkImport({...broken,preview_token:invalid.preview_token}, 'manual'),/日期/)
  assert.deepEqual(await listShows(),[])
  await commit(payload(row))
  const next = payload({ ...row, title:'新名称' })
  const review = await preview(next)
  assert.equal(review.conflict_count,1)
  await commit(next,{ confirm_overwrite:true })
  await assert.rejects(commitWorkImport({...next,preview_token:review.preview_token}, 'manual'),/变化/)
  assert.equal((await listShows())[0].title,'新名称')
})

test('CSV quoting and independently managed links work without treating URLs as fetch targets', async () => {
  await clear()
  const body = { format:'csv', content:'title,category,platform,source_id\r\n"剧集,续篇",drama,优酷,csv-1' }
  await commit(body)
  const details = { title:'第二部剧', category:'drama', detail_url:'https://v.qq.com/x/cover/example123.html' }
  const item = await writeLink(details, { quick:true })
  assert.equal((await inspectLink(details.detail_url)).existing.id,item.show_id)
  await removeLink(item.id)
  assert.equal((await readShow(item.show_id)).title,details.title)
  assert.equal((await listLinks()).length,0)
})

test('manual activities share the existing calendar and follow navigation', async () => {
  await clear()
  const day = beijingDate()
  const bundle = { kind:'performance', event:{ source_id:'show-1', title:'验收演出' },
    performance:{ format:'concert' }, people:[], tickets:[], stages:[], sets:[],
    sessions:[{ source_id:'night',title:'首场',starts_at:day,status:'confirmed',city:'测试城市' }] }
  const review = await reviewActivity('events', { bundle })
  const { id } = await commitActivity('events', { bundle, preview_token:review.preview_token })
  assert.equal((await readActivities('events', id)).bundle.event.title,'验收演出')
  assert.equal((await readCalendar({ start:day, end:day })).items[0].city,'测试城市')
  await saveFollow({ target:'performance:'+id, state:'active', version:0 })
  assert.equal((await listFollows()).items[0].state,'active')
})

test('local parser only assigns explicit date and tier to screenshot corrections', async () => {
  const parsed = await parseText({platform:'腾讯视频',
    source_url:'https://v.qq.com/x/cover/example123.html',
    text:'更新至22/30集\n2026-10-28 SVIP 已确认更新第13-14集 [截图证据]\n10月30日 题外文本'})
  assert.equal(parsed.fields.latest_episode.value,22)
  assert.equal(parsed.fields.audience.value,null)
  assert.equal(parsed.schedules.length,1)
  assert.equal(parsed.schedules[0].fields.audience.value,'svip')
  assert.equal(parsed.schedules[0].confirmed,false)
})
