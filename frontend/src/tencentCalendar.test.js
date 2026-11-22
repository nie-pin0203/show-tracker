import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sampleCells,fullDate,complete,confirmedText,reviewCounts,tierPreview,applyTierPreview,selectedText,recordChange} from './tencentCalendar.js'
const report=JSON.parse(readFileSync(new URL('../../fixtures/tencent_calendar_lowres/numbers.json',import.meta.url),'utf8'))
const context={year:2026,month:10,yearConfirmed:true,monthConfirmed:true} // Synthetic review inputs, not human ground truth.
function fill(r){Object.assign(r,{day:28,start:13,end:14,tier:'svip',status:'confirmed',checks:{date:true,episode:true,tier:true,status:true}});return r}
test('exact sample only; eight cells exclude blanks and cropped right column',()=>{
 assert.equal(sampleCells(report).length,8)
 assert.deepEqual(sampleCells({...report,image_sha256:'another image'}),[])
 assert.deepEqual(sampleCells({...report,width:298}),[])
 for(const r of sampleCells(report)){assert.ok(r.box.x+r.box.width<270);assert.equal(r.day,null);assert.equal(r.start,null);assert.equal(r.tier,null)}
})
test('date and tier evidence associate by original coordinates, independent of OCR text order',()=>{
 const normal=sampleCells(report)
 const shuffled=sampleCells({...report,lines:[...report.lines].reverse().map(l=>({...l,words:[...l.words].reverse()}))})
 assert.deepEqual(shuffled,normal)
 assert.match(normal[0].dateRaw,/28/);assert.match(normal[0].raw,/13-141/)
 assert.equal(normal[0].tierRaw,'SVIP');assert.equal(normal[4].tierRaw,'')
 assert.equal(normal[0].tier,null);assert.equal(normal[4].tier,null)
})
test('no year inference or automatic date correction, even with other confirmations',()=>{
 const row=fill(sampleCells(report)[0])
 for(const c of [{}, {...context,year:''},{...context,yearConfirmed:false},{...context,monthConfirmed:false}]){
  assert.equal(fullDate(c,row),null);assert.equal(confirmedText([row],c),'')
 }
 assert.equal(fullDate({...context,month:2},{...row,day:30}),null)
 assert.equal(fullDate({...context,year:2024,month:2},{...row,day:29}),'2024-02-29')
})
test('every field confirmation and complete content required; blocked cells cannot export',()=>{
 for(const key of ['date','episode','tier','status']){
  const row=fill(sampleCells(report)[0]);row.checks[key]=false;assert.equal(complete(row,context),false)
 }
 for(const reason of ['遮挡','裁切','模糊','不完整']){
  const row=fill(sampleCells(report)[0]);row.blocked=reason;assert.equal(confirmedText([row],context),'')
 }
 const row=fill(sampleCells(report)[0]);assert.match(confirmedText([row],context),/^2026-10-28 SVIP 已确认更新第13-14集/)
 row.start=15;row.end=14;assert.equal(complete(row,context),false)
 row.end=16;row.tier=null;assert.equal(complete(row,context),false)
})
test('review completeness is not accuracy; unannotated sample remains eight pending',()=>{
 const rows=sampleCells(report),counts=reviewCounts(rows,{})
 assert.equal(counts.complete,0);assert.equal(counts.dateReviewed,0)
 assert.deepEqual(counts.accuracy,{number:null,date:null,tier:null,complete:null})
 assert.equal(confirmedText(rows,context),'')
})


test('manual row membership requires preview approval and cannot propagate across rows or skipped cells',()=>{
 const rows=sampleCells(report),raw=JSON.stringify(report)
 assert.equal(tierPreview(rows,1),null)
 rows[0].tier='svip';rows[0].checks.tier=true;rows[3].blocked='裁切'
 const p=tierPreview(rows,1)
 assert.deepEqual(p.targets.map(r=>r.id),[2,3]);assert.equal(rows[1].tier,null)
 assert.equal(applyTierPreview(rows,p),false)
 assert.equal(applyTierPreview(rows,p,true),true)
 assert.equal(rows[1].tier,'svip');assert.equal(rows[1].checks.tier,true)
 assert.equal(rows[1].checks.date,false);assert.equal(rows[1].day,null)
 assert.equal(rows[3].tier,null);assert.equal(rows[4].tier,null)
 assert.equal(JSON.stringify(report),raw)
})

test('changed membership source, conflicts or targets invalidate old preview',()=>{
 const rows=sampleCells(report);rows[0].tier='svip';rows[0].checks.tier=true
 const p=tierPreview(rows,1);rows[1].tier='vip'
 assert.equal(applyTierPreview(rows,p,true),false)
 const fresh=tierPreview(rows,1);assert.equal(fresh.targets[0].old,'vip')
 rows[0].checks.tier=false;assert.equal(applyTierPreview(rows,fresh,true),false)
})

test('selection rechecks completeness, deduplicates IDs and audit preserves before/after raw evidence',()=>{
 const rows=sampleCells(report),context={year:2026,month:10,yearConfirmed:true,monthConfirmed:true}
 const before=JSON.stringify(rows);fill(rows[0]);fill(rows[1]);rows[1].blocked='模糊'
 assert.equal(selectedText(rows,context,[]),'')
 assert.equal(selectedText(rows,context,[1,1,2,3,99]).split('\n').length,1)
 rows[0].checks.date=false;assert.equal(selectedText(rows,context,[1]),'')
 const history=[];recordChange(history,before,JSON.stringify(rows))
 assert.equal(history.length,1);assert.equal(history[0].before[0].start,null)
 assert.equal(history[0].after[0].start,13);assert.equal(history[0].after[0].raw,history[0].before[0].raw)
 rows[0].start=99;assert.equal(history[0].after[0].start,13)
 recordChange(history,before,before);assert.equal(history.length,1)
})
