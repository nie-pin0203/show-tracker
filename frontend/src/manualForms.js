import { eventTypes } from './competitions.js'
import { date, matchingPlatform, number, required, upsertWork } from './localMedia.js'
import { safeUrl } from './localStore.js'
import { bundleAction } from './localTracker.js'

export const videoPlatforms = ['腾讯视频', '爱奇艺', '优酷', '哔哩哔哩', '芒果TV', '其他']
export const activityTypes = { exhibition: '展览', launch: '发布会', convention: '漫展', theatre: '话剧', musical: '音乐剧', comedy: '脱口秀', other: '其他' }

export function manualMoment(day, time) {
  if (!day) {
    if (time) throw new Error('请先选择日期')
    return null
  }
  date(day)
  if (!time) return day
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('时间无效')
  return `${day}T${time}:00+08:00`
}

export function createManual(data, kind, fields) {
  const title = required(fields.title, '名称')
  const notes = fields.notes?.trim() || ''
  if (notes.length > 1000) throw new Error('备注不能超过1000字')
  if (kind === 'media') {
    const url = safeUrl(fields.url)
    if (url && matchingPlatform(data, fields.platform, null, url).show) {
      throw new Error('该平台链接已有作品，请编辑已有记录')
    }
    const show = upsertWork(data, { title, category: fields.category, platform: fields.platform,
      source_url: url, total_episodes: number(fields.total_episodes, '总集数/期数', 1),
      source_note: notes }, 'manual')
    show.notes = notes
    return { id: show.id }
  }
  const starts = manualMoment(fields.date, fields.time)
  const sourceId = `manual-${data.nextId}`
  const event = { source_id: sourceId, title, description: notes, starts_at: starts,
    ends_at: null, status: 'expected', source_url: safeUrl(fields.url), observed_at: new Date().toISOString() }
  let bundle, collection
  if (['esports', 'sports'].includes(kind)) {
    if (!Object.hasOwn(eventTypes, fields.type)) throw new Error('请选择赛事类型')
    collection = 'competitions'
    bundle = { discipline: { kind, code: 'manual', name: kind === 'esports' ? '电竞' : '体育' },
      event: { ...event, event_type: fields.type, notes }, participants: [], matches: [], standings: [] }
  } else {
    collection = 'events'
    if (!['performance', 'festival', 'activity'].includes(kind)) throw new Error('活动类别无效')
    const category = fields.categoryOption || { code: fields.type, name: activityTypes[fields.type] }
    if (kind === 'activity' && !category.name) throw new Error('请选择活动类型')
    bundle = { kind, event, performance: kind === 'performance' ? { format: 'concert', tour_name: '' } : null,
      festival: kind === 'festival' ? { edition: '' } : null, category: kind === 'activity' ? category : null,
      people: fields.artist?.trim() ? [{ source_id: `${sourceId}-artist`, name: fields.artist.trim(), role: 'artist', source_url: null }] : [],
      sessions: starts || fields.venue?.trim() ? [{ source_id: `${sourceId}-session`, title,
        starts_at: starts, ends_at: null, venue: fields.venue?.trim() || '', city: '', status: 'expected', source_url: event.source_url }] : [],
      stages: [], sets: [], tickets: [] }
  }
  const preview = bundleAction(data, collection, { bundle }, false)
  return bundleAction(data, collection, { bundle, preview_token: preview.preview_token }, true)
}
