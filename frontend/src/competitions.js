export const eventTypes = { league: '联赛', cup: '杯赛', tournament: '锦标赛' }
export const statuses = {
  expected: '预计', confirmed: '已确认', in_progress: '进行中',
  completed: '已结束', postponed: '延期', cancelled: '取消',
}
export const outcomes = { win: '胜', loss: '负', draw: '平' }
export const sections = { event: '赛事', participants: '参赛对象', matches: '比赛', standings: '排名' }

const beijing = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
})

export function displayMoment(value) {
  if (!value) return '待定'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}（时间未注明）`
  return `${beijing.format(new Date(value))}（北京时间）`
}

export function compareMatches(a, b) {
  const order = value => !value ? Infinity : Date.parse(value.length === 10 ? `${value}T00:00:00+08:00` : value)
  return order(a.starts_at) - order(b.starts_at) || a.title.localeCompare(b.title, 'zh-CN')
}
