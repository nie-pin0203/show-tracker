<script setup>
import { computed, ref, watch } from 'vue'
import { readEditableWork, reviewWorkImport, commitWorkImport } from './library'
import { manualRecord } from './importing'
import { scheduleText, scheduleLabels } from './calendar'
import { releaseFields, releaseKinds, releaseStatuses } from './releases'

const props = defineProps({ shows: Array })
const emit = defineEmits(['changed'])
const preview = ref(null), error = ref(''), message = ref(''), busy = ref(false)
const confirmOverwrite = ref(false), confirmLinks = ref(false), selection = ref(''), schedules = ref([])
const ratings = ref([]), releases = ref([])
const fresh = () => ({ title:'', platform:'腾讯视频', source_id:'', source_url:'', category:'drama', audience:'unknown',
  captured_at:new Date().toISOString(), source_note:'' })
const form = ref(fresh())
const isMovie = computed(() => form.value.category === 'movie')
const platforms = computed(() => props.shows.filter(s => !s.is_mock).flatMap(s => s.platforms.map(p => ({...p, display:`${s.title} · ${p.platform}（作品ID ${s.id}）` }))))
const fields = [
  ['title','作品名称','text'], ['source_id','平台源ID','text'], ['source_url','作品URL','url'], ['poster_url','海报URL','url'],
  ['premiere_date','开播日期','date'], ['total_episodes','总集/期数','number'], ['latest_episode','最新集数（明确数字）','number'],
  ['update_date','明确更新日期','date'], ['planned_count','当天更新集数','number'], ['episode_start','起始集号（可选）','number'], ['episode_end','结束集号（可选）','number'],
  ['period_number','综艺数字期号（与日期期号二选一）','number'], ['period_date','综艺日期期号','date'],
  ['score','评分（0～10）','number'], ['rating_source','评分来源名称','text'], ['rating_url','评分出处URL','url'], ['rating_count','已证实的评分人数','number'],
  ['captured_at','采集时间（含时区）','text'], ['source_note','合法来源/许可说明','text'], ['link_show_id','人工关联作品ID（新增平台时可选）','number']
]
const episodicFields = new Set(['audience','schedule_status','period_part', 'total_episodes','latest_episode',
  'update_date','planned_count','episode_start','episode_end','period_number','period_date'])
const visibleFields = computed(() => isMovie.value ? fields.filter(([key]) => !episodicFields.has(key)) : fields)
function payload() {
  const record = Object.fromEntries(Object.entries(form.value).filter(([key]) =>
    isMovie.value ? !episodicFields.has(key) : !releaseFields.includes(key)))
  return { format: 'json', content: JSON.stringify([manualRecord(record)]) }
}
function invalidate() { preview.value = null; confirmOverwrite.value = false; confirmLinks.value = false; message.value = '' }
watch(form, invalidate, { deep:true })
async function loadRecord() {
  if (!selection.value) { form.value = fresh(); schedules.value = []; ratings.value = []; releases.value = []; return }
  busy.value = true; error.value = ''
  try {
    const data = await readEditableWork(selection.value)
    form.value = data.record
    schedules.value = data.schedules
    ratings.value = data.ratings
    releases.value = data.releases ?? []
  }
  catch(e) { error.value = e.message } finally { busy.value = false }
}
function editSchedule(row) {
  for (const key of ['update_date','audience','planned_count','episode_start','episode_end','schedule_status','period_number','period_date','period_part']) form.value[key] = row[key]
}
function editRating(row) {
  Object.assign(form.value, {score:row.score, rating_source:row.source, rating_url:row.source_url, rating_count:row.rating_count})
}
function editRelease(row) {
  for (const key of releaseFields) form.value[key] = row[key] ?? ''
  form.value.source_note = row.source_note
  form.value.captured_at = new Date().toISOString()
}
async function run(action) {
  error.value = ''; message.value = ''; busy.value = true
  try {
    const body = payload()
    if (!body) throw new Error('请先选择文件')
    const write = action === 'commit' ? commitWorkImport : reviewWorkImport
    const result = await write({ ...body,
      ...(action === 'commit' ? {preview_token:preview.value.preview_token, confirm_overwrite:confirmOverwrite.value, confirm_links:confirmLinks.value} : {}) },
      'manual')
    preview.value = result
    if (result.committed) {
      message.value = `已保存：新增 ${result.counts['新增']}，更新 ${result.counts['更新']}，跳过 ${result.counts['跳过']}。`
      emit('changed')
    }
  } catch(e) { error.value = e.message; preview.value = null }
  finally { busy.value = false }
}
</script>

<template>
  <details class="import-panel" id="local-editor">
    <summary>编辑已有作品、排期和评分</summary>

    <fieldset :disabled="busy">
      <label>载入现有作品 <select v-model="selection" @change="loadRecord"><option value="">请选择作品</option><option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.display }}</option></select></label>
      <div v-if="selection" class="import-grid">
        <label>平台 <select v-model="form.platform"><option v-for="name in ['腾讯视频','爱奇艺','优酷','哔哩哔哩','芒果TV','其他','豆瓣']" :key="name">{{ name }}</option></select></label>
        <label>类型 <select v-model="form.category"><option value="drama">电视剧</option><option value="variety">综艺</option><option value="animation">国漫</option><option value="movie">电影</option></select></label>
        <template v-if="!isMovie">
        <label>集数/排期身份 <select v-model="form.audience"><option value="unknown">未知（不能填排期）</option><option value="vip">VIP</option><option value="free">免费</option><option value="svip">SVIP</option></select></label>
        <label>排期状态 <select v-model="form.schedule_status"><option value="">未提供（有排期时默认为预计）</option><option v-for="(label,key) in scheduleLabels" :key="key" :value="key">{{ label }}</option></select></label>
        <label>综艺分期 <select v-model="form.period_part"><option value="">未分期</option><option value="full">整期</option><option value="upper">上期</option><option value="lower">下期</option></select></label>
        </template>
        <label v-for="[key,label,type] in visibleFields" :key="key">{{ isMovie && key === 'premiere_date' ? '作品首映日期' : label }}<input v-model="form[key]" :type="type" :step="key === 'score' ? '0.1' : '1'" :min="type === 'number' ? '0' : undefined" maxlength="1000"></label>
        <template v-if="isMovie">
          <label>发行标识<input v-model="form.release_id" placeholder="例如 cinema-cn" maxlength="100"></label>
          <label>发行类型<select v-model="form.release_kind"><option value="">请选择</option><option v-for="(label,key) in releaseKinds" :key="key" :value="key">{{ label }}</option></select></label>
          <label>发行状态<select v-model="form.release_status"><option value="">请选择</option><option v-for="(label,key) in releaseStatuses" :key="key" :value="key">{{ label }}</option></select></label>
          <label>发行日期<input v-model="form.release_date" type="date"></label>
          <label>地区<input v-model="form.release_region" maxlength="1000"></label>
          <label>发行渠道<input v-model="form.release_channel" maxlength="1000"></label>
          <label>发行出处 URL<input v-model="form.release_url" type="url" maxlength="1000"></label>
        </template>
      </div>
      <p>空白保留已有字段，未知不填0。修改已有评分会追加历史；原历史不删除。不同平台各自保存信息，不按名称合并。</p>
      <p v-if="isMovie">只建档时留空发行字段。同一场发行改期或取消时保留标识，新场次使用不同标识。</p>
      <p v-else>期号模式每条表示一期的整期/上期/下期，数量填1或留空，不填集号范围。修改日期、层级、状态或期号会新增独立记录，原记录保留。</p>
      <details v-if="releases.length"><summary>已有发行：选择后修订并保留历史</summary><button v-for="row in releases" :key="row.id" type="button" @click="editRelease(row)">{{ row.release_id }} · {{ releaseKinds[row.release_kind] }} · {{ row.release_date || '日期待定' }}</button></details>
      <details v-if="schedules.length"><summary>已有排期：选择后编辑</summary><button v-for="row in schedules" :key="row.id" type="button" @click="editSchedule(row)">{{ row.update_date }} · {{ row.audience }} · {{ scheduleLabels[row.schedule_status] }} · {{ scheduleText({...row, category:form.category}) }}</button></details>
      <details v-if="ratings.length"><summary>已有评分：选择后修订并保留历史</summary><button v-for="row in ratings" :key="row.id" type="button" @click="editRating(row)">{{ row.source }} · {{ row.score }} · {{ row.captured_at }}</button></details>
    </fieldset>
    <button :disabled="busy || !selection" @click="run('preview')">{{ busy ? '处理中…' : '校验并预览' }}</button>
    <button type="button" @click="selection='';loadRecord();invalidate()">取消</button>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <section v-if="preview && !preview.committed" aria-label="修改预览">
      <p v-for="e in preview.errors" :key="e.row" class="error">第{{ e.row }}条：{{ e.message }}</p>
      <template v-if="preview.valid">
        <p>新增{{ preview.counts['新增'] }} · 更新{{ preview.counts['更新'] }} · 冲突{{ preview.conflict_count }} · 跳过{{ preview.counts['跳过'] }}。冲突为本批中需确认的记录数；预览不写入数据库。</p>
        <div class="preview-list"><details v-for="item in preview.items" :key="item.row"><summary>第{{ item.row }}条 · {{ item.platform }} · {{ item.title }} · {{ item.action }}</summary>
          <p v-for="conflict in item.conflicts" :key="conflict" class="error">{{ conflict }}</p>
          <div v-for="(change,index) in item.changes" :key="index"><b>{{ change.kind }}</b><pre>原值：{{ JSON.stringify(change.before, null, 2) }}
新值：{{ JSON.stringify(change.after, null, 2) }}</pre></div>
        </details></div>
        <p v-if="preview.items.some(i => i.conflicts.length)" class="error">存在保护冲突。请展开上方逐条差异核对，未确认时拒绝写入。</p>
        <label><input type="checkbox" v-model="confirmOverwrite"> 我已核对差异，明确允许本批次覆盖已确认记录/更旧时间的数据</label><br>
        <label><input type="checkbox" v-model="confirmLinks"> 我已人工确认本批次指定的跨平台作品关联</label><br>
        <button :disabled="busy" @click="run('commit')">保存修改</button>
      </template>
    </section>
  </details>
</template>

<style scoped>
.import-panel{margin:20px 0;padding:18px;border:1px solid #ddd;border-radius:12px;background:#fff}.import-panel summary{cursor:pointer;font-weight:600}.import-panel p{font-size:13px;line-height:1.7}.import-panel label{font-size:13px}.import-panel input,.import-panel select{padding:8px;border:1px solid #ccc;border-radius:5px;max-width:100%}.import-panel button{margin:10px 8px 10px 0;padding:8px 12px}.import-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px}.import-grid label{display:flex;flex-direction:column;gap:5px}fieldset{border:0;margin:15px 0;padding:0}.preview-list{max-height:480px;overflow:auto}.preview-list details{padding:10px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.error{color:#a82d24}
</style>
