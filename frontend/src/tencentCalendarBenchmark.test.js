// Offline replay only. No app imports this file or the human answer CSV.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {sampleCells,confirmedText,reviewCounts,SAMPLE_HASH,selectedText,tierPreview,applyTierPreview} from './tencentCalendar.js'

const folder=new URL('../../fixtures/tencent_calendar_lowres/',import.meta.url)
const read=name=>readFileSync(new URL(name,folder))
// This fixture contains no quoted delimiters/newlines. Reject format changes instead of misreading them.
function fixtureCsv(name) {
 const lines=read(name).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/)
 const split=line=>line.split(',').map(v=>v.replace(/^"(.*)"$/,'$1'))
 const header=split(lines.shift())
 return lines.map(line=>{const values=split(line);assert.equal(values.length,11);return Object.fromEntries(header.map((h,i)=>[h,values[i]]))})
}
const truth=fixtureCsv('confirmed-2026.csv'),pending=fixtureCsv('pending.csv')
const report=JSON.parse(read('numbers.json')),original=JSON.stringify(report)
const cells=sampleCells(report)
const rawHashes=Object.fromEntries(['source.png','numbers.json','standard.json'].map(name=>[name,createHash('sha256').update(read(name)).digest('hex')]))

// These are evidence measurements, not corrections or import candidates. Retain ALL digits in 13-141.
function observed(cell) {
 const ranges=[...cell.raw.matchAll(/(?<!\d)(\d{1,3})[-·.](\d{1,3})(?!\d)/g)]
 const day=cell.dateRaw.match(/^\s*(\d{1,2})(?!\d)[^\d]*$/)?.[1]
 const tier=/^(SVIP|VIP|免费)$/i.test(cell.tierRaw.trim())?cell.tierRaw.trim().toUpperCase():null
 return {range:ranges.length===1?ranges[0].slice(1).map(Number):null,
  day:day && Number(day)>=1 && Number(day)<=31?Number(day):null,tier,
  // The image has no year; do not borrow the year/month from the answer file.
  date:cell.dateRaw.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]??null}
}
function compare(input) {
 return input.map((cell,i)=>{
  const answer=truth[i],value=observed(cell)
  const number=JSON.stringify(value.range)===JSON.stringify([Number(answer['确认起集']),Number(answer['确认止集'])])
  const day=value.day===Number(answer['确认日']),tier=value.tier===answer['确认会员']
  const date=[answer['确认年份'],answer['确认月份'],answer['确认日']].map((s,i)=>s.padStart(i?2:4,'0')).join('-')
  return {id:cell.id,box:cell.box,dateBox:cell.dateBox,tierBox:cell.tierBox,
   raw:{date:cell.dateRaw,episodes:cell.raw,tier:cell.tierRaw},observed:value,
   expected:{date,start:Number(answer['确认起集']),end:Number(answer['确认止集']),tier:answer['确认会员']},
   correct:{number,day,tier,fullDate:value.date===date,complete:number&&tier&&value.date===date},
   error:!value.range?'集数漏识别':!number?'集字被误识为末尾数字1；不截断修正':!tier?'VIP标签漏识别':'数字及行列证据可用；年月仍须人工确认'}
 })
}
const rows=compare(cells)
const counts=Object.fromEntries(['number','day','tier','fullDate','complete'].map(k=>[k,rows.filter(r=>r.correct[k]).length]))

test('eight human answers match original pending OCR and all eight original pixel regions',()=>{
 assert.equal(truth.length,8);assert.equal(pending.length,8);assert.equal(cells.length,8)
 assert.equal(rawHashes['source.png'],SAMPLE_HASH)
 for(let i=0;i<8;i++){
  const t=truth[i],r=cells[i]
  assert.equal(Number(t['格号']),i+1)
  for(const [key,value] of [['日期框OCR',r.dateRaw],['集数框OCR',r.raw],['会员框OCR',r.tierRaw]]){
   assert.equal(t[key],value);assert.equal(pending[i][key],value)
  }
  assert.equal(t['确认年份'],'2026');assert.equal(t['确认月份'],'10')
  assert.equal(Number(t['确认日']),28+i%4)
  assert.equal(t['确认会员'],i<4?'SVIP':'VIP');assert.equal(t['无法确认原因'],'')
  assert.equal(pending[i]['确认年份'],'');assert.ok(r.box.x+r.box.width<270)
 }
})

test('real benchmark distinguishes day-column match from full dates and unchanged OCR errors',()=>{
 assert.deepEqual(counts,{number:3,day:8,tier:4,fullDate:0,complete:0})
 assert.deepEqual(rows.filter(r=>r.correct.number).map(r=>r.id),[2,7,8])
 assert.deepEqual(rows.filter(r=>r.observed.range&&!r.correct.number).map(r=>r.id),[1,3,4,5])
 assert.deepEqual(rows.filter(r=>!r.observed.range).map(r=>r.id),[6])
 assert.deepEqual(rows[0].observed.range,[13,141])
 assert.equal(rows[4].observed.tier,null)
 assert.equal(JSON.stringify(report),original)
 for(const r of cells){assert.equal(r.day,null);assert.equal(r.tier,null);assert.equal(r.start,null)}
 assert.equal(confirmedText(cells,{}),'')
})

test('spatial comparison ignores OCR line order and excludes cropped right column',()=>{
 const shuffled={...report,lines:[...report.lines].reverse().map(l=>({...l,words:[...l.words].reverse()}))}
 // Synthetic adversarial word outside the 8 complete cells must never enter the denominator.
 shuffled.lines.push({words:[{text:'21-22',box:{x:274,y:365,width:20,height:10}}]})
 assert.deepEqual(compare(sampleCells(shuffled)),rows)
 assert.deepEqual(sampleCells({...report,image_sha256:'unrelated'}),[])
})

test('human CSV does not authorize import; year, per-field checks and status remain required',()=>{
 const filled=sampleCells(report).map((r,i)=>({...r,day:Number(truth[i]['确认日']),start:Number(truth[i]['确认起集']),end:Number(truth[i]['确认止集']),tier:truth[i]['确认会员'].toLowerCase()}))
 const context={year:2026,month:10,yearConfirmed:true,monthConfirmed:true}
 assert.equal(confirmedText(filled,context),'')
 for(const r of filled)r.checks={date:true,episode:true,tier:true,status:true}
 assert.equal(confirmedText(filled,context),'') // CSV does not establish expected/confirmed/actual status.
 for(const r of filled)r.status='confirmed' // Simulate separate manual choice; not OCR accuracy.
 assert.equal(confirmedText(filled,{...context,yearConfirmed:false}),'')
 assert.equal(confirmedText(filled,context).split('\n').length,8)
 filled[0].blocked='裁切';assert.equal(confirmedText(filled,context).split('\n').length,7)
 assert.equal(reviewCounts(cells,context).complete,0)
})

if(process.env.TENCENT_REPORT_PATH)writeFileSync(process.env.TENCENT_REPORT_PATH,JSON.stringify({
 denominator:8,ground_truth:'用户确认的 confirmed-2026.csv，仅离线测试',rawHashes,
 mode:'numbers（既有小字数字辅助），不是标准模式',counts,rows,
 definitions:{number:'集数数字主体；非数字尾部噪声不计入数字正确率，数字1绝不删除',day:'同列日号匹配，不等于完整年月日',tier:'同行会员框明确识别标签',fullDate:'OCR明确年月日；不得从标准答案借用',complete:'完整日期、集数、会员同时正确；仍需人工核对排期性质'},
 excluded:'26/27空白及右侧裁切列；无数据库写入；未修改OCR算法；标准中文结果也原样保留'
},null,2))


test('real eight-cell manual correction replay yields eight selected candidates, independently of OCR scores',()=>{
 const rows=sampleCells(report),context={year:2026,month:10,yearConfirmed:true,monthConfirmed:true}
 rows.forEach((r,i)=>Object.assign(r,{day:Number(truth[i]['确认日']),start:Number(truth[i]['确认起集']),end:Number(truth[i]['确认止集']),status:'confirmed',checks:{date:true,episode:true,tier:false,status:true}}))
 for(const id of [1,5]){
  const source=rows[id-1];source.tier=truth[id-1]['确认会员'].toLowerCase();source.checks.tier=true
  assert.equal(applyTierPreview(rows,tierPreview(rows,id),true),true)
 }
 const text=selectedText(rows,context,rows.map(r=>r.id))
 assert.equal(text.split('\n').length,8)
 truth.forEach(t=>assert.ok(text.includes(`${t['确认年份']}-${t['确认月份']}-${t['确认日']} ${t['确认会员']} 已确认更新第${t['确认起集']}-${t['确认止集']}集`)))
 assert.equal(selectedText(rows,context,[1,5]).split('\n').length,2)
 assert.equal(reviewCounts(rows,context).complete,8)
 assert.deepEqual(counts,{number:3,day:8,tier:4,fullDate:0,complete:0})
 assert.equal(JSON.stringify(report),original)
})
