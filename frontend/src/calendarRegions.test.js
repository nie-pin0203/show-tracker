import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {regionBox,duplicateRegion,manualCell,updateRegion,fullDate,complete,selectedText,tierPreview,applyTierPreview,evidenceCrops} from './tencentCalendar.js'

const report={width:361,height:605,lines:[],image_sha256:null}
const box={x:18,y:206,width:44,height:44}
function fill(r,date='2026-10-31') {
 Object.assign(r,{date,yearConfirmed:true,start:1,end:2,tier:'vip',status:'confirmed',checks:{date:true,episode:true,tier:true,status:true}})
 return r
}
test('new real playlist screenshot is usable for manual regions without pretending OCR or daily dates',()=>{
 const image=readFileSync(new URL('../../fixtures/generic_playlist/source.png',import.meta.url))
 assert.equal(image.readUInt32BE(16),361);assert.equal(image.readUInt32BE(20),605)
 const row=manualCell(report,box,1)
 assert.equal(row.raw,'');assert.equal(row.date,'');assert.equal(row.tier,null)
 assert.equal(selectedText([row],{},[1]),'')
 assert.equal(row.rowGroup,'');assert.equal(row.yearConfirmed,false)
})
test('reverse drag, clipped boundaries, different image dimensions and tiny/cancelled selection',()=>{
 assert.deepEqual(regionBox({x:62,y:250},{x:18,y:206},361,605),box)
 assert.deepEqual(regionBox({x:-4,y:-8},{x:2000,y:3000},800,1200),{x:0,y:0,width:800,height:1200})
 assert.equal(regionBox({x:10,y:10},{x:10,y:11},361,605),null)
 assert.equal(regionBox({x:NaN,y:0},{x:30,y:30},361,605),null)
 assert.equal(regionBox({x:900,y:900},{x:1000,y:1000},361,605),null)
})
test('any number of regions with stable ids and duplicate region protection',()=>{
 const rows=Array.from({length:25},(_,i)=>manualCell(report,{x:(i%5)*60,y:Math.floor(i/5)*60,width:40,height:40},i+1))
 assert.equal(rows.length,25);assert.equal(duplicateRegion(rows,rows[0].box),true)
 assert.equal(duplicateRegion(rows,rows[0].box,1),false)
 assert.equal(duplicateRegion(rows,{...rows[0].box,x:0.2}),true)
 rows.splice(0,1);assert.equal(duplicateRegion(rows,{x:0,y:0,width:40,height:40}),false)
 assert.equal(rows[0].id,2);assert.equal(selectedText(rows,{},rows.map(r=>r.id)),'')
 assert.equal(duplicateRegion([],box),false)
})
test('independent dates cross month/year without current-year inference; leap dates validate',()=>{
 const rows=['2026-10-31','2026-11-01','2026-12-31','2027-01-01'].map((d,i)=>fill(manualCell(report,box,i+1),d))
 assert.equal(selectedText(rows,{},[1,2,3,4]).split('\n').length,4)
 rows.forEach(r=>assert.equal(fullDate({},r),r.date))
 assert.equal(fullDate({},fill(manualCell(report,box,1),'2026-02-29')),null)
 assert.equal(fullDate({},fill(manualCell(report,box,1),'2028-02-29')),'2028-02-29')
 rows[0].yearConfirmed=false;assert.equal(complete(rows[0],{year:2026,yearConfirmed:true}),false)
 rows[1].date='';assert.equal(complete(rows[1],{}),false)
})
test('membership grouping is explicitly assigned, independent of coordinates and colours',()=>{
 const rows=[manualCell(report,box,1),manualCell(report,{...box,y:400},2),manualCell(report,box,3)]
 rows[0].tier='svip';rows[0].checks.tier=true
 assert.equal(tierPreview(rows,1).targets.length,0)
 rows[0].rowGroup='人工A';rows[1].rowGroup='人工A';rows[2].rowGroup='人工B'
 const preview=tierPreview(rows,1);assert.deepEqual(preview.targets.map(r=>r.id),[2])
 assert.equal(applyTierPreview(rows,preview,false),false)
 rows[1].rowGroup='人工B';assert.equal(applyTierPreview(rows,preview,true),false)
 rows[1].rowGroup='人工A';assert.equal(applyTierPreview(rows,tierPreview(rows,1),true),true)
 assert.equal(rows[1].tier,'svip');assert.equal(rows[2].tier,null)
 assert.equal(selectedText(rows,{},[1,2]),'')
})
test('moving/resizing updates evidence only, revokes confirmations and keeps original OCR intact',()=>{
 const r={...report,lines:[{words:[{text:'13-141',box}]}]},original=JSON.stringify(r)
 const row=fill(manualCell(r,box,1));assert.equal(row.raw,'13-141')
 updateRegion(row,{x:200,y:400,width:40,height:40},r)
 assert.equal(row.raw,'');assert.equal(row.date,'2026-10-31')
 assert.equal(Object.values(row.checks).some(Boolean),false)
 assert.equal(selectedText([row],{},[1]),'');assert.equal(JSON.stringify(r),original)
})
test('cropped, obstructed, blurry or incomplete cells and missing confirmations cannot export',()=>{
 for(const blocked of ['裁切','遮挡','模糊','不完整']){
  const row=fill(manualCell(report,box,1));row.blocked=blocked
  assert.equal(selectedText([row],{},[1]),'')
 }
 for(const key of ['date','episode','tier','status']){
  const row=fill(manualCell(report,box,1));row.checks[key]=false
  assert.equal(selectedText([row],{},[1]),'')
 }
 const row=fill(manualCell(report,box,1));assert.ok(!selectedText([row],{},[1]).includes('cf0edaba'))
})

test('manual cell crop is episode evidence even when date/tier crops are absent',()=>{
 const r=manualCell(report,box,1)
 assert.deepEqual(evidenceCrops(r),[{box:r.box,label:'集数选区证据'}])
 r.dateBox=box;r.tierBox=box
 assert.deepEqual(evidenceCrops(r).map(x=>x.label),['日期证据','集数选区证据','会员证据'])
})
