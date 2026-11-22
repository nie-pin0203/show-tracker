// All date arithmetic uses UTC+8, independent of the browser's local timezone.
export function beijingDate(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10)
}

export function addDays(day, count) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10)
}

export function untilBeijingMidnight(now = Date.now()) {
  return Date.parse(`${addDays(beijingDate(now), 1)}T00:00:00+08:00`) - now
}

export function scheduleStats(items) {
  const works = new Set(), episodes = new Set(), unknown = new Set()
  let countOnly = 0
  for (const item of items) {
    works.add(item.show_id)
    if (item.planned_count === 0) continue
    if (item.planned_count == null) {
      unknown.add(item.show_id)
    } else if (item.episode_start == null || item.episode_end == null) {
      if (items.filter(r => r.show_id === item.show_id).length === 1) countOnly += item.planned_count
      else unknown.add(item.show_id)
    } else {
      for (let n = item.episode_start; n <= item.episode_end; n++) episodes.add(`${item.show_id}:${n}`)
    }
  }
  return { showCount: works.size, episodeCount: unknown.size ? null : episodes.size + countOnly, knownCount: episodes.size + countOnly, unknownCount: unknown.size }
}

export const scheduleLabels = { expected:'预计排期', confirmed:'已确认排期', actual:'实际更新' }
export const audienceLabels = { free:'免费', vip:'VIP', svip:'SVIP' }

export function scheduleText(item) {
  const part = {full:'',upper:'（上期）',lower:'（下期）'}[item.period_part] ?? ''
  if (item.period_date != null) return `${item.period_date}期${part}`
  if (item.period_number != null) return `第${item.period_number}期${part}`
  const unit = item.category === 'variety' ? '期' : '集'
  if (item.episode_start == null || item.episode_end == null) return item.planned_count == null ? '更新内容未知' : `更新${item.planned_count}${unit}（具体编号未知）`
  return item.episode_start === item.episode_end ? `第${item.episode_start}${unit}` : `第${item.episode_start}–${item.episode_end}${unit}`
}

export function scheduleSummary(items) {
  const episodes = new Set(), periods = new Set(), parts = new Set(), unknownE = new Set(), unknownP = new Set()
  let extraE = 0, extraP = 0
  for (const r of items) {
    const variety = r.category === 'variety'
    const target = variety ? periods : episodes, unknown = variety ? unknownP : unknownE
    if (r.planned_count === 0) continue
    if (r.period_date != null || r.period_number != null) {
      const key = `${r.show_id}:${r.period_date != null ? `d:${r.period_date}` : `n:${r.period_number}`}`
      periods.add(key); parts.add(`${key}:${r.period_part ?? 'full'}`)
    } else if (r.planned_count == null) unknown.add(r.show_id)
    else if (r.episode_start != null && r.episode_end != null) {
      for (let n=r.episode_start;n<=r.episode_end;n++) target.add(`${r.show_id}:n:${n}`)
    } else if (items.filter(x => x.show_id === r.show_id).length === 1) {
      if (variety) extraP += r.planned_count
      else extraE += r.planned_count
    } else unknown.add(r.show_id)
  }
  for (const sid of new Set(items.map(r => r.show_id))) {
    if ([...periods].some(p => p.startsWith(`${sid}:d:`)) && [...periods].some(p => p.startsWith(`${sid}:n:`))) unknownP.add(sid)
  }
  return {showCount:new Set(items.filter(r => r.planned_count !== 0).map(r => r.show_id)).size,
    episodeCount:unknownE.size || !items.length ? null : episodes.size+extraE,
    periodCount:unknownP.size || !items.length ? null : periods.size+extraP, partCount:parts.size}
}
