export const sourceLabel = kind => ({
  mock: '模拟数据', manual: '手动核实', file_import: '文件导入（提供者声明）',
}[kind] ?? '来源未知')

export async function readImportFile(file) {
  if (!file || file.size > 1024 * 1024) throw new Error('请选择不超过1MiB的文件')
  const format = file.name.split('.').pop().toLowerCase()
  if (!['json', 'csv'].includes(format)) throw new Error('仅支持UTF-8 JSON或CSV文件')
  const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  return { format, content }
}

export function manualRecord(form) {
  const numeric = new Set(['total_episodes','latest_episode','planned_count','episode_start','episode_end','period_number','score','rating_count','link_show_id'])
  return Object.fromEntries(Object.entries(form).filter(([,v]) => v !== '' && v !== null && v !== undefined)
    .map(([k,v]) => {
      if (!numeric.has(k)) return [k,v]
      const number = Number(v)
      if (!Number.isFinite(number)) throw new Error(`${k}必须为有效数字`)
      return [k,number]
    }))
}

export function platformLatest(p, audience) {
  return p.observations?.[audience]?.latest_episode != null ? p.observations[audience] : p.public_observation ?? {}
}
