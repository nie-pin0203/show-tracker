import { buildPasteRecords } from './pasteImport.js'

const hosts={'v.qq.com':'腾讯视频','www.iqiyi.com':'爱奇艺','iqiyi.com':'爱奇艺',
  'v.youku.com':'优酷','www.youku.com':'优酷','movie.douban.com':'豆瓣'}
const titleLine=/^(?:作品名称|作品名|名称|片名|剧名|节目名|标题)\s*[:：]/
export const emptyGroup = () => ({platform:'',sourceUrl:'',original:'',targetId:'',result:null,groupConfirmed:false,reason:'请确认本组只属于一部作品及一个来源平台'})

export function groupPastedText(text) {
  if (!text.trim() || text.length>30000) throw new Error('批量原文需为1～30000字')
  const groups=[]
  for (const section of text.split(/^\s*(?:-{3,}|={3,})\s*$/m).filter(x=>x.trim())) {
    const lines=section.trim().split(/\r?\n/), starts=[]
    lines.forEach((line,i)=>{if(titleLine.test(line.trim())) starts.push(i)})
    // A preamble containing platform/URL may belong to either work. Never assign it silently.
    const chunks=starts.length>1 && starts[0]===0
      ? starts.map((start,i)=>lines.slice(start,starts[i+1]??lines.length).join('\n')) : [section.trim()]
    for (const chunk of chunks) {
      const urls=[...new Set(chunk.match(/https:\/\/[^\s<>"'，；。]+/g)??[])]
      const valid=urls.filter(url=>{try{return !!hosts[new URL(url).hostname]}catch{return false}})
      const titles=chunk.split(/\r?\n/).filter(l=>titleLine.test(l.trim()))
      const labels=[...new Set([...chunk.matchAll(/^\s*(?:平台|来源平台)\s*[:：]\s*(腾讯视频|爱奇艺|优酷|豆瓣)\s*$/gm)].map(m=>m[1]))]
      const fromUrl=valid.length===1 ? hosts[new URL(valid[0]).hostname] : ''
      const unambiguous=titles.length===1 && valid.length===1 && (labels.length===0 || (labels.length===1 && labels[0]===fromUrl))
      groups.push({...emptyGroup(),original:chunk,sourceUrl:valid.length===1 ? valid[0] : '',
        platform:labels.length===1 && (!fromUrl || labels[0]===fromUrl) ? labels[0] : labels.length===0 ? fromUrl : '',
        reason:unambiguous?'按明确名称行和唯一作品URL分组，请人工核对':
          '分组不确定：缺少唯一名称/URL，平台冲突或含多作品。请修改本组，或用独立一行 --- 分隔后重新分组'})
    }
  }
  if (!groups.length) throw new Error('未找到非空作品组')
  if (groups.length>20) throw new Error('每批最多20组，请分批粘贴')
  return groups
}

export function buildBatchRecords(groups,reviewedAt) {
  if (!groups.length || groups.length>20) throw new Error('每批需1～20个作品组')
  if(groups.reduce((n,g)=>n+g.original.length,0)>30000) throw new Error('本批原文总量超过30000字')
  const records=groups.flatMap((g,i)=>{
    if(!g.groupConfirmed) throw new Error(`请确认第${i+1}组的作品及平台归属`)
    try{return buildPasteRecords(g.result,{platform:g.platform,targetId:g.targetId,reviewedAt})}
    catch(e){throw new Error(`第${i+1}组：${e.message}`)}
  })
  if(records.length>500) throw new Error('入库记录超过500条，请分批')
  return records
}

export function sortedRecordRows(records) {
  return records.map((record,i)=>({...record,row:i+1})).sort((a,b)=>(a.update_date??'9999').localeCompare(b.update_date??'9999')
    ||a.platform.localeCompare(b.platform)||a.audience.localeCompare(b.audience)||a.row-b.row)
}

const draftKey=namespace=>`show-tracker:paste-draft:v1:${namespace}`
export function saveDraft(storage,namespace,data) {
  if(!namespace) throw new Error('尚未确认项目，草稿未保存')
  const encoded=JSON.stringify({version:1,namespace,savedAt:new Date().toISOString(),data})
  if(new TextEncoder().encode(encoded).length>1024*1024) throw new Error('草稿超过1MiB，请分批保存；旧草稿仍保留')
  storage.setItem(draftKey(namespace),encoded)
}
export function loadDraft(storage,namespace) {
  const raw=storage.getItem(draftKey(namespace))
  if(!raw) return null
  if(new TextEncoder().encode(raw).length>1024*1024) throw new Error('草稿过大，未自动恢复')
  const draft=JSON.parse(raw)
  if(draft.version!==1 || draft.namespace!==namespace || !Array.isArray(draft.data?.groups)
    || !draft.data.groups.length || draft.data.groups.length>20) throw new Error('草稿版本或结构无效，未自动恢复')
  for(const g of draft.data.groups) {
    if(typeof g.original!=='string' || g.original.length>30000 || typeof g.sourceUrl!=='string' || typeof g.platform!=='string') throw new Error('草稿字段损坏')
    // Reviews and ID associations cannot outlive the database snapshot they referred to.
    g.groupConfirmed=false;g.targetId=''
    if(g.result) {
      if(!g.result.fields || !Array.isArray(g.result.schedules)) throw new Error('草稿解析结果损坏')
      for(const field of Object.values(g.result.fields)) field.confirmed=false
      for(const row of g.result.schedules) row.confirmed=false
    }
  }
  if(!Number.isInteger(draft.data.active)) draft.data.active=0
  return draft
}
export function clearDraft(storage,namespace) {storage.removeItem(draftKey(namespace))}
