<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { readShow, removeShow } from './library'
import { sourceLabel } from './importing'
import { audienceLabels, scheduleLabels, scheduleText } from './calendar'
import ReleaseList from './ReleaseList.vue'

const props = defineProps({ showId: String })
const show = ref(null), error = ref(''), brokenPoster = ref(false)
const labels = { drama: '电视剧', variety: '综艺', animation: '动漫', movie: '电影' }
const releases = computed(() => show.value?.releases.filter(row => row.is_current) || [])
const pastReleases = computed(() => show.value?.releases.filter(row => !row.is_current) || [])
async function load() {
  try {
    show.value = await readShow(props.showId)
    error.value = ''
  }
  catch (e) { error.value = e.message }
}
async function remove() {
  if (!window.confirm('删除这部作品及其排期、评分和进度？')) return
  try {
    await removeShow(props.showId)
    window.dispatchEvent(new Event('tracker-library-changed'))
    window.location.hash = '/media'
  } catch (failure) { error.value = failure.message }
}
onMounted(() => {
  load()
  window.addEventListener('tracker-library-changed', load)
})
onUnmounted(() => window.removeEventListener('tracker-library-changed', load))
</script>

<template>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
  <p v-else-if="!show" role="status">正在读取作品…</p>
  <article v-else class="work-detail">
    <div class="detail-head">
      <img v-if="show.poster_url && !brokenPoster" :src="show.poster_url" :alt="`${show.title}海报`" @error="brokenPoster = true">
      <div>
        <p class="muted">{{ labels[show.category] }}{{ show.is_mock ? ' · 模拟数据' : '' }}</p>
        <h2>{{ show.title }}</h2>
        <p>{{ show.category === 'movie' ? '作品首映日期' : '开播日期' }} · {{ show.premiere_date || '暂无数据' }}</p>
        <p v-if="show.category !== 'movie'">已看 {{ show.watched_episodes }} / {{ show.total_episodes ?? '未知' }} {{ show.category === 'variety' ? '期' : '集' }}</p>
        <p>{{ show.ratings.length ? `${show.ratings[0].source} ${show.ratings[0].score} 分` : '暂无评分' }}</p>
        <a class="tracker-button secondary" :href="`#show-${show.id}`">在作品库管理</a>
        <button type="button" class="tracker-button secondary" @click="remove">删除作品</button>
      </div>
    </div>
    <section v-if="show.category === 'movie'">
      <h2>发行安排</h2>
      <ReleaseList v-if="releases.length" :rows="releases" />
      <p v-else class="muted">暂无已录入的发行记录。</p>
      <details v-if="pastReleases.length"><summary>发行变更历史（{{ pastReleases.length }}）</summary><ReleaseList :rows="pastReleases" /></details>
      <a class="tracker-button secondary" href="#/tools">导入或编辑发行记录</a>
    </section>
    <section v-else>
      <h2>排期</h2>
      <div v-if="show.schedules.length" class="table-wrap">
        <table>
          <thead><tr><th>日期</th><th>平台</th><th>层级</th><th>状态</th><th>内容</th></tr></thead>
          <tbody><tr v-for="row in show.schedules" :key="row.id">
            <td>{{ row.update_date }}</td><td>{{ row.platform }}</td><td>{{ audienceLabels[row.audience] }}</td>
            <td>{{ scheduleLabels[row.schedule_status] }}</td><td>{{ scheduleText({ ...row, category: show.category }) }}<small>{{ row.source_note || row.source }}</small></td>
          </tr></tbody>
        </table>
      </div>
      <p v-else class="muted">暂无已录入的排期。</p>
    </section>
    <section>
      <h2>作品来源</h2>
      <p v-if="!show.platforms.length" class="muted">暂无来源。</p>
      <ul v-else>
        <li v-for="p in show.platforms" :key="p.id">
          <a v-if="p.source_url" :href="p.source_url" class="source-link" target="_blank" rel="noopener noreferrer">{{ p.platform }}{{ p.platform === '芒果TV' ? '（停用）' : '' }}</a>
          <span v-else>{{p.platform}}</span> · {{ sourceLabel(p.source_kind) }} · {{ p.data_captured_at || '核对时间暂无数据' }}
        </li>
      </ul>
    </section>
    <section v-if="show.rating_history.length">
      <details><summary>评分历史（{{ show.rating_history.length }}）</summary>
        <ul><li v-for="rating in show.rating_history" :key="rating.id">
          <a v-if="rating.source_url" :href="rating.source_url" class="source-link" target="_blank" rel="noopener noreferrer">{{ rating.source }}</a>
          <span v-else>{{ rating.source }}</span>
          · {{ rating.score }} 分 · {{ sourceLabel(rating.source_kind) }} · {{ rating.captured_at }}
        </li></ul>
      </details>
    </section>
  </article>
</template>

<style scoped>
.work-detail { display: grid; gap: 22px; }
.detail-head { display: flex; align-items: flex-start; gap: 16px; }
.detail-head img { width: clamp(76px, 18vw, 132px); aspect-ratio: 2 / 3; object-fit: cover; border-radius: 10px; }
.detail-head p { overflow-wrap: anywhere; }
.work-detail section { background: #fff; border: 1px solid #e3e8ea; border-radius: 12px; padding: 14px; min-width: 0; }
.work-detail .tracker-button { margin-top: 12px; }
.work-detail details { font-size: 14px; }
.table-wrap { margin-top: 10px; }
</style>
