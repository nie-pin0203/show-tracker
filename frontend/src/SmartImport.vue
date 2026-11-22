<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { reviewWorkImport, commitWorkImport } from './library'
import { parseText } from './localImport'
import { freshness, reviewTime } from './pasteImport'
import { emptyGroup, groupPastedText, buildBatchRecords, sortedRecordRows, saveDraft, loadDraft, clearDraft } from './pasteBatch'
import ScreenshotInput from './ScreenshotInput.vue'
import {selectLinkGroup} from './quickLinks'

const props=defineProps({shows:Array})
const screenshots=ref(null), panelOpen=ref(false), returnLink=ref(null)
async function openForLink(link){
  try {active.value=selectLinkGroup(groups.value,link);returnLink.value=link;panelOpen.value=true;await nextTick();window.location.hash='smart-import';document.getElementById('smart-import')?.scrollIntoView()}
  catch(e){error.value=e.message}
}
defineExpose({openForLink,removeDraft})
const emit=defineEmits(['changed','navigate','return-work'])
const groups=ref([{...emptyGroup(),platform:'腾讯视频'}]), active=ref(0), batchText=ref(''), query=ref('')
const current=computed(()=>groups.value[active.value])
const groupField=key=>computed({get:()=>current.value[key],set:value=>{current.value[key]=value}})
const platform=groupField('platform'),targetId=groupField('targetId'),sourceUrl=groupField('sourceUrl'),original=groupField('original'),result=groupField('result')
const preview=ref(null), prepared=ref(null), busy=ref(false), error=ref(''), success=ref(''), reviewedAt=ref('')
const decisions=ref({}), decisionReady=ref(false), linkConfirmed=ref(false), savedItems=ref([])
const namespace=ref(''), draftMessage=ref(''), draftReady=ref(false)
const summaryRows=computed(()=>prepared.value ? sortedRecordRows(JSON.parse(prepared.value.content)) : [])
let draftTimer, restoring=false, dirty=false, disposed=false, draftEnabled=true
const platforms=['腾讯视频','爱奇艺','优酷','豆瓣']
const targets=computed(() => (props.shows??[]).filter(s => !s.is_mock && s.title.includes(query.value.trim())))
const names={title:'作品名称',category:'类型',source_id:'平台源ID',source_url:'详情URL',premiere_date:'开播日期',total_episodes:'总集/期数',latest_episode:'页面最新集数',audience:'最新集数的会员身份',score:'评分',rating_count:'评分人数',rating_source:'评分来源',rating_url:'评分出处URL',captured_at:'人工查看时间（含时区）'}
const planNames={update_date:'更新日期',audience:'层级',schedule_status:'状态',episode_start:'起始集号',episode_end:'结束集号',planned_count:'更新数量',period_number:'数字期号',period_date:'日期期号',period_part:'整期/上下期'}
const choices={category:{drama:'电视剧',variety:'综艺',animation:'国漫',movie:'电影'},audience:{unknown:'未知',free:'免费',vip:'VIP',svip:'SVIP'},schedule_status:{expected:'预计',confirmed:'已确认',actual:'实际更新'},period_part:{full:'整期',upper:'上期',lower:'下期'}}
const numeric=new Set(['total_episodes','latest_episode','score','rating_count','episode_start','episode_end','planned_count','period_number'])
const dateKeys=new Set(['premiere_date','update_date','period_date'])
function invalidatePreview() { preview.value=null; prepared.value=null; decisions.value={}; decisionReady.value=false; linkConfirmed.value=false; success.value='' }
watch(()=>[active.value,platform.value,sourceUrl.value,original.value,targetId.value],(now,old)=>{
  if (!restoring && now[0]===old[0]) {result.value=null;current.value.groupConfirmed=false}
})
watch([groups,batchText],()=>{
  if(restoring) return
  dirty=true;draftEnabled=true;invalidatePreview();clearTimeout(draftTimer)
  if(draftReady.value) draftTimer=setTimeout(persistDraft,250)
},{deep:true})
watch([decisions,linkConfirmed],()=>{decisionReady.value=false},{deep:true})
watch(query,() => {
  if (targetId.value && !targets.value.some(s => s.id===Number(targetId.value))) {targetId.value='';sourceUrl.value=''}
})
function persistDraft() {
  if(!draftReady.value || restoring || !draftEnabled) return
  clearTimeout(draftTimer)
  try {saveDraft(localStorage,namespace.value,{groups:groups.value,batchText:batchText.value,active:active.value});draftMessage.value='草稿已自动保存在本机浏览器'}
  catch(e){draftMessage.value=`草稿未保存：${e.message}`}
}
function saveNow() {draftEnabled=true;persistDraft()}
function removeDraft() {
  draftEnabled=false;clearTimeout(draftTimer)
  try {clearDraft(localStorage,namespace.value);draftMessage.value='已清除本机草稿；后续编辑会再次自动保存'}
  catch(e){draftMessage.value=e.message}
}
onMounted(async()=>{
  window.addEventListener('pagehide',persistDraft)
  window.addEventListener('tracker-library-replaced',removeDraft)
  try {
    if(disposed) return
    namespace.value='local-library-v1'
    draftReady.value=true
    const draft=loadDraft(localStorage,namespace.value)
    if(draft && !dirty) {
      restoring=true;groups.value=draft.data.groups;batchText.value=draft.data.batchText??''
      active.value=Math.min(Math.max(draft.data.active??0,0),groups.value.length-1)
      await nextTick();restoring=false
      draftMessage.value='已恢复草稿。为防止误写，请重新核对字段、排期和作品关联；旧预览与覆盖确认未恢复。'
    }
    draftReady.value=true
    if(dirty) persistDraft()
  } catch(e){draftMessage.value=`草稿恢复/保存不可用：${e.message}`}
})
onUnmounted(()=>{
  persistDraft();disposed=true;clearTimeout(draftTimer)
  window.removeEventListener('pagehide',persistDraft)
  window.removeEventListener('tracker-library-replaced',removeDraft)
})
function splitBatch() {
  try {groups.value=groupPastedText(batchText.value);active.value=0;query.value='';error.value=''}
  catch(e){error.value=e.message}
}
function addGroup() {
  if(groups.value.length>=20){error.value='每批最多20组';return}
  groups.value.push(emptyGroup());active.value=groups.value.length-1;query.value=''
}
function deleteGroup() {
  groups.value.splice(active.value,1)
  if(!groups.value.length) groups.value.push(emptyGroup())
  active.value=Math.min(active.value,groups.value.length-1);query.value=''
}
function chooseWork() {
  const show=(props.shows??[]).find(s => s.id===Number(targetId.value))
  sourceUrl.value=show?.platforms.find(p => p.platform===platform.value)?.source_url ?? ''
}
async function parseGroup(group) {
  const parsed=await parseText({platform:group.platform,source_url:group.sourceUrl,text:group.original})
  const selected=(props.shows??[]).find(s => s.id===Number(group.targetId))
  for(const key of ['title','category']) {
    if(selected && parsed.fields[key].value==null) parsed.fields[key]={value:selected[key],evidence:['人工选择的已有作品；不是粘贴原文证据'],reason:null}
  }
  parsed.fields.captured_at={value:reviewTime(),evidence:['本机录入时间，请核对原始查看时间'],reason:null}
  group.result=parsed
}
async function parse(all=false) {
  busy.value=true;error.value=''
  const errors=[]
  for(const group of all ? groups.value : [current.value]) {
    group.result=null
    try {await parseGroup(group)} catch(e){errors.push(`第${groups.value.indexOf(group)+1}组：${e.message}`)}
  }
  error.value=errors.join('；');busy.value=false
}
function confirmFields() {
  for (const field of Object.values(result.value.fields)) if (field.value!=null && field.value!=='') field.confirmed=true
}
const decisionMap=()=>Object.fromEntries(Object.entries(decisions.value).filter(([,v])=>v))
async function inspect(resolve=false) {
  busy.value=true;error.value=''
  try {
    let body=prepared.value
    if(!resolve) {
      reviewedAt.value=reviewTime();decisions.value={};linkConfirmed.value=false
      body={format:'json',content:JSON.stringify(buildBatchRecords(groups.value,reviewedAt.value))}
    }
    const data=await reviewWorkImport({...body,decisions:decisionMap(),confirm_links:linkConfirmed.value}, 'manual')
    preview.value=data;prepared.value=body;decisionReady.value=true
  } catch(e){error.value=e.message;preview.value=null;decisionReady.value=false}
  finally {busy.value=false}
}
async function commit() {
  busy.value=true;error.value=''
  try {
    const data=await commitWorkImport({...prepared.value,decisions:decisionMap(),preview_token:preview.value.preview_token,confirm_links:linkConfirmed.value}, 'manual')
    if(!data.committed) throw new Error('校验未通过，未写入数据库')
    success.value=`已导入：新增${data.counts['新增']}、更新${data.counts['更新']}、跳过${data.counts['跳过']}。核对时间：${reviewedAt.value}`
    savedItems.value=data.items.filter(row=>row.show_id)
    preview.value=null;prepared.value=null;removeDraft();emit('changed')
  } catch(e){error.value=e.message;preview.value=null;prepared.value=null}
  finally {busy.value=false}
}
</script>

<template>
  <details id="smart-import" :open="panelOpen" @toggle="panelOpen=$event.target.open" class="smart-import" @paste="screenshots?.paste($event)">
    <summary>智能导入 <span>规则辅助解析 · AI未启用</span></summary>
    <button v-if="returnLink" @click="emit('return-work',returnLink)">返回当前作品：{{returnLink.title}}</button><p class="hint">文字与截图在本机浏览器处理。请先框选并核对截图内容，再确认导入本地作品库。</p>
    <p>{{draftMessage || '正在准备本机草稿…'}}</p>
    <button @click="saveNow" :disabled="!draftReady || busy">保存草稿</button><button @click="removeDraft" :disabled="!draftReady || busy">清除草稿</button>
    <button v-if="returnLink" :disabled="busy || !batchText.trim()" @click="original=batchText">把待整理文字用于当前作品（保留关联，需重新核对）</button>
    <ScreenshotInput ref="screenshots" v-model="batchText" :disabled="busy" @group="splitBatch" />
    <details class="batch-input"><summary>一次粘贴多部作品</summary><p>每部以“作品名称：”开头，带本部平台与作品URL；也可用独立一行 --- 分隔。分组有歧义时请编辑或拆分，不会按同名自动合并。</p><textarea v-model="batchText" maxlength="30000" rows="8" :disabled="busy" placeholder="作品名称：甲&#10;平台：优酷&#10;作品URL：https://…&#10;…&#10;---&#10;作品名称：乙&#10;…"></textarea><button @click="splitBatch" :disabled="busy || !batchText.trim()">自动分组（替换当前分组）</button></details>
    <div class="group-nav"><label>当前作品组<select v-model="active" :disabled="busy" @change="query=''"><option v-for="(group,i) in groups" :key="i" :value="i">第{{i+1}}组 · {{group.result?.fields.title.value || group.original.split('\n')[0] || '未填写'}} · {{group.platform || '平台待确认'}}</option></select></label><button @click="addGroup" :disabled="busy">新增空组</button><button @click="deleteGroup" :disabled="busy">移除本组</button><button @click="parse(true)" :disabled="busy">解析全部作品组</button></div>
    <fieldset :disabled="busy" class="steps">
      <section aria-label="选择平台与粘贴原文">
        <h2>① 选择平台与粘贴原文（第{{active+1}}组）</h2><p class="warning">{{current.reason}}</p>
        <label>原文来源平台<select v-model="platform" @change="chooseWork"><option value="">请选择平台</option><option v-for="p in platforms" :key="p">{{p}}</option></select></label>
        <label>搜索已有作品<input v-model="query" placeholder="输入作品名称"></label>
        <label>关联作品<select v-model="targetId" @change="chooseWork"><option value="">新建独立作品（不会按名称合并）</option><option v-for="s in targets" :key="s.id" :value="s.id">{{s.title}}（ID {{s.id}}）</option></select></label>
        <label>作品详情URL<input v-model="sourceUrl" type="url" maxlength="1000" placeholder="手动粘贴规范作品详情链接"></label>
        <label>手动复制的原文<textarea v-model="original" maxlength="30000" rows="12" placeholder="作品名称：…&#10;类型：电视剧&#10;更新至22/30集&#10;2026-11-01 VIP 预计更新第1-2集&#10;评分：8.5&#10;12345人评分"></textarea></label>
        <small>{{original.length}} / 30000字。建议每行一条排期，带完整年份和会员层级；相对日期、周规则不推算。</small>
        <button @click="parse(false)" :disabled="!original.trim() || !sourceUrl">规则辅助解析本组</button><label class="check"><input type="checkbox" v-model="current.groupConfirmed">我已确认本组文字只属于所选作品及平台</label>
      </section>
      <section aria-label="解析结果与证据核对">
        <h2>② 解析结果与证据核对</h2>
        <p v-if="!result">解析后逐项核对原文；空白表示NULL，不自动补0。</p>
        <template v-else>
          <p>来源：{{platform}} · {{freshness(result.fields.captured_at.value)}}。这是人工查看时间，不证明网页当前仍然有效。</p>
          <p v-for="(warning,i) in result.warnings" :key="i" class="warning">{{warning}}</p>
          <button @click="confirmFields">我已核对下列有值字段</button>
          <div class="field-list"><div v-for="(field,key) in result.fields" :key="key" class="field-review">
            <label>{{names[key]}}<select v-if="choices[key]" v-model="field.value" @change="field.confirmed=false"><option :value="null">未知（NULL）</option><option v-for="(label,value) in choices[key]" :key="value" :value="value">{{label}}</option></select>
              <input v-else v-model="field.value" :readonly="['source_id','source_url','rating_source','rating_url'].includes(key)" :type="numeric.has(key)?'number':dateKeys.has(key)?'date':'text'" :step="key==='score'?'0.1':'1'" placeholder="未知（NULL）" @input="field.confirmed=false">
            </label>
            <small v-if="field.reason">{{field.reason}}</small>
            <details><summary>原始证据</summary><p v-for="(line,i) in field.evidence" :key="i">{{line}}</p><p v-if="!field.evidence?.length">未找到明确原文；手工补充值需自行核对。</p></details>
            <label class="check"><input type="checkbox" v-model="field.confirmed" :disabled="field.value==null || field.value===''">{{field.value==null || field.value===''?'未知，不导入':field.confirmed?'已人工核对':'待确认'}}</label>
          </div></div>
          <p>“更新至22/30集”只作页面累计进度，会员身份未知；排期会员层级不会套用到累计进度。</p>
        </template>
      </section>
      <section aria-label="导入预览与确认">
        <h2>③ 导入预览与确认</h2>
        <template v-if="result">
          <p>每条排期必须补齐日期、层级、状态、内容后单独确认；不需要的候选可删除。修改后需重新确认。</p>
          <div v-for="(row,index) in result.schedules" :key="index" class="schedule-review">
            <b>排期{{index+1}}</b><p class="evidence">{{row.evidence}}</p>
            <div class="table-scroll"><table><thead><tr><th v-for="(label,key) in planNames" :key="key">{{label}}</th></tr></thead><tbody><tr>
              <td v-for="(field,key) in row.fields" :key="key"><select v-if="choices[key]" v-model="field.value" @change="row.confirmed=false"><option :value="null">未知</option><option v-for="(label,value) in choices[key]" :key="value" :value="value">{{label}}</option></select><input v-else v-model="field.value" :type="dateKeys.has(key)?'date':'number'" min="0" step="1" placeholder="NULL" @input="row.confirmed=false"><details><summary>{{row.confirmed?'已确认':field.value==null?'未知':'待确认'}}</summary><p v-for="(line,i) in field.evidence" :key="i">{{line}}</p><small>{{field.reason}}</small></details></td>
            </tr></tbody></table></div>
            <label class="check"><input type="checkbox" v-model="row.confirmed">我已确认本条排期</label><button @click="result.schedules.splice(index,1)">删除此条</button>
          </div>
          <p v-if="!result.schedules.length">无排期候选：仅导入已核对的作品信息/评分，不创建排期。</p>
          <button @click="inspect(false)">生成整批入库预览（{{groups.length}}组，不写入）</button>
        </template>
        <div v-if="preview">
          <div class="table-scroll"><table><thead><tr><th>记录</th><th>日期</th><th>作品 / 平台</th><th>层级 / 状态</th></tr></thead><tbody><tr v-for="r in summaryRows" :key="r.row"><td>{{r.row}}</td><td>{{r.update_date || '作品信息/评分'}}</td><td>{{r.title}} / {{r.platform}}</td><td>{{r.audience}} / {{r.schedule_status || '—'}}</td></tr></tbody></table></div>
          <p v-for="e in preview.errors" :key="e.row" class="warning">第{{e.row}}条：{{e.message}}</p>
          <template v-if="preview.valid">
            <p>新增{{preview.counts['新增']}} · 更新{{preview.counts['更新']}} · 冲突{{preview.conflict_count}} · 跳过{{preview.counts['跳过']}}</p>
            <div v-for="row in preview.items" :key="row.row" class="schedule-review"><b>第{{row.row}}条 · {{row.title}} · {{row.platform}} · {{row.update_date || '作品信息/评分'}} · {{row.action}}</b><p v-for="c in row.conflicts" :key="c" class="warning">{{c}}</p><details><summary>核对修改前后值与冲突</summary><pre>{{JSON.stringify(row.changes,null,2)}}</pre><p>{{row.detected_conflicts?.join('；')}}</p></details><label>本条处置<select v-model="decisions[String(row.row)]"><option value="">按默认规则（不覆盖保护数据）</option><option value="keep" :disabled="!row.existing">保留旧值（整条不写）</option><option value="new">采用新值（允许本条覆盖）</option><option value="skip">跳过本条</option></select></label></div>
            <p>处置单位为一条入库记录（包括其作品字段、评分及排期）；保留旧值和跳过均不写入该条，并计入跳过数。</p>
            <label class="check"><input type="checkbox" v-model="linkConfirmed">我已人工确认所选跨平台作品是同一作品</label>
            <p>核对时间：{{reviewedAt}}。入库保存来源、核对时间及原文指纹；未完成原文及编辑结果保存在本机项目草稿，成功后清除。</p>
            <button @click="inspect(true)">更新处置预览</button><p v-if="!decisionReady">处置已改变，请先更新预览。</p><button class="commit" @click="commit" :disabled="!decisionReady || preview.conflict_count>0">确认整批导入</button>
          </template>
        </div>
      </section>
    </fieldset>
    <div v-if="savedItems.length"><p>导入完成，可直接查看：</p><span v-for="(row,i) in savedItems" :key="i"><button @click="emit('navigate',{...row,view:'show'})">{{row.title}} · 作品详情</button><button v-if="row.update_date" @click="emit('navigate',{...row,view:'calendar'})">{{row.update_date}} · 日历</button></span></div>
    <p v-if="busy" role="status">处理中…</p><p v-if="error" role="alert" class="warning">{{error}}</p><p v-if="success" role="status">{{success}}</p>
  </details>
</template>

<style scoped>
.smart-import{margin:20px 0;padding:18px;border:1px solid #ddd;border-radius:12px;background:white}.batch-input textarea{width:100%;box-sizing:border-box;padding:10px}.group-nav{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0}.group-nav select{max-width:100%;padding:8px}.group-nav label{min-width:0;max-width:100%}.smart-import>summary{cursor:pointer;font-weight:700}.smart-import>summary span{font-size:12px;font-weight:400;color:#666;margin-left:10px}.steps{border:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.steps section{min-width:0;padding:12px;background:#f8f9fb;border-radius:10px}.steps h2{font-size:16px;margin:0 0 14px}.steps label{display:flex;flex-direction:column;font-size:13px;gap:5px;margin:9px 0}.steps input,.steps select,.steps textarea{min-width:0;width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;background:white;color:#222}.steps input[readonly]{background:#eee}.steps textarea{resize:vertical}.steps .check{display:flex;flex-direction:row;align-items:center}.check input{width:auto}.smart-import button{padding:8px 12px;margin:10px 5px 10px 0;border:1px solid #ccc;border-radius:7px;cursor:pointer}.smart-import button:disabled{opacity:.5}.smart-import p,.smart-import small{font-size:12px;line-height:1.7;overflow-wrap:anywhere}.warning{color:#a82d24}.field-list{max-height:650px;overflow:auto}.field-review,.schedule-review{padding:10px;margin:8px 0;border:1px solid #ddd;background:white;border-radius:7px}.table-scroll{overflow-x:auto}.table-scroll table{min-width:1000px}.table-scroll input,.table-scroll select{min-width:95px}.smart-import pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;max-height:320px;overflow:auto}.commit{background:#23392e;color:white}.evidence{white-space:pre-wrap}@media(max-width:1100px){.steps{grid-template-columns:1fr}.field-list{max-height:none}}@media(max-width:600px){.smart-import{padding:10px}.steps section{padding:10px}.smart-import>summary span{display:block;margin:5px 0}}
</style>
