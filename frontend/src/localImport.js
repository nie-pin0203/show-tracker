import { matchingPlatform, showById, upsertWork } from './localMedia.js'
import { safeUrl, validateTree } from './localStore.js'

function csvRows(content) {
  const lines = []
  let line = [], cell = '', quoted = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (c === '"' && (!cell || quoted)) {
      if (quoted && content[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      line.push(cell); cell = ''
      if (c !== ',') {
        if (c === '\r' && content[i + 1] === '\n') i++
        if (line.some(Boolean)) lines.push(line)
        line = []
      }
    } else cell += c
  }
  if (quoted) throw new Error('CSV 引号未闭合')
  line.push(cell)
  if (line.some(Boolean)) lines.push(line)
  const headers = lines.shift()?.map(key => key.trim())
  if (!headers || headers.some(key => !key) || new Set(headers).size !== headers.length) throw new Error('CSV 列名为空或重复')
  return lines.map(row => {
    if (row.length !== headers.length) throw new Error('CSV 各行列数应与表头一致')
    return Object.fromEntries(headers.map((key, index) => [key, row[index]]))
  })
}

export function importRows(data, body, method, commit) {
  if (typeof body.content !== 'string' || new TextEncoder().encode(body.content).length > 1024 * 1024
      || !['csv','json'].includes(body.format)) throw new Error('请选择 1 MiB 以内的 JSON 或 CSV')
  const content = body.content.replace(/^\uFEFF/, '')
  const rows = body.format === 'json' ? JSON.parse(content) : csvRows(content)
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('每批需要 1～500 条记录')
  validateTree(rows)
  const token = JSON.stringify([data.revision, body.format, content, body.decisions || {}, !!body.confirm_links])
  // Explicit checkbox decisions may be made after preview. The file and database version must match.
  if (commit) {
    let preview
    try { preview = JSON.parse(body.preview_token) } catch { throw new Error('请重新预览') }
    if (!Array.isArray(preview) || JSON.stringify(preview.slice(0, 4)) !== JSON.stringify(JSON.parse(token).slice(0, 4))) {
      throw new Error('数据或处置已变化，请重新预览')
    }
  }
  const draft = structuredClone(data)
  const items = [], errors = [], counts = { 新增: 0, 更新: 0, 跳过: 0 }
  let conflictCount = 0
  rows.forEach((row, index) => {
    try {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('每行须为作品对象')
      const matched = matchingPlatform(draft, row.platform, row.source_id, safeUrl(row.source_url))
      const existing = matched.show || (row.link_show_id ? showById(draft, row.link_show_id) : null)
      const decision = body.decisions?.[index + 1]
      const changes = []
      if (existing) {
        for (const key of ['title','category','poster_url','premiere_date','total_episodes']) {
          if (row[key] != null && row[key] !== '' && existing[key] != null && String(existing[key]) !== String(row[key])) {
            changes.push({ kind: key, before: existing[key], after: row[key] })
          }
        }
        if (row.update_date && matched.item) {
          const prior = draft.schedules.find(plan => plan.platform_id === matched.item.id
            && plan.update_date === row.update_date && plan.audience === row.audience && plan.confirmed
            && plan.schedule_status === (row.schedule_status || 'expected')
            && String(plan.period_number ?? '') === String(row.period_number || '')
            && String(plan.period_date ?? '') === String(row.period_date || ''))
          if (prior && ['episode_start','episode_end','planned_count'].some(key =>
            row[key] != null && row[key] !== '' && String(row[key]) !== String(prior[key]))) {
            changes.push({ kind: '已核实排期', before: prior, after: row })
          }
        }
      }
      const conflicts = []
      if (changes.length && !body.confirm_overwrite && decision !== 'new') conflicts.push('本条将覆盖已存本机资料，请核对新旧值')
      if (existing && !matched.item && row.link_show_id && !body.confirm_links) conflicts.push('新增平台关联需要你确认')
      const skip = decision === 'skip' || decision === 'keep'
      let action = conflicts.length || skip ? '跳过' : existing ? '更新' : '新增'
      let show = existing
      if (conflicts.length && !skip) conflictCount++
      if (action !== '跳过') {
        const snapshot = () => JSON.stringify([existing, draft.nextId,
          draft.schedules.filter(item => item.show_id === existing?.id && item.update_date === row.update_date)])
        const before = existing && snapshot()
        show = upsertWork(draft, row, method === 'file' ? 'file_import' : 'manual')
        if (before && snapshot() === before) action = '跳过'
      }
      counts[action]++
      items.push({ ...row, row: index + 1, action, changes, existing: !!existing, conflicts: skip ? [] : conflicts,
        show_id: show?.id, view: row.update_date ? 'calendar' : 'work' })
    } catch (error) { errors.push({ row: index + 1, message: error.message }) }
  })
  if (commit) {
    if (errors.length || conflictCount) throw new Error(errors[0]?.message || '仍有未确认的冲突')
    Object.assign(data, draft)
  }
  return { valid: !errors.length, errors, counts, conflict_count: conflictCount, preview_token: token,
    committed: commit, items }
}

