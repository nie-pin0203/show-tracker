import test from 'node:test'
import assert from 'node:assert/strict'
import { groupPastedText, buildBatchRecords, sortedRecordRows, saveDraft, loadDraft, clearDraft } from './pasteBatch.js'

const text='作品名称：甲\n平台：优酷\nhttps://v.youku.com/v_show/id_one.html\n2026-11-01 VIP 预计更新第1集\n2026-11-02 SVIP 预计更新第2集\n作品名称：乙\n平台：腾讯视频\nhttps://v.qq.com/x/cover/two.html\n2026-11-01 免费 预计更新第1集'
test('explicit titles group multiple works without mixing days platforms or evidence',()=>{
  const groups=groupPastedText(text)
  assert.equal(groups.length,2)
  assert.deepEqual(groups.map(g=>g.platform),['优酷','腾讯视频'])
  assert.match(groups[0].original,/2026-11-02/)
  assert.doesNotMatch(groups[0].original,/名称：乙/)
  assert.equal(groups[0].groupConfirmed,false)
  assert.equal(groups[0].targetId,'')
})
test('preambles ambiguous URLs and unknown group boundaries never discard or silently assign text',()=>{
  const groups=groupPastedText('平台：优酷\n'+text)
  assert.equal(groups.length,1)
  assert.equal(groups[0].sourceUrl,'')
  assert.match(groups[0].reason,/不确定/)
  assert.match(groups[0].original,/名称：乙/)
  const mismatch=groupPastedText('名称：甲\n平台：豆瓣\nhttps://v.youku.com/v_show/id_one.html')[0]
  assert.equal(mismatch.platform,'')
  assert.match(mismatch.reason,/不确定/)
  assert.throws(()=>groupPastedText('---'),/非空/)
})
function readyGroup(platform,id,url) {
  const fields={title:'同名',category:'drama',source_id:id,source_url:url,captured_at:'2026-10-30T10:00:00+08:00',audience:'unknown'}
  return {platform,sourceUrl:url,original:'测试原文',targetId:'',groupConfirmed:true,
    result:{fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{value:v,confirmed:true}])),schedules:[],text_hash:'test'}}
}
test('batch build requires group confirmation and keeps same-name platform IDs independent',()=>{
  const groups=[readyGroup('优酷','one','https://v.youku.com/v_show/id_one.html'),readyGroup('腾讯视频','two','https://v.qq.com/x/cover/two.html')]
  const rows=buildBatchRecords(groups,'2026-10-30T11:00:00+08:00')
  assert.deepEqual(rows.map(r=>r.source_id),['one','two'])
  assert.ok(rows.every(r=>!r.link_show_id))
  groups[1].groupConfirmed=false
  assert.throws(()=>buildBatchRecords(groups,'now'),/第2组/)
})
test('preview sorting does not change input row identities for conflict choices',()=>{
  const rows=sortedRecordRows([{title:'甲',platform:'优酷',audience:'vip',update_date:'2026-11-03'},
    {title:'乙',platform:'腾讯视频',audience:'free',update_date:'2026-11-01'}])
  assert.deepEqual(rows.map(r=>r.row),[2,1])
})
function storage() {
  const data=new Map()
  return {setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k)}
}
test('draft restores raw text edits and evidence but invalidates confirmations and cross-platform associations',()=>{
  const store=storage(),group=readyGroup('优酷','one','https://v.youku.com/v_show/id_one.html')
  group.targetId=31;group.result.fields.title.evidence=['作品名称：原名'];group.result.fields.title.value='人工改名'
  group.result.schedules=[{confirmed:true,fields:{update_date:{value:'2026-11-01'}}}]
  saveDraft(store,'project-A',{groups:[group],batchText:text,active:0})
  const restored=loadDraft(store,'project-A')
  assert.equal(restored.data.groups[0].result.fields.title.value,'人工改名')
  assert.deepEqual(restored.data.groups[0].result.fields.title.evidence,['作品名称：原名'])
  assert.equal(restored.data.groups[0].groupConfirmed,false)
  assert.equal(restored.data.groups[0].result.fields.title.confirmed,false)
  assert.equal(restored.data.groups[0].result.schedules[0].confirmed,false)
  assert.equal(restored.data.groups[0].targetId,'')
  assert.equal(loadDraft(store,'project-B'),null)
  clearDraft(store,'project-B');assert.ok(loadDraft(store,'project-A'))
  clearDraft(store,'project-A');assert.equal(loadDraft(store,'project-A'),null)
})
test('failed oversized draft save preserves existing draft',()=>{
  const store=storage(),group=readyGroup('优酷','one','https://v.youku.com/v_show/id_one.html')
  saveDraft(store,'A',{groups:[group],active:0})
  assert.throws(()=>saveDraft(store,'A',{groups:[group],batchText:'x'.repeat(1024*1024)}),/超过/)
  assert.equal(loadDraft(store,'A').data.groups[0].platform,'优酷')
})
