<script setup>
import {ref,onMounted,watch} from 'vue'
import { inspectLink, listLinks, removeLink, saveDoubanRating, writeLink } from './library'
import {quickPayload} from './quickLinks'
const props=defineProps({shows:Array})
const emit=defineEmits(['import','calendar','changed'])
const quick=ref({detail_url:'',title:'',category:'drama',total_episodes:'',calendar_url:'',douban_url:'',notes:'',link_show_id:''}), identified=ref(null), current=ref(null)
watch(()=>[quick.value.detail_url,quick.value.title],()=>{identified.value=null;quick.value.link_show_id=''})
async function identify(){
  busy.value=true
  error.value=''
  try { identified.value=await inspectLink(quick.value.detail_url,quick.value.title) }
  catch(e) { error.value=e.message }
  finally { busy.value=false }
}
async function create(){
  busy.value=true
  error.value=''
  try {
    const item=await writeLink(quickPayload(quick.value),{quick:true})
    current.value=item
    rating.value.show_id=item.show_id
    rating.value.url=item.douban_url||''
    await load()
    error.value='已保存到本机'
    emit('changed')
  } catch(e) { error.value=e.message }
  finally { busy.value=false }
}
function returnTo(link){current.value=link;rating.value.show_id=link.show_id;rating.value.url=link.douban_url||'';window.location.hash='current-work'}
const links=ref([]),error=ref(''),busy=ref(false),editing=ref(null)
const fresh=()=>({show_id:'',platform:'腾讯视频',detail_url:'',calendar_url:'',notes:'',mode:'link',enabled:true,reviewed_at:''})
const form=ref(fresh()),rating=ref({show_id:'',score:'',rating_count:'',url:'',reviewed_at:''})
const dateTime=s=>s ? `${s}T00:00:00+08:00` : null
async function load(){
  try { links.value=await listLinks() }
  catch(e) { error.value=e.message }
}
async function write(){
  busy.value=true
  error.value=''
  try {
    await writeLink({...form.value,show_id:Number(form.value.show_id),reviewed_at:dateTime(form.value.reviewed_at)}, {id:editing.value})
    form.value=fresh()
    editing.value=null
    await load()
    emit('changed')
  } catch(e) { error.value=e.message }
  finally { busy.value=false }
}
function edit(l){editing.value=l.id;form.value={...l,reviewed_at:l.reviewed_at?.slice(0,10)||''}}
async function act(link,remove=false){
  busy.value=true
  error.value=''
  try {
    if (remove) await removeLink(link.id)
    else await writeLink({...link,enabled:!link.enabled},{id:link.id})
    await load()
    if (current.value?.id===link.id) current.value=links.value.find(item=>item.id===link.id)||null
    emit('changed')
  } catch(e) { error.value=e.message }
  finally { busy.value=false }
}
async function rate(){
  busy.value=true
  error.value=''
  try {
    const { show_id, score, rating_count, url, reviewed_at }=rating.value
    await saveDoubanRating(show_id,{score:Number(score),rating_count:rating_count===''?null:Number(rating_count),
      url,reviewed_at:dateTime(reviewed_at)})
    emit('changed')
    error.value='豆瓣评分已保存'
  } catch(e) { error.value=e.message }
  finally { busy.value=false }
}
onMounted(load)
defineExpose({links,returnTo})
</script>
<template>
<section class="links-panel" id="links-panel">
 <h2>影视链接与排期管理</h2><p>腾讯视频 · 爱奇艺 · 优酷｜只保存链接，由你打开官网核对。不后台抓取，不自动同步。</p>
 <details open><summary>添加新作品 · 官网链接快速建档</summary><fieldset :disabled="busy"><form class="link-form" @submit.prevent="create">
 <label>官网作品URL<input v-model="quick.detail_url" type="url" required maxlength="1000" @change="identify" placeholder="粘贴规范作品详情链接"></label><button type="button" @click="identify">识别平台/ID并查重（不联网）</button>
 <p v-if="identified">{{identified.platform}} · 链接ID {{identified.source_id}}（仅URL结构识别，不代表官网验证）</p>
 <label>作品名称<input v-model="quick.title" required maxlength="200" @change="identify"></label><label>类型<select v-model="quick.category"><option value="drama">电视剧</option><option value="variety">综艺</option><option value="animation">国漫</option><option value="movie">电影</option></select></label>
 <label v-if="quick.category !== 'movie'">总集/期数（可选）<input v-model="quick.total_episodes" type="number" min="1" max="10000" step="1"></label>
 <p v-if="identified?.existing">已有相同平台ID/链接：{{identified.existing.title}}（{{identified.existing.id}}），请选择关联。原作品信息不覆盖。</p>
 <p v-if="identified?.candidates.length">名称相近候选（不自动合并）：{{identified.candidates.map(s=>s.title+' #'+s.id).join('、')}}</p>
 <label>人工关联<select v-model="quick.link_show_id"><option value="">新建独立作品</option><option v-for="s in shows" :key="s.id" :value="s.id">{{s.title}}（{{s.id}}）</option></select></label>
 <label>官方追剧日历URL<input v-model="quick.calendar_url" type="url" maxlength="1000"></label><label>可选豆瓣作品URL<input v-model="quick.douban_url" type="url" maxlength="1000"></label><label>备注<input v-model="quick.notes" maxlength="1000"></label>
 <button :disabled="!identified || (identified.existing && Number(quick.link_show_id)!==identified.existing.id)">确认建档 / 关联</button></form></fieldset></details>
 <article v-if="current" id="current-work" class="link-row"><strong>当前作品：{{current.title}} · {{current.platform}}</strong><a :href="current.detail_url" target="_blank" rel="noopener noreferrer">打开官方页面</a><a v-if="current.calendar_url" :href="current.calendar_url" target="_blank" rel="noopener noreferrer">打开追剧日历</a><button @click="emit('import',current)" :disabled="!current.enabled">截图识别排期</button><button @click="emit('calendar',current)">查看日历</button><p>豆瓣关联：{{current.douban_url || '未填写'}}；未自动获取评分。</p></article>
 <fieldset :disabled="busy"><form @submit.prevent="write" class="link-form">
 <label>关联作品<select v-model="form.show_id" required><option value="">请选择已有作品，或使用上方快速建档</option><option v-for="s in shows" :value="s.id" :key="s.id">{{s.title}}（{{s.id}}）</option></select></label>
 <label>平台<select v-model="form.platform"><option>腾讯视频</option><option>爱奇艺</option><option>优酷</option></select></label>
 <label>作品详情URL<input v-model="form.detail_url" required type="url" maxlength="1000"></label>
 <label>官方追剧日历URL（可选）<input v-model="form.calendar_url" type="url" maxlength="1000"></label>
 <label>豆瓣作品URL（可选）<input v-model="form.douban_url" type="url" maxlength="1000"></label><label>备注<input v-model="form.notes" maxlength="1000"></label>
 <label>模式<select v-model="form.mode"><option value="link">仅保存链接</option><option value="manual">人工核对</option></select></label>
 <label>最后人工核对日期<input type="date" v-model="form.reviewed_at" :required="form.mode==='manual'"></label>
 <button>{{editing?'保存修改':'添加链接'}}</button><button type="button" @click="form=fresh();editing=null">清空表单</button>
 </form></fieldset>
 <article v-for="l in links" :key="l.id" class="link-row"><strong>{{l.title}} · {{l.platform}}</strong><p>{{l.enabled?'管理中':'已暂停'}} · {{l.mode==='manual'?'人工核对':'仅保存链接'}} · {{l.reviewed_at?'已核对 '+l.reviewed_at:'尚未确认'}} · 更新时间 {{l.updated_at}}</p><p>{{l.notes}}</p>
 <a :href="l.detail_url" target="_blank" rel="noopener noreferrer">打开官方网站</a> <a v-if="l.calendar_url" :href="l.calendar_url" target="_blank" rel="noopener noreferrer">打开追剧日历</a>
 <button @click="emit('import',l)" :disabled="!l.enabled">导入日历截图</button><button @click="emit('calendar',l)">查看已有排期</button><button @click="edit(l)" :disabled="busy">编辑</button><button @click="act(l)" :disabled="busy">{{l.enabled?'暂停':'恢复管理'}}</button><button @click="act(l,true)" :disabled="busy">删除链接</button>
 </article><p>删除链接不删除作品、收藏、观看进度或历史排期。跨平台关联由你选择作品确认，不按名称合并。</p>
 <details><summary>手动核对豆瓣评分</summary><form @submit.prevent="rate" class="link-form"><label>作品<select v-model="rating.show_id" required><option value="">选择作品</option><option v-for="s in shows" :key="s.id" :value="s.id">{{s.title}}</option></select></label><label>豆瓣评分<input v-model="rating.score" type="number" min="0" max="10" step="0.1" required></label><label>评分人数（未知留空）<input v-model="rating.rating_count" type="number" min="0" step="1"></label><label>豆瓣作品URL<input v-model="rating.url" type="url" required></label><label>核对日期<input v-model="rating.reviewed_at" type="date" required></label><button :disabled="busy">确认保存豆瓣评分</button></form><p>仅人工录入；其他平台历史评分不会显示为当前豆瓣评分。</p></details>
 <p role="status">{{error}}</p>
</section>
</template>
<style scoped>
.links-panel{padding:20px;margin:20px 0;border:1px solid #ddd;border-radius:16px;background:white}.links-panel h2{font-size:19px}.link-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.link-form label{display:flex;flex-direction:column;gap:6px}.link-form input,.link-form select{padding:10px;border:1px solid #ddd;border-radius:14px;min-width:0}.links-panel fieldset{border:0;padding:0}.links-panel button,.links-panel a{display:inline-block;margin:6px;padding:7px}.link-row{border-top:1px solid #eee;margin-top:18px;padding-top:12px}.links-panel p{font-size:12px;color:#667;overflow-wrap:anywhere}@media(max-width:650px){.link-form{grid-template-columns:1fr}}
</style>
