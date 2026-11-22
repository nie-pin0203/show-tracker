import { manualRecord } from './importing.js'

export const reviewTime = (now=Date.now()) => new Date(now+8*3600000).toISOString().replace('Z','+08:00')

export function freshness(timestamp, now=Date.now()) {
  const age=now-Date.parse(timestamp)
  if (!Number.isFinite(age)) return '查看时间未知'
  if (age<0) return '查看时间在未来，请核对'
  if (age<3600000) return '距人工查看不足1小时'
  if (age<86400000) return `距人工查看${Math.floor(age/3600000)}小时`
  return `距人工查看${Math.floor(age/86400000)}天；建议重新核对`
}

export function buildPasteRecords(result, {platform,targetId,reviewedAt}) {
  if (!result) throw new Error('请先解析原文')
  const raw={}
  for (const [key,field] of Object.entries(result.fields)) {
    if (field.value === null || field.value === undefined || field.value === '') continue
    if (!field.confirmed) throw new Error(`请先核对字段：${key}`)
    raw[key]=field.value
  }
  for (const key of ['title','category','source_id','source_url','captured_at']) {
    if (!raw[key]) throw new Error(`请补充并确认字段：${key}`)
  }
  const record=manualRecord(raw)
  record.platform=platform
  if (record.score != null && (record.rating_source!==platform || record.rating_url!==record.source_url)) {
    throw new Error('评分来源必须与所选平台及详情URL一致，请重新核对')
  }
  if (record.score == null) {
    delete record.rating_count; delete record.rating_source; delete record.rating_url
  }
  record.source_note=`人工粘贴核对；来源：${platform}；核对时间：${reviewedAt}；原文SHA256：${result.text_hash}`
  if (targetId) record.link_show_id=Number(targetId)
  if (!result.schedules.length) return [record]
  if (platform==='豆瓣') throw new Error('豆瓣不能作为播出排期平台')
  return result.schedules.map((row,index) => {
    if (!row.confirmed) throw new Error(`请逐条确认第${index+1}条排期，或删除该条`)
    const schedule=manualRecord(Object.fromEntries(Object.entries(row.fields).map(([k,f]) => [k,f.value])))
    for (const key of ['update_date','audience','schedule_status','planned_count']) {
      if (schedule[key] == null || schedule[key] === '' || schedule[key] === 'unknown') throw new Error(`第${index+1}条排期缺少明确${key}`)
    }
    if ((schedule.period_number!=null || schedule.period_date!=null) && !schedule.period_part) throw new Error(`第${index+1}条需确认整期/上下期`)
    // A schedule's tier does not establish who can watch a cumulative latest-episode count.
    const planRecord={...record,...schedule}
    delete planRecord.latest_episode
    return planRecord
  }).concat(record.latest_episode!=null ? [record] : [])
}
