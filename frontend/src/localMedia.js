import { audienceLabels, beijingDate, scheduleLabels } from './calendar.js'
import { recordId, safeUrl } from './localStore.js'
import { releaseKinds, releaseStatuses } from './releases.js'

export const platforms = ['腾讯视频', '爱奇艺', '优酷', '哔哩哔哩', '芒果TV', '其他', '豆瓣']
const categories = ['drama', 'variety', 'animation', 'movie']
const audiences = Object.keys(audienceLabels)
const now = () => new Date().toISOString()

export function required(text, name, max = 200) {
  if (typeof text !== 'string' || !text.trim() || text.length > max) throw new Error(`请填写有效的${name}`)
  return text.trim()
}

export function choice(value, choices, name) {
  if (!choices.includes(value)) throw new Error(`${name}无效`)
  return value
}

export function number(value, name, min = 0, max = 10000) {
  if (value == null || value === '') return null
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${name}须为 ${min}～${max} 的整数`)
  return result
}

export function date(value, name = '日期') {
  if (!value) return null
  const parsed = new Date(value)
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name}须为有效的 YYYY-MM-DD`)
  }
  return value
}

export function timestamp(value) {
  if (!value) return now()
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) throw new Error('核对时间须包含时区')
  date(value.slice(0, 10))
  return value
}

function withoutEmpty(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined && value !== ''))
}

export function showById(data, id) {
  const show = data.shows.find(row => row.id === Number(id))
  if (!show) throw new Error('找不到该作品')
  return show
}

export function deleteShow(data, id) {
  const show = showById(data, id)
  data.shows = data.shows.filter(row => row.id !== show.id)
  for (const name of ['schedules','links','ratings','releases']) data[name] = data[name].filter(row => row.show_id !== show.id)
  data.follows = data.follows.filter(row => row.target !== `media:${show.id}`)
}

export function currentRatings(data, id) {
  const ordered = data.ratings.filter(row => row.show_id === id)
    .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at) || b.id - a.id)
  return [...new Map(ordered.filter((row, index) => ordered.findIndex(x => x.source === row.source) === index)
    .map(row => [row.source, row])).values()]
}

export function viewShow(data, show) {
  return { ...show, ratings: currentRatings(data, show.id),
    has_schedule: data.schedules.some(row => row.show_id === show.id) }
}

export function schedulesOn(data, day) {
  return data.schedules.filter(row => row.update_date === day).map(row => {
    const show = showById(data, row.show_id)
    const rating = currentRatings(data, show.id).find(item => item.source === '豆瓣')
    const platform = show.platforms.find(item => item.id === row.platform_id)
    const observation = platform?.observations[row.audience]
    const latest = observation?.latest_episode == null ? platform?.public_observation : observation
    return { ...show, ...row, ...latest, score: rating?.score, rating_source: rating?.source }
  })
}

export function releasesFor(data, showId) {
  return data.releases.filter(row => showId == null || row.show_id === showId)
    .map(row => ({ title: showById(data, row.show_id).title, ...row }))
}

export function watchState(data, id, body) {
  const show = showById(data, id)
  const state = () => ({ version: show.version, is_favorite: show.is_favorite, watched_episodes: show.watched_episodes })
  if (body.version != null && body.version !== show.version) {
    throw Object.assign(new Error('本机记录已更改，请核对后再保存。'), { current: state() })
  }
  if (Object.hasOwn(body, 'is_favorite')) {
    if (typeof body.is_favorite !== 'boolean') throw new Error('收藏状态无效')
    show.is_favorite = body.is_favorite
    const follow = data.follows.find(row => row.target === `media:${show.id}`)
    if (follow) { follow.state = show.is_favorite ? 'active' : 'cancelled'; follow.version++ }
  } else {
    const value = number(body.watched_episodes, '已看集数', 0, show.total_episodes ?? 10000)
    if (value == null) throw new Error('请填写已看集数')
    show.watched_episodes = value
  }
  show.version++
  return state()
}

function addShow(data, fields) {
  const show = { id: recordId(data), title: fields.title, category: fields.category, total_episodes: null,
    premiere_date: null, poster_url: null, platforms: [], watched_episodes: 0, is_favorite: false,
    is_mock: false, version: 1, ...fields }
  data.shows.push(show)
  return show
}

export function addRating(data, show, row, sourceKind = 'manual') {
  const score = Number(row.score)
  if (row.score == null || row.score === '' || !Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error('评分须为 0～10 的数字')
  }
  const rating = { show_id: show.id, score, source: required(row.rating_source, '评分来源'),
    source_url: safeUrl(row.rating_url), rating_count: number(row.rating_count, '评分人数', 0, 1000000000),
    captured_at: timestamp(row.captured_at), confirmed: sourceKind === 'manual', source_kind: sourceKind }
  const existing = data.ratings.some(item => Object.entries(rating).every(([key, value]) => item[key] === value))
  if (!existing) data.ratings.push({ id: recordId(data), ...rating })
}

function addSchedule(data, show, platform, row, checked, captured) {
  if (!row.update_date) throw new Error('请填写明确排期日期')
  if (!platform || platform.platform === '豆瓣' || show.category === 'movie') throw new Error('该作品需填写播出平台或电影发行记录')
  const status = choice(row.schedule_status || 'expected', Object.keys(scheduleLabels), '排期状态')
  const from = number(row.episode_start, '起始集号', 1)
  const to = number(row.episode_end, '结束集号', 1)
  const period = number(row.period_number, '数字期号', 1)
  const periodDate = date(row.period_date, '日期期号')
  const count = number(row.planned_count, '更新数量')
  if ((from == null) !== (to == null) || (to != null && (to < from || to - from > 5000))) throw new Error('起止集号无效')
  if (period != null && periodDate || (period != null || periodDate) && (from != null || show.category !== 'variety')) {
    throw new Error('综艺期号与集号区间不能混填')
  }
  const planned = period != null || periodDate ? 1 : from == null ? count : to - from + 1
  if (planned == null || count != null && count !== planned) throw new Error('请填写明确且一致的更新数量')
  const plan = { show_id: show.id, platform_id: platform.id, platform: platform.platform,
    update_date: date(row.update_date), audience: choice(row.audience, audiences, '会员层级'),
    schedule_status: status, episode_start: from, episode_end: to, planned_count: planned, period_number: period,
    period_date: periodDate, period_part: period != null || periodDate
      ? choice(row.period_part || 'full', ['full','upper','lower'], '节目分期') : null,
    captured_at: captured, source_kind: checked ? 'manual' : 'file_import', source: platform.source_url || '人工记录',
    source_note: row.source_note || '', confirmed: checked, is_mock: false }
  const key = ['platform_id','update_date','audience','schedule_status','period_number','period_date','period_part']
  const existing = data.schedules.find(item => key.every(name => item[name] === plan[name]))
  if (existing) {
    if (['episode_start','episode_end','planned_count'].every(name => existing[name] === plan[name])) return false
    Object.assign(existing, plan)
  } else data.schedules.push({ id: recordId(data), ...plan })
  return true
}

function addRelease(data, show, platform, row, captured) {
  if (show.category !== 'movie' || !platform) throw new Error('发行记录仅用于电影')
  const release = { show_id: show.id, platform_id: platform.id, platform: platform.platform,
    release_id: required(row.release_id, '发行标识', 100), release_kind: choice(row.release_kind, Object.keys(releaseKinds), '发行类型'),
    release_status: choice(row.release_status || 'expected', Object.keys(releaseStatuses), '发行状态'),
    release_date: date(row.release_date), release_region: row.release_region || '', release_channel: row.release_channel || '',
    release_url: safeUrl(row.release_url || platform.source_url), captured_at: captured,
    source_note: row.source_note || '', source_kind: platform.source_kind, is_current: true }
  const previous = data.releases.find(item => item.platform_id === platform.id && item.release_id === release.release_id && item.is_current)
  if (previous) {
    if (Object.entries(release).every(([key, value]) => ['captured_at','source_kind'].includes(key) || previous[key] === value)) return
    previous.is_current = false
  }
  data.releases.push({ id: recordId(data), ...release })
}

export function matchingPlatform(data, platform, sourceId, url) {
  for (const show of data.shows) {
    const item = show.platforms.find(row => row.platform === platform
      && ((sourceId && row.source_id === sourceId) || (url && row.source_url === url)))
    if (item) return { show, item }
  }
  return {}
}

export function upsertWork(data, record, sourceKind) {
  const row = withoutEmpty(record)
  const fields = { title: required(row.title, '作品名称'), category: choice(row.category, categories, '作品类型'),
    ...withoutEmpty({ premiere_date: date(row.premiere_date), total_episodes: number(row.total_episodes, '总集数', 1),
      poster_url: safeUrl(row.poster_url) }) }
  const captured = timestamp(row.captured_at)
  const platform = choice(row.platform, platforms, '来源平台')
  const url = safeUrl(row.source_url)
  const sourceId = row.source_id == null ? null : required(row.source_id, '平台源 ID', 1000)
  const matched = matchingPlatform(data, platform, sourceId, url)
  const linked = row.link_show_id == null ? null : showById(data, row.link_show_id)
  if (matched.show && linked && matched.show.id !== linked.id) throw new Error('该平台资料已关联到另一部作品')
  const existing = matched.show || linked
  if (existing && existing.category !== fields.category) throw new Error('作品类型与已建档资料不同')
  if (existing && fields.total_episodes != null && fields.total_episodes < existing.watched_episodes) {
    throw new Error('总集数不能低于现有观看进度')
  }
  const show = existing || addShow(data, fields)
  Object.assign(show, fields)
  const platformItem = matched.item || (linked && !sourceId && !url && show.platforms.find(p => p.platform === platform))
    || { id: recordId(data), platform, source_id: sourceId || url || `local-${show.id}`,
      observations: Object.fromEntries(audiences.map(tier => [tier, {}])), public_observation: {} }
  if (!show.platforms.includes(platformItem)) show.platforms.push(platformItem)
  Object.assign(platformItem, fields, { data_captured_at: captured, source_kind: sourceKind,
    source_url: url || platformItem.source_url || null, source_note: row.source_note || platformItem.source_note || '' })
  if (row.latest_episode != null) {
    const latest = { latest_episode: number(row.latest_episode, '最新集数'), latest_as_of: captured }
    if (audiences.includes(row.audience)) platformItem.observations[row.audience] = latest
    else platformItem.public_observation = latest
  }
  if (['update_date','planned_count','episode_start','episode_end','period_date','period_number'].some(k => row[k] != null)) {
    addSchedule(data, show, platformItem, row, sourceKind === 'manual', captured)
  }
  if (row.score != null) addRating(data, show, { ...row, captured_at: captured }, sourceKind)
  if (row.release_id != null || row.release_date != null || row.release_kind != null) addRelease(data, show, platformItem, row, captured)
  return show
}

