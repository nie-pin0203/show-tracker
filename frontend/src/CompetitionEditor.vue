<script setup>
import { computed, ref, watch } from 'vue'
import { reviewActivity, commitActivity } from './library'
import { eventTypes, outcomes, sections, statuses } from './competitions'
import { useOfflineForm } from './useOfflineForm'

const props = defineProps({ kind: String, initial: Object, disciplines: Array })
const emit = defineEmits(['saved'])
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
const fresh = () => ({
  discipline: { kind: props.kind, code: '', name: '' },
  event: { source_id: '', title: '', event_type: 'tournament', season: '', starts_at: '', ends_at: '',
    status: 'expected', source_url: '', observed_at: now() },
  participants: [], matches: [], standings: [],
})
const bundle = ref(props.initial ? JSON.parse(JSON.stringify(props.initial.bundle)) : fresh())
const { previous, restored, restore, clear } = useOfflineForm(bundle,
  `competition/${props.kind}/${props.initial?.id || 0}`, props.initial?.version || 0,
  draft => draft?.discipline?.kind === props.kind && draft.event && Array.isArray(draft.matches)
    && Array.isArray(draft.participants) && Array.isArray(draft.standings))
const mode = ref('manual'), file = ref(null), preview = ref(null), approved = ref(false)
const busy = ref(false), error = ref('')
const teams = computed(() => bundle.value.participants.filter(p => p.kind === 'team' && p.source_id))
const current = computed(() => props.initial?.bundle)
const labels = { discipline: props.kind === 'esports' ? '游戏' : '体育项目', person: props.kind === 'esports' ? '选手' : '运动员' }
const blankParticipant = () => ({ source_id: '', name: '', kind: 'team', source_url: '', team_ids: [] })
const blankMatch = () => ({ source_id: '', title: '', stage: '', starts_at: '', status: 'expected',
  venue: '', watch_url: '', source_url: '', observed_at: now(), entries: [] })
const blankStanding = () => ({ group_name: '', as_of: '', source_url: '', entries: [] })
function existing(section, index) { return index < (current.value?.[section].length || 0) }
function chooseDiscipline(event) {
  const item = props.disciplines?.find(d => d.code === event.target.value)
  if (item) Object.assign(bundle.value.discipline, item)
}
watch([bundle, file, mode], () => { preview.value = null; approved.value = false }, { deep: true })

async function readFile(event) {
  file.value = null
  error.value = ''
  const selected = event.target.files[0]
  if (!selected) return
  try {
    if (selected.size > 1024 * 1024 || !selected.name.toLowerCase().endsWith('.json')) throw new Error('请选择 1 MiB 以内的 JSON 文件')
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()))
    if (data?.discipline?.kind !== props.kind) throw new Error('文件中的项目类型与当前赛事页面不符')
    file.value = data
  } catch (e) { error.value = e.message }
}

async function run(action) {
  error.value = ''
  busy.value = true
  try {
    const content = mode.value === 'file'
      ? file.value
      : JSON.parse(JSON.stringify(bundle.value, (_, v) => v === '' ? null : v))
    if (!content) throw new Error('请先选择文件')
    const identity = props.initial ? { competition_id: props.initial.id, version: props.initial.version } : {}
    const write = action === 'commit' ? commitActivity : reviewActivity
    const result = await write('competitions', {
      bundle: content, ...identity, ...(action === 'commit' ? { preview_token: preview.value.preview_token } : {}),
    })
    if (result.committed) { clear(); emit('saved', result.id) }
    else { preview.value = result; approved.value = false }
  } catch (e) {
    error.value = e.message
    if (action === 'commit') { preview.value = null; approved.value = false }
  } finally { busy.value = false }
}
</script>

<template>
  <form class="competition-editor" novalidate @submit.prevent="run('preview')">
    <p v-if="restored" role="status">已恢复本机草稿，请核对后提交。</p>
    <p v-if="previous">草稿基于较旧版本。
      <button type="button" @click="restore">载入草稿并重新核对差异</button>
    </p>
    <fieldset :disabled="busy">
      <label v-if="!initial">录入方式
        <select v-model="mode"><option value="manual">手动录入</option><option value="file">导入 JSON</option></select>
      </label>
      <label v-if="mode === 'file'">含一项赛事的 UTF-8 JSON 文件
        <input type="file" accept=".json,application/json" @change="readFile">
      </label>
      <template v-else>
        <p class="muted">时间可填写 YYYY-MM-DD 或带偏移的 ISO 时间（如 2026-11-22T19:00+08:00）。核对时间须带时刻和时区。</p>
        <div class="editor-grid">
          <label v-if="!initial && disciplines?.length">使用已有{{ labels.discipline }}
            <select @change="chooseDiscipline"><option value="">自定义或选择</option><option v-for="d in disciplines" :key="d.code" :value="d.code">{{ d.name }}</option></select>
          </label>
          <label>{{ labels.discipline }}代码<input v-model="bundle.discipline.code" :readonly="!!initial" maxlength="50" placeholder="例如 football"></label>
          <label>{{ labels.discipline }}名称<input v-model="bundle.discipline.name" :readonly="!!initial" maxlength="200"></label>
          <label>赛事源标识<input v-model="bundle.event.source_id" :readonly="!!initial" maxlength="100"></label>
          <label>赛事名称<input v-model="bundle.event.title" maxlength="200"></label>
          <label>类型<select v-model="bundle.event.event_type"><option v-for="(name, value) in eventTypes" :key="value" :value="value">{{ name }}</option></select></label>
          <label>赛季 / 届次<input v-model="bundle.event.season" maxlength="200"></label>
          <label>开始时间<input v-model="bundle.event.starts_at"></label>
          <label>结束时间<input v-model="bundle.event.ends_at"></label>
          <label>状态<select v-model="bundle.event.status"><option v-for="(name, value) in statuses" :key="value" :value="value">{{ name }}</option></select></label>
          <label>赛事来源 URL<input v-model="bundle.event.source_url" type="url" maxlength="1000"></label>
          <label>来源核对时间<input v-model="bundle.event.observed_at"></label>
        </div>
        <details open>
          <summary>参赛对象（{{ bundle.participants.length }}）</summary>
          <div v-for="(p, index) in bundle.participants" :key="index" class="editor-grid child">
            <label>对象源标识<input v-model="p.source_id" :readonly="existing('participants', index)" maxlength="100"></label>
            <label>名称<input v-model="p.name" maxlength="200"></label>
            <label>类别<select v-model="p.kind" :disabled="existing('participants', index)"><option value="team">战队 / 球队</option><option value="person">{{ labels.person }}</option></select></label>
            <label>来源 URL<input v-model="p.source_url" type="url" maxlength="1000"></label>
            <div v-if="p.kind === 'person' && teams.length">
              <span>所属团队</span>
              <label v-for="(team, i) in teams" :key="i" class="editor-check"><input v-model="p.team_ids" type="checkbox" :value="team.source_id">{{ team.name || team.source_id }}</label>
            </div>
            <button v-if="!existing('participants', index)" type="button" @click="bundle.participants.splice(index, 1)">移除草稿</button>
          </div>
          <button type="button" @click="bundle.participants.push(blankParticipant())">添加参赛对象</button>
        </details>
        <details open>
          <summary>赛程与赛果（{{ bundle.matches.length }}）</summary>
          <div v-for="(match, index) in bundle.matches" :key="index" class="child">
            <div class="editor-grid">
              <label>比赛源标识<input v-model="match.source_id" :readonly="existing('matches', index)" maxlength="100"></label>
              <label>比赛名称<input v-model="match.title" maxlength="200"></label>
              <label>阶段<input v-model="match.stage" maxlength="200" placeholder="如小组赛或决赛"></label>
              <label>比赛时间<input v-model="match.starts_at"></label>
              <label>场馆<input v-model="match.venue" maxlength="200"></label>
              <label>状态<select v-model="match.status"><option v-for="(name, value) in statuses" :key="value" :value="value">{{ name }}</option></select></label>
              <label>直播入口<input v-model="match.watch_url" type="url" maxlength="1000"></label>
              <label>来源 URL<input v-model="match.source_url" type="url" maxlength="1000"></label>
              <label>比分 / 赛程核对时间<input v-model="match.observed_at"></label>
            </div>
            <div v-for="(entry, j) in match.entries" :key="j" class="editor-grid child">
              <label>参赛对象<select v-model="entry.participant_id"><option value="">请选择</option><option v-for="(p, i) in bundle.participants.filter(p => p.source_id)" :key="i" :value="p.source_id">{{ p.name || p.source_id }}</option></select></label>
              <label>比分<input v-model.number="entry.score" type="number" min="0" step="1"></label>
              <label>明确赛果<select v-model="entry.outcome"><option :value="null">未知</option><option v-for="(name, value) in outcomes" :key="value" :value="value">{{ name }}</option></select></label>
              <button type="button" @click="match.entries.splice(j, 1)">移除本场参赛对象</button>
            </div>
            <button type="button" @click="match.entries.push({ participant_id: '', score: null, outcome: null })">指定参赛对象</button>
            <button v-if="!existing('matches', index)" type="button" @click="bundle.matches.splice(index, 1)">移除草稿比赛</button>
          </div>
          <button type="button" @click="bundle.matches.push(blankMatch())">添加比赛</button>
        </details>
        <details>
          <summary>排名快照（{{ bundle.standings.length }}）</summary>
          <div v-for="(standing, index) in bundle.standings" :key="index" class="child">
            <div class="editor-grid">
              <label>榜单 / 小组名称<input v-model="standing.group_name" :readonly="existing('standings', index)" maxlength="200"></label>
              <label>排名日期<input v-model="standing.as_of" :readonly="existing('standings', index)" type="date"></label>
              <label>来源 URL<input v-model="standing.source_url" type="url" maxlength="1000"></label>
            </div>
            <div v-for="(entry, j) in standing.entries" :key="j" class="editor-grid child">
              <label>参赛对象<select v-model="entry.participant_id"><option value="">请选择</option><option v-for="(p, i) in bundle.participants.filter(p => p.source_id)" :key="i" :value="p.source_id">{{ p.name || p.source_id }}</option></select></label>
              <label>名次<input v-model.number="entry.rank" type="number" min="1" step="1"></label>
              <label>积分（可选）<input v-model.number="entry.points" type="number" step="any"></label>
              <button type="button" @click="standing.entries.splice(j, 1)">移除排名行</button>
            </div>
            <button type="button" @click="standing.entries.push({ participant_id: '', rank: null, points: null })">添加排名行</button>
            <button v-if="!existing('standings', index)" type="button" @click="bundle.standings.splice(index, 1)">移除草稿榜单</button>
          </div>
          <button type="button" @click="bundle.standings.push(blankStanding())">添加排名快照</button>
        </details>
      </template>
      <button type="submit" class="tracker-button">{{ busy ? '处理中…' : '核对导入预览' }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <section v-if="preview">
        <p v-if="!preview.changes.length" role="status">内容与当前版本一致，无需重复保存。</p>
        <template v-else>
          <p>基础版本 {{ preview.version }} · 新增 {{ preview.changes.filter(c => !c.before).length }} · 更新 {{ preview.changes.filter(c => c.before).length }}</p>
          <details v-for="(change, index) in preview.changes" :key="index">
            <summary>{{ change.before ? '更新' : '新增' }}{{ sections[change.section] }} · {{ change.after.title || change.after.name || change.after.group_name }}</summary>
            <pre v-if="change.before">原记录 {{ JSON.stringify(change.before, null, 2) }}</pre>
            <pre>新记录 {{ JSON.stringify(change.after, null, 2) }}</pre>
          </details>
          <label class="editor-check"><input v-model="approved" type="checkbox">我已核对来源和差异</label>
          <button type="button" class="tracker-button" :disabled="!approved" @click="run('commit')">确认保存</button>
        </template>
      </section>
    </fieldset>
  </form>
</template>

<style scoped>
fieldset { min-width: 0; padding: 0; margin: 0; border: 0; }
.editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 10px; }
label { display: grid; gap: 4px; margin: 4px 0; }
input:not([type=checkbox]), select { width: 100%; min-width: 0; min-height: 44px; padding: 7px; border: 1px solid #cdd9db; border-radius: 7px; }
.editor-check { display: flex; align-items: center; gap: 8px; min-height: 36px; }
.child { padding: 12px; background: #f7f9f9; border-radius: 9px; margin: 8px 0; }
details { margin: 12px 0; font-size: 14px; }
button:not(.tracker-button) { padding: 6px 12px; margin: 4px 6px 4px 0; color: #075a4e; background: #e3f2ed; border-radius: 7px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
