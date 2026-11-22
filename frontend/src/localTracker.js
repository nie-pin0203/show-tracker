import { beijingDate, scheduleText } from './calendar.js'
import { choice, date, required, timestamp, releasesFor } from './localMedia.js'
import { kinds, recordId, validateTree } from './localStore.js'

const sections = {
  competitions: ['participants','matches','standings'],
  events: ['people','sessions','stages','sets','tickets'],
}
const eventKinds = { competitions: ['esports','sports'], events: ['performance','festival','activity'] }
const kindOf = (name, bundle) => name === 'competitions' ? bundle.discipline.kind : bundle.kind
const routeOf = (name, kind, id) => name === 'media' ? `/media/${id}` : `/${name}/${kind}/${id}`

function moment(value) {
  if (!value) return null
  return value.length === 10 ? date(value) : timestamp(value)
}

const dayOf = value => !value ? null : value.length === 10 ? value : beijingDate(Date.parse(value))
const normalized = text => String(text ?? '').trim().toLocaleLowerCase()

function validateBundle(name, bundle) {
  validateTree(bundle)
  choice(bundle && (name === 'competitions' ? bundle.discipline?.kind : bundle.kind), eventKinds[name], '类别')
  const event = bundle.event
  required(event?.source_id,'来源标识',100)
  required(event.title,'名称')
  timestamp(event.observed_at)
  moment(event.starts_at); moment(event.ends_at)
  for (const section of sections[name]) {
    if (!Array.isArray(bundle[section])) throw new Error('活动子记录格式无效')
    const seen = new Set()
    for (const item of bundle[section]) {
      const id = required(item?.source_id || item?.group_name, '子记录标识')
      if (seen.has(id)) throw new Error('子记录标识不能重复')
      seen.add(id)
      required(item.title || item.name || item.group_name, '子记录名称')
      moment(item.starts_at); moment(item.ends_at); moment(item.as_of)
      if (section === 'participants') item.team_ids ??= []
      if (section === 'sets') item.artist_ids ??= []
      if (['matches','standings'].includes(section)) item.entries ??= []
    }
  }
  if (name === 'competitions') {
    required(bundle.discipline?.code,'赛事项目代码')
    required(bundle.discipline?.name,'赛事项目名称')
  } else if (bundle.kind === 'activity') {
    required(bundle.category?.code,'活动类别代码')
    required(bundle.category?.name,'活动类别名称')
  }
  return bundle
}

export function bundleAction(data, name, params, commit) {
  const bundle = validateBundle(name, structuredClone(params.bundle))
  const kind = kindOf(name, bundle)
  const id = params.competition_id ?? params.event_id
  const existing = id ? data[name].find(row => row.id === id) : null
  if (id && (!existing || params.version !== existing.version)) throw new Error('记录已变化，请重新打开核对')
  const code = name === 'competitions' ? bundle.discipline.code : ''
  if (data[name].some(row => row.id !== id && kindOf(name,row.bundle) === kind
      && (row.bundle.discipline?.code || '') === code && row.bundle.event.source_id === bundle.event.source_id)) {
    throw new Error('已存在同一来源标识，请在原记录编辑')
  }
  const changes = [{ section:'event', before: existing?.bundle.event || null, after: bundle.event }]
  for (const section of sections[name]) for (const item of bundle[section]) {
    const before = existing?.bundle[section].find(row => (row.source_id || row.group_name) === (item.source_id || item.group_name))
    if (JSON.stringify(before) !== JSON.stringify(item)) changes.push({ section, before: before || null, after: item })
  }
  const changed = JSON.stringify(bundle) !== JSON.stringify(existing?.bundle)
  const preview_token = JSON.stringify([data.revision,id,bundle])
  if (!commit) return { changes: changed ? changes : [], preview_token, version: existing?.version || 0 }
  if (params.preview_token !== preview_token) throw new Error('资料已变化，请重新预览')
  const version = (existing?.version || 0) + 1
  if (!changed) return { committed:true, id: existing.id }
  const row = { id: existing?.id ?? recordId(data), version, bundle, history: [
    { version, captured_at: new Date().toISOString(), changes }, ...(existing?.history || []),
  ] }
  if (existing) Object.assign(existing, row)
  else data[name].push(row)
  return { committed:true, id:row.id }
}

export function bundleRead(data, name, id, filters = {}) {
  if (id) {
    const row = data[name].find(item => item.id === Number(id))
    if (!row) throw new Error('找不到该记录')
    return row
  }
  const source = data[name].filter(({ bundle }) => !filters.kind || kindOf(name, bundle) === filters.kind)
  const options = key => [...new Map(source.flatMap(({ bundle }) => bundle[key] ? [[bundle[key].code, bundle[key]]] : [])).values()]
  const items = source.map(({ id, bundle }) => ({
    ...bundle.event, id, kind: kindOf(name,bundle),
    discipline_name: bundle.discipline?.name, discipline: bundle.discipline?.code,
    category_name: bundle.category?.name, category: bundle.category?.code,
    ...bundle.performance, ...bundle.festival,
    first_day: bundle.sessions?.map(row => dayOf(row.starts_at)).filter(Boolean).sort()[0],
    cities: bundle.sessions?.map(row => normalized(row.city)) || [],
  })).filter(row => normalized(row.title).includes(normalized(filters.q))
      && (!filters.status || row.status === filters.status)
      && (!filters.discipline || row.discipline === filters.discipline)
      && (!filters.category || row.category === filters.category)
      && (!filters.format || row.format === filters.format)
      && (!filters.city || row.cities.some(city => city.includes(normalized(filters.city)))))
  return { enabled:true, items, disciplines:options('discipline'), categories:options('category') }
}

function targets(data) {
  return [
    ...data.shows.map(show => ({ target:`media:${show.id}`, kind:'media', title:show.title,
      route:routeOf('media','media',show.id), favorite:show.is_favorite })),
    ...['competitions','events'].flatMap(name => data[name].map(row => {
      const kind = kindOf(name,row.bundle)
      return { target:`${kind}:${row.id}`, kind, title:row.bundle.event.title, route:routeOf(name,kind,row.id) }
    })),
  ]
}

export function followList(data, filters = {}) {
  const entries = targets(data).filter(row => normalized(row.title).includes(normalized(filters.q))).map(row => {
    const saved = data.follows.find(follow => follow.target === row.target)
    return { version:0, lead_minutes:null, state:row.favorite ? 'active' : 'cancelled', ...row, ...saved }
  })
  return { enabled:true, items:entries.filter(row => row.state !== 'cancelled'),
    candidates:entries.filter(row => row.state === 'cancelled') }
}

export function updateFollow(data, body) {
  const target = targets(data).find(row => row.target === body.target)
  if (!target) throw new Error('关注对象不存在')
  const existing = data.follows.find(row => row.target === body.target)
  if (body.version !== (existing?.version || 0)) throw new Error('关注已有修改，请重新打开')
  const row = { target: body.target, version: (existing?.version || 0) + 1,
    state: choice(body.state,['active','paused','cancelled'],'关注状态'), lead_minutes: null }
  if (existing) Object.assign(existing,row)
  else data.follows.push(row)
  if (target.kind === 'media') {
    const show = data.shows.find(show => `media:${show.id}` === row.target)
    show.is_favorite = row.state === 'active'
    show.version++
  }
}

export function trackerCalendar(data, filters) {
  const active = new Set(followList(data).items.filter(row => row.state === 'active').map(row => row.target))
  const entries = []
  function append({ id, text, start, end, category, title, status, route, url, target, city }) {
    const day = dayOf(start), end_day = dayOf(end)
    if (!day || day > filters.end || (end_day || day) < filters.start
        || filters.category && filters.category !== category || filters.target && filters.target !== target
        || filters.followed && !active.has(target) || filters.city && !normalized(city).includes(normalized(filters.city))) return
    entries.push({ key: id, title, text, category, day, end_day, starts_at: start, status,
      city, source_url: url || '', route, target, mock: false })
  }
  for (const row of data.schedules) {
    const show = data.shows.find(item => item.id === row.show_id)
    append({ id: `schedule/${row.id}`, title: show.title, start: row.update_date, status: row.schedule_status,
      text: scheduleText({ ...row, category:show.category }), category: 'media',
      route: routeOf('media','media',show.id), url:row.source, target:`media:${show.id}` })
  }
  for (const row of releasesFor(data).filter(row => row.is_current)) {
    append({ id:`release/${row.id}`, title:row.title, start:row.release_date, status:row.release_status,
      text:row.release_channel || '电影发行', category:'media', route:routeOf('media','media',row.show_id),
      url:row.release_url, target:`media:${row.show_id}` })
  }
  for (const name of ['competitions','events']) for (const row of data[name]) {
    const { bundle } = row, category = kindOf(name,bundle)
    const sections = name === 'competitions' ? [bundle.event,...bundle.matches] : [...bundle.sessions,...bundle.tickets,...bundle.sets]
    sections.forEach((part, index) => append({ id:`${name}/${row.id}/${index}`,
      text:part === bundle.event ? '' : part.title, title:bundle.event.title, start:part.starts_at,
      end:part.ends_at, url:part.source_url, status:part.status, city:part.city,
      route:routeOf(name,category,row.id), category, target:`${category}:${row.id}` }))
  }
  return { enabled:true, items:entries }
}

export function saveDisplay(data, body) {
  if (!Array.isArray(body.categories) || body.categories.length !== kinds.length
      || new Set(body.categories).size !== kinds.length || !body.categories.every(key => kinds.includes(key))
      || !Array.isArray(body.hidden) || !body.hidden.every(key => kinds.includes(key))) throw new Error('首页设置无效')
  data.display = { categories:[...body.categories], hidden:[...body.hidden], followed_by_default:!!body.followed_by_default }
}
