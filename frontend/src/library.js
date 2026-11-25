import { addDays, beijingDate } from './calendar.js'
import { withLibrary } from './localStore.js'
import { addRating, date, deleteShow, releasesFor, schedulesOn,
  showById, viewShow, watchState } from './localMedia.js'
import { createManual } from './manualForms.js'
import { safeUrl } from './localStore.js'
import { importRows } from './localImport.js'
import { bundleAction, bundleRead, followList, saveDisplay, trackerCalendar, updateFollow } from './localTracker.js'

function scheduleDay(data, day, releases) {
  return { date: day, items: schedulesOn(data, day), releases: releases.filter(row => row.release_date === day) }
}

export function readToday() {
  const today = beijingDate()
  return withLibrary(data => ({ today, ...scheduleDay(data, today, releasesFor(data).filter(row => row.is_current)) }))
}

export function readWeek(startDate) {
  const start = date(startDate) || beijingDate()
  return withLibrary(data => {
    const releases = releasesFor(data).filter(row => row.is_current)
    return { days: Array.from({ length: 7 }, (_, index) => scheduleDay(data, addDays(start, index), releases)) }
  })
}

export function listShows() {
  return withLibrary(data => data.shows.map(show => viewShow(data, show)))
}

export function readShow(id) {
  return withLibrary(data => {
    const show = showById(data, id)
    return { ...viewShow(data, show), schedules: data.schedules.filter(row => row.show_id === show.id),
      links: data.links.filter(row => row.show_id === show.id),
      rating_history: data.ratings.filter(row => row.show_id === show.id).sort((a, b) => b.id - a.id),
      releases: releasesFor(data, show.id) }
  })
}

export function saveWatchState(id, change) {
  return withLibrary(data => watchState(data, id, change), true)
}

export function removeShow(id) {
  return withLibrary(data => deleteShow(data, id), true)
}

export function listLinks() {
  return withLibrary(data => data.links.map(row => ({ ...row, title: showById(data, row.show_id).title })))
}

export function removeLink(id) {
  return withLibrary(data => { data.links = data.links.filter(row => row.id !== Number(id)) }, true)
}

export function saveDoubanRating(id, fields) {
  return withLibrary(data => {
    if (!safeUrl(fields.url) || new URL(fields.url).hostname !== 'movie.douban.com' || !fields.reviewed_at) throw new Error('请填写豆瓣作品 URL 和核对日期')
    return addRating(data, showById(data, id), { ...fields, captured_at: fields.reviewed_at,
      rating_source: '豆瓣', rating_url: fields.url })
  }, true)
}

export function readEditableWork(id) {
  const platformId = Number(id)
  return withLibrary(data => {
    const show = data.shows.find(row => row.platforms.some(platform => platform.id === platformId))
    if (!show) throw new Error('找不到作品的平台资料')
    const platform = show.platforms.find(row => row.id === platformId)
    return {
      record: { title: show.title, category: show.category, platform: platform.platform,
        source_id: platform.source_id, source_url: platform.source_url, poster_url: show.poster_url,
        total_episodes: show.total_episodes, premiere_date: show.premiere_date, captured_at: new Date().toISOString(),
        audience: 'unknown', source_note: platform.source_note, link_show_id: show.id },
      schedules: data.schedules.filter(row => row.platform_id === platformId),
      ratings: data.ratings.filter(row => row.show_id === show.id),
      releases: releasesFor(data, show.id).filter(row => row.platform_id === platformId),
    }
  })
}

export function reviewWorkImport(fields, source) {
  return withLibrary(data => importRows(data, fields, source, false))
}

export function commitWorkImport(fields, source) {
  return withLibrary(data => importRows(data, fields, source, true), true)
}

export function readActivities(collection, id, filters) {
  return withLibrary(data => bundleRead(data, collection, id, filters))
}

export function reviewActivity(collection, fields) {
  return withLibrary(data => bundleAction(data, collection, fields, false))
}

export function commitActivity(collection, fields) {
  return withLibrary(data => bundleAction(data, collection, fields, true), true)
}

export function readCalendar(filters) {
  return withLibrary(data => trackerCalendar(data, filters))
}

export function listFollows(filters) {
  return withLibrary(data => followList(data, filters))
}

export function saveFollow(fields) {
  return withLibrary(data => updateFollow(data, fields), true)
}

export function readDisplay() {
  return withLibrary(data => data.display)
}

export function saveDisplayOptions(fields) {
  return withLibrary(data => saveDisplay(data, fields), true)
}

export function saveManual(kind, fields) {
  return withLibrary(data => createManual(data, kind, fields), true)
}
