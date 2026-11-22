export const SAMPLE_HASH = "cf0edaba9d346d5bf50bf51e316725548561f00d02d1ccfd58f10096ac64c26b"
// Only the exact user-provided image is supported; regions are evidence locators, not answers.
export function regionText(report,box) {
  return (report.lines??[]).flatMap(l=>l.words??[]).filter(w=>{
    const b=w.box;if(!b)return false
    const x=b.x+b.width/2,y=b.y+b.height/2
    return x>=box.x && x<box.x+box.width && y>=box.y && y<box.y+box.height
  }).sort((a,b)=>a.box.y-b.box.y || a.box.x-b.box.x).map(w=>w.text).join(' ')
}
export function sampleCells(report) {
  if(report.image_sha256!==SAMPLE_HASH || report.width!==297 || report.height!==669)return []
  return [360,413].flatMap((y,row)=>[120,157,194,231].map((x,col)=>{
    const box={x,y,width:36,height:20},dateBox={x,y:332,width:36,height:22},tierBox={x:20,y,width:36,height:20}
    return {id:row*4+col+1,imageHash:SAMPLE_HASH,box,dateBox,tierBox,raw:regionText(report,box),dateRaw:regionText(report,dateBox),tierRaw:regionText(report,tierBox),
      day:null,start:null,end:null,tier:null,status:null,blocked:'',checks:{date:false,episode:false,tier:false,status:false}}
  }))
}
export function fullDate(context,row) {
  if(Object.hasOwn(row,'date')) {
    if(!row.yearConfirmed || !/^\d{4}-\d{2}-\d{2}$/.test(row.date??''))return null
    const parsed=new Date(row.date+'T00:00:00Z')
    return Number(row.date.slice(0,4))>0 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===row.date ? row.date : null
  }
  if(!context.yearConfirmed || !context.monthConfirmed)return null
  const [y,m,d]=[context.year,context.month,row.day].map(Number)
  if(!Number.isInteger(y)||y<1||y>9999||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>31)return null
  const text=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  const parsed=new Date(text+'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===text ? text : null
}
export function complete(row,context) {
  return !row.blocked && fullDate(context,row)!==null && row.start!==null && row.end!==null
    && Number.isInteger(Number(row.start)) && Number(row.start)>0 && Number.isInteger(Number(row.end))
    && Number(row.end)>=Number(row.start) && Number(row.end)<=10000
    && ['free','vip','svip'].includes(row.tier) && ['expected','confirmed','actual'].includes(row.status)
    && ['date','episode','tier','status'].every(k=>row.checks[k]===true)
}
export function confirmedText(rows,context) {
  const tiers={free:'免费',vip:'VIP',svip:'SVIP'},statuses={expected:'预计',confirmed:'已确认',actual:'实际'}
  return rows.filter(r=>complete(r,context)).map(r=>`${fullDate(context,r)} ${tiers[r.tier]} ${statuses[r.status]}更新第${Number(r.start)}-${Number(r.end)}集 [截图证据 ${r.imageHash??context.imageHash??'本机原图（见诊断）'} 格${r.id}；年份由用户指定]`).join('\n')
}
export function reviewCounts(rows,context) {
  return {numberReviewed:rows.filter(r=>!r.blocked && r.checks.episode).length,dateReviewed:rows.filter(r=>!r.blocked && r.checks.date && fullDate(context,r)).length,
    tierReviewed:rows.filter(r=>!r.blocked && r.checks.tier).length,complete:rows.filter(r=>complete(r,context)).length,
    blocked:rows.filter(r=>r.blocked).length,accuracy:{number:null,date:null,tier:null,complete:null}}
}

// Membership propagation is an explicit manual operation, never inferred from colour.
export function tierPreview(rows,sourceId) {
  const source=rows.find(r=>r.id===sourceId)
  if(!source || source.blocked || !source.checks.tier || !['free','vip','svip'].includes(source.tier))return null
  return {sourceId,tier:source.tier,targets:rows.filter(r=>r.id!==source.id && (Object.hasOwn(source,'rowGroup') ? source.rowGroup.trim()!=='' && r.rowGroup===source.rowGroup : r.box.y===source.box.y) && !r.blocked)
    .map(r=>({id:r.id,old:r.tier,next:source.tier}))}
}

export function regionBox(a,b,width,height) {
  if(![a.x,a.y,b.x,b.y,width,height].every(Number.isFinite)||width<=0||height<=0)return null
  const x=Math.max(0,Math.min(width,Math.min(a.x,b.x))),y=Math.max(0,Math.min(height,Math.min(a.y,b.y)))
  const right=Math.max(0,Math.min(width,Math.max(a.x,b.x))),bottom=Math.max(0,Math.min(height,Math.max(a.y,b.y)))
  return right-x>=2 && bottom-y>=2?{x,y,width:right-x,height:bottom-y}:null
}
export function duplicateRegion(rows,box,exceptId=null) {
  return rows.some(r=>r.id!==exceptId && ['x','y','width','height'].every(k=>Math.abs(r.box[k]-box[k])<1))
}
export function manualCell(report,box,id) {
  return {id,box:{...box},dateBox:null,tierBox:null,raw:regionText(report,box),dateRaw:'',tierRaw:'',
    imageHash:report.image_sha256??null,date:'',yearConfirmed:false,rowGroup:'',start:null,end:null,tier:null,status:null,blocked:'',
    checks:{date:false,episode:false,tier:false,status:false}}
}
export function updateRegion(row,box,report) {
  row.box={...box};row.raw=regionText(report,box);row.dateBox=null;row.tierBox=null;row.dateRaw='';row.tierRaw=''
  for(const key of Object.keys(row.checks))row.checks[key]=false
}
export function evidenceCrops(row) {
  return [{box:row.dateBox,label:'日期证据'},{box:row.box,label:'集数选区证据'},{box:row.tierBox,label:'会员证据'}].filter(item=>item.box)
}
export function applyTierPreview(rows,preview,approved=false) {
  if(!approved || !preview || JSON.stringify(tierPreview(rows,preview.sourceId))!==JSON.stringify(preview))return false
  for(const target of preview.targets){const r=rows.find(r=>r.id===target.id);r.tier=preview.tier;r.checks.tier=true}
  return true
}
export function selectedText(rows,context,ids) {
  return confirmedText(rows.filter(r=>ids.includes(r.id)),context)
}
export function recordChange(history,before,after) {
  if(before!==after)history.push({at:new Date().toISOString(),origin:'manual',before:JSON.parse(before),after:JSON.parse(after)})
}
