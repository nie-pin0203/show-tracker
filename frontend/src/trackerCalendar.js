import { addDays } from './calendar.js'

export function calendarRange(view, day) {
  if (view === 'day') return { start: day, end: day }
  const d = new Date(`${day}T00:00:00Z`)
  if (view === 'week') {
    const start = addDays(day, -(d.getUTCDay() + 6) % 7)
    return { start, end: addDays(start, 6) }
  }
  const start = day.slice(0, 7) + '-01'
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return { start, end: addDays(d.toISOString().slice(0, 10), -1) }
}

export function moveDate(view, day, direction) {
  if (view !== 'month') return addDays(day, direction * (view === 'week' ? 7 : 1))
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + direction)
  return d.toISOString().slice(0, 10)
}

export function daysIn({ start, end }) {
  const days = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return days
}

export function recordsOn(items, day) {
  return items.filter(row => row.day <= day && (row.end_day || row.day) >= day)
    .sort((a, b) => {
      const time = row => row.starts_at?.length > 10 ? Date.parse(row.starts_at) : -Infinity
      return time(a) - time(b) || a.title.localeCompare(b.title, 'zh-CN')
    })
}
