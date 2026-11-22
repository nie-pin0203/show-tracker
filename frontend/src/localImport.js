import { matchingPlatform, showById, upsertWork, videoIdentity } from './localMedia.js'
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

const field = (value, evidence = '') => ({ value: value ?? null, evidence: evidence ? [evidence] : [],
  reason: value == null ? '缺少明确证据，请人工补充' : null, confirmed: false })

export async function parseText({ text, source_url, platform }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 30000) throw new Error('粘贴文本需为 1～30000 字')
  const lines = text.split(/\r?\n/).map(line => line.trim())
  const find = (re, transform = x => x) => {
    const matches = lines.flatMap(line => {
      const match = re.exec(line)
      return match ? [[transform(match[1]), line]] : []
    })
    return matches.length === 1 ? field(...matches[0]) : field(null)
  }
  let link
  try { link = videoIdentity(source_url) } catch { /* An editable unknown field remains visible. */ }
  const align = link?.platform === platform ? link : null
  const rating = find(/^豆瓣评分\s*[:：]?\s*(\d+(?:\.\d+)?)\s*分?$/, Number)
  const fields = {
    title: find(/^(?:作品名称|作品名|名称|片名|剧名|节目名|标题)\s*[:：]\s*(.+)$/),
    category: find(/^(?:类型|分类)\s*[:：]\s*(电视剧|综艺|国漫|动漫|电影)$/, v => ({电视剧:'drama',综艺:'variety',国漫:'animation',动漫:'animation',电影:'movie'})[v]),
    source_id: field(align?.source_id, source_url), source_url: field(align?.url, source_url),
    premiere_date: find(/^(?:开播日期|首映日期)\s*[:：]\s*(\d{4}-\d{2}-\d{2})$/),
    total_episodes: find(/^\s*(?:总集数[:：]\s*|共\s*)(\d+)\s*[集期]?$/, Number),
    latest_episode: find(/^更新至\s*(\d+)\s*(?:\/\s*\d+)?\s*集$/, Number),
    audience: field(null), captured_at: field(null),
    score: platform === '豆瓣' ? rating : field(null),
    rating_count: platform === '豆瓣' ? find(/^(\d+)\s*人评分$/, Number) : field(null),
    rating_source: field(platform === '豆瓣' && rating.value != null ? platform : null, rating.evidence[0]),
    rating_url: field(platform === '豆瓣' && rating.value != null ? align?.url : null, source_url),
  }
  // The explicit format is also emitted by the existing screenshot correction tools.
  const schedules = lines.flatMap(line => {
    const match = /^(\d{4}-\d{2}-\d{2})\s+(SVIP|VIP|免费|非会员)\s*(预计|已确认|实际)?\s*更新\s*第?(\d+)\s*(?:[-–—至]\s*(\d+))?\s*([集期])/.exec(line)
    if (!match) return []
    const [, day, tier, status, start, end, unit] = match
    const part = line.includes('上期') ? 'upper' : line.includes('下期') ? 'lower' : 'full'
    const isPeriod = unit === '期' && !end
    const values = { update_date: day, audience: ({ VIP:'vip', SVIP:'svip', 免费:'free', 非会员:'free' })[tier],
      schedule_status: ({ 预计:'expected', 已确认:'confirmed', 实际:'actual' })[status] || 'expected',
      episode_start: isPeriod ? null : Number(start), episode_end: isPeriod ? null : Number(end || start),
      planned_count: Number(end || start) - Number(start) + 1, period_number: isPeriod ? Number(start) : null,
      period_date: null, period_part: isPeriod ? part : null }
    return [{ evidence: line, confirmed: false, fields: Object.fromEntries(Object.entries(values).map(([k,v]) => [k, field(v,line)])) }]
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const text_hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return { fields, schedules, text_hash, warnings: ['仅识别有完整日期、明确层级和期/集号的原文。其余内容请手动核对。'] }
}
