<script setup>
import { computed, ref } from 'vue'
import { saveManual } from './library'
import { activityTypes, videoPlatforms } from './manualForms'
import { eventTypes } from './competitions'
import { useOfflineForm } from './useOfflineForm'
const props = defineProps({ kind: { type: String, default: 'media' }, categories: Array })
const emit = defineEmits(['saved'])
const fresh = () => ({ title: '', category: 'drama', platform: '腾讯视频', url: '', total_episodes: '',
  type: ['esports','sports'].includes(props.kind) ? 'tournament' : 'other', date: '', time: '', artist: '', venue: '', notes: '' })
const form = ref(fresh()), busy = ref(false), error = ref('')
const { clear } = useOfflineForm(form, `manual-add/${props.kind}`, 0, draft => typeof draft?.title === 'string')
const media = computed(() => props.kind === 'media')
const competition = computed(() => ['esports','sports'].includes(props.kind))
const label = computed(() => media.value ? '作品' : competition.value ? '赛事' : props.kind === 'activity' ? '活动' : '演出')
const types = computed(() => competition.value ? eventTypes : { ...activityTypes,
  ...Object.fromEntries((props.categories || []).map(c => [c.code, c.name])) })
function reset() { form.value = fresh(); clear(); error.value = '' }
async function save() {
  busy.value = true; error.value = ''
  try {
    const categoryOption = props.categories?.find(c => c.code === form.value.type)
    const result = await saveManual(props.kind, { ...form.value, categoryOption })
    reset(); emit('saved', result.id)
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
</script>
<template>
  <form class="manual-form" @submit.prevent="save">
    <fieldset :disabled="busy" class="manual-grid">
      <label class="wide">{{ label }}名称<input v-model="form.title" required maxlength="200"></label>
      <template v-if="media">
        <label>作品类型<select v-model="form.category"><option value="drama">电视剧</option><option value="movie">电影</option><option value="variety">综艺</option><option value="animation">国漫</option></select></label>
        <label>播放平台<select v-model="form.platform"><option v-for="p in videoPlatforms" :key="p">{{ p }}</option></select></label>
        <label class="wide">作品链接（选填）<input v-model="form.url" type="url" maxlength="1000"></label>
        <label>总集数/期数（选填）<input v-model="form.total_episodes" type="number" min="1" max="10000" step="1"></label>
      </template>
      <template v-else>
        <label v-if="competition || kind === 'activity'">{{ label }}类型<select v-model="form.type"><option v-for="(name, key) in types" :key="key" :value="key">{{ name }}</option></select></label>
        <label v-else class="wide">艺人/团体（选填）<input v-model="form.artist" maxlength="200"></label>
        <label>日期（北京时间）<input v-model="form.date" type="date"></label>
        <label>时间（选填，北京时间）<input v-model="form.time" type="time"></label>
        <label v-if="!competition" class="wide">{{ label }}地点（选填）<input v-model="form.venue" maxlength="200"></label>
        <label v-if="kind === 'activity'" class="wide">活动链接（选填）<input v-model="form.url" type="url" maxlength="1000"></label>
      </template>
      <label :class="{ wide: !media }">备注（选填）<textarea v-model="form.notes" maxlength="1000" rows="2"></textarea></label>
      <div class="wide manual-actions"><button class="tracker-button" type="submit">添加</button><button class="tracker-button secondary" type="button" @click="reset">清空表单</button></div>
    </fieldset>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </form>
</template>
<style scoped>
.manual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border:0;padding:0;margin:12px 0;min-width:0}.wide{grid-column:1/-1}label{display:grid;gap:6px;font-size:14px}input,select,textarea{min-width:0;width:100%;min-height:44px;padding:9px;border:1px solid #cdd9db;border-radius:7px;font:inherit;box-sizing:border-box}.manual-actions{display:flex;flex-wrap:wrap;gap:10px}@media(max-width:650px){.manual-grid{grid-template-columns:1fr}}
</style>
