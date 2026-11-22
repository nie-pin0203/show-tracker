const databaseName = 'show-tracker-local-v1'
const tables = ['shows', 'schedules', 'ratings', 'links', 'releases', 'competitions', 'events', 'follows']
export const kinds = ['media', 'esports', 'sports', 'performance', 'festival', 'activity']

export function emptyLibrary() {
  return { version: 1, revision: 0, nextId: 1, ...Object.fromEntries(tables.map(name => [name, []])),
    display: { categories: [...kinds], hidden: [], followed_by_default: false } }
}

let opening
function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前浏览器无法使用本地数据存储。'))
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('library')
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); opening = null }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch(error => { opening = null; throw error })
  return opening
}

export async function withLibrary(operation, write = false) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('library', write ? 'readwrite' : 'readonly')
    const store = transaction.objectStore('library')
    const reading = store.get('current')
    let result, failure
    reading.onsuccess = () => {
      try {
        const data = reading.result ?? emptyLibrary()
        result = operation(data)
        if (write) {
          data.revision++
          store.put(data, 'current')
        }
      } catch (error) { failure = error; transaction.abort() }
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('本地保存中断。'))
  })
}

export function recordId(data) { return data.nextId++ }

export function safeUrl(value) {
  if (!value) return null
  let url
  try { url = new URL(value) } catch { throw new Error('请输入有效的网址') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 1000) {
    throw new Error('网址仅支持 HTTP 或 HTTPS')
  }
  return url.href
}

export function validateTree(value, depth = 0, key = '') {
  if (depth > 20) throw new Error('JSON 嵌套过深')
  if (Array.isArray(value)) {
    if (value.length > 20000) throw new Error('记录数超过上限')
    for (const child of value) validateTree(child, depth + 1)
  } else if (value && typeof value === 'object') {
    for (const [name, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(name)) throw new Error('JSON 含无效字段')
      validateTree(child, depth + 1, name)
    }
  } else if (value != null && (key.endsWith('_url') || key === 'url')) {
    if (typeof value !== 'string') throw new Error('网址字段格式无效')
    safeUrl(value)
  }
}

export const BACKUP_SIZE = 12 * 1024 * 1024

export async function exportLibrary() {
  return withLibrary(data => JSON.stringify({ app: 'show-tracker-local', ...data }, null, 2))
}

export function readBackup(text) {
  if (new TextEncoder().encode(text).length > BACKUP_SIZE) throw new Error('JSON 文件须在 12 MiB 以内')
  const { app, ...data } = JSON.parse(text)
  if (app !== 'show-tracker-local' || data.version !== 1 || !tables.every(name => Array.isArray(data[name]))) {
    throw new Error('请选择由 Show Tracker 本地版导出的 JSON')
  }
  validateTree(data)
  const ids = new Set()
  function takeId(row) {
    if (!Number.isSafeInteger(row?.id) || row.id < 1 || ids.has(row.id)) throw new Error('记录标识无效或重复')
    ids.add(row.id)
  }
  for (const name of tables.filter(name => name !== 'follows')) for (const row of data[name]) takeId(row)
  const shows = new Map(data.shows.map(show => [show.id, show]))
  for (const show of data.shows) {
    if (typeof show.title !== 'string' || !show.title.trim() || !['drama','variety','animation','movie'].includes(show.category)
        || !Array.isArray(show.platforms) || !Number.isSafeInteger(show.version) || show.version < 1
        || !Number.isInteger(show.watched_episodes) || show.watched_episodes < 0
        || typeof show.is_favorite !== 'boolean') throw new Error('作品格式无效')
    for (const platform of show.platforms) {
      takeId(platform)
      if (typeof platform.platform !== 'string' || typeof platform.source_id !== 'string'
          || !['free','vip','svip'].every(key => platform.observations?.[key])) throw new Error('平台资料无效')
    }
  }
  for (const name of ['schedules', 'ratings', 'links', 'releases']) for (const row of data[name]) {
    const show = shows.get(row.show_id)
    if (!show || (row.platform_id != null && !show.platforms.some(p => p.id === row.platform_id))) {
      throw new Error('文件存在没有关联作品或平台的记录')
    }
    if (name === 'schedules' && (typeof row.update_date !== 'string' || (row.episode_end ?? 0) > 10000
        || (row.episode_start ?? 0) < 0 || row.episode_end - row.episode_start > 5000)) throw new Error('排期格式无效')
  }
  for (const name of ['competitions','events']) for (const row of data[name]) {
    const bundle = row.bundle
    const sections = name === 'competitions' ? ['participants','matches','standings'] : ['people','sessions','stages','sets','tickets']
    if (typeof bundle?.event?.title !== 'string' || typeof bundle.event.source_id !== 'string'
        || !Array.isArray(row.history) || !sections.every(section => Array.isArray(bundle[section]))) {
      throw new Error('赛事或活动格式无效')
    }
  }
  if (!Array.isArray(data.display?.categories) || !Array.isArray(data.display.hidden)
      || !data.display.categories.every(kind => kinds.includes(kind))) throw new Error('首页设置格式无效')
  if (data.follows.some(row => typeof row?.target !== 'string' || !Number.isSafeInteger(row.version))) {
    throw new Error('关注记录格式无效')
  }
  data.nextId = [...ids].reduce((max, id) => Math.max(max, id), 0) + 1
  if (!Number.isSafeInteger(data.nextId)) throw new Error('记录标识超出范围')
  return data
}

export async function importLibrary(text) {
  const incoming = readBackup(text)
  return withLibrary(current => {
    const revision = current.revision
    Object.assign(current, incoming, { revision })
    return current.shows.length
  }, true)
}
