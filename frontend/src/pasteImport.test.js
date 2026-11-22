import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPasteRecords, freshness, reviewTime } from './pasteImport.js'

const options={platform:'优酷',reviewedAt:'2026-10-30T10:00:00+08:00'}
function fixture() {
  const data={title:'测试',category:'drama',source_id:'test',source_url:'https://v.youku.com/v_show/id_test.html',captured_at:'2026-10-30T09:00:00+08:00',latest_episode:22,audience:'unknown',score:8.5,rating_source:'优酷',rating_url:'https://v.youku.com/v_show/id_test.html'}
  const plan={update_date:'2026-11-01',audience:'vip',schedule_status:'expected',episode_start:1,episode_end:2,planned_count:2}
  return {fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{value:v,confirmed:true}])),
    schedules:[{fields:Object.fromEntries(Object.entries(plan).map(([k,v])=>[k,{value:v}])),confirmed:true}],text_hash:'test-hash'}
}
test('unknown identity latest count is never converted to VIP progress by a schedule',()=>{
  const rows=buildPasteRecords(fixture(),options)
  assert.equal(rows.length,2)
  assert.equal(rows[0].audience,'vip')
  assert.equal(rows[0].latest_episode,undefined)
  assert.equal(rows[1].audience,'unknown')
  assert.equal(rows[1].latest_episode,22)
  assert.match(rows[0].source_note,/人工粘贴核对/)
})
test('every nonempty field and every retained schedule needs manual confirmation',()=>{
  const data=fixture();data.fields.title.confirmed=false
  assert.throws(()=>buildPasteRecords(data,options),/核对字段/)
  data.fields.title.confirmed=true;data.schedules[0].confirmed=false
  assert.throws(()=>buildPasteRecords(data,options),/逐条确认/)
  data.schedules=[]
  assert.equal(buildPasteRecords(data,options).length,1)
})
test('unknown dates statuses and period parts block preview instead of guessing',()=>{
  for(const key of ['update_date','audience','schedule_status','planned_count']) {
    const data=fixture();data.schedules[0].fields[key].value=null
    assert.throws(()=>buildPasteRecords(data,options),/缺少明确/)
  }
  const data=fixture();data.schedules[0].fields.period_date={value:'2026-10-30'}
  assert.throws(()=>buildPasteRecords(data,options),/整期\/上下期/)
})
test('score origin cannot be relabeled and associations require explicit selected ID',()=>{
  const data=fixture();data.fields.rating_source.value='豆瓣'
  assert.throws(()=>buildPasteRecords(data,options),/评分来源/)
  assert.equal(buildPasteRecords(fixture(),options)[0].link_show_id,undefined)
  assert.equal(buildPasteRecords(fixture(),{...options,targetId:31})[0].link_show_id,31)
})
test('viewing age and review time are explicitly in Beijing time',()=>{
  const now=Date.parse('2026-10-30T10:00:00+08:00')
  assert.equal(reviewTime(now),'2026-10-30T10:00:00.000+08:00')
  assert.match(freshness('2026-10-28T10:00:00+08:00',now),/2天/)
  assert.match(freshness('bad',now),/未知/)
  assert.match(freshness('2026-10-31T10:00:00+08:00',now),/未来/)
})
