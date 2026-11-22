const pages = new Set(['home', 'discover', 'media', 'calendar', 'film-calendar', 'follows', 'watchlist',
  'tools', 'account', 'messages', 'sources', 'settings'])
const toolAnchors = new Set(['smart-import', 'links-panel', 'current-work', 'local-editor'])

export function resolveRoute(hash) {
  const route = hash.replace(/^#/, '')
  if (route === 'calendar-section') return { page: 'film-calendar', anchor: route }
  if (toolAnchors.has(route)) return { page: 'tools', anchor: route }
  if (/^show-[1-9]\d*$/.test(route)) return { page: 'media', anchor: route }
  const detail = /^\/media\/([1-9]\d{0,18})$/.exec(route)
  if (detail) return { page: 'detail', anchor: '', showId: detail[1] }
  const competition = /^\/competitions\/(esports|sports)(?:\/([1-9]\d{0,18}))?$/.exec(route)
  if (competition) return { page: 'competitions', anchor: '', kind: competition[1], eventId: competition[2] ?? null }
  const event = /^\/events\/(performance|festival|activity)(?:\/([1-9]\d{0,18}))?$/.exec(route)
  if (event) return { page: 'events', anchor: '', kind: event[1], eventId: event[2] ?? null }
  const page = route.startsWith('/') ? route.slice(1) : ''
  return { page: pages.has(page) ? page : 'home', anchor: '' }
}
