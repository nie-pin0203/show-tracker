<script setup>
import {ref,computed,watch} from 'vue'
import {sampleCells,complete,confirmedText,reviewCounts,SAMPLE_HASH,tierPreview,applyTierPreview,selectedText,recordChange,regionBox,duplicateRegion,manualCell,updateRegion,evidenceCrops} from './tencentCalendar'
const props=defineProps({report:Object,imageUrl:String,imageFile:Object,disabled:Boolean})
const emit=defineEmits(['text'])
const picked=ref([]),preview=ref(null),approved=ref(false),history=ref([]),message=ref(''),sent=ref(false)
const rows=ref([]),selected=ref(1),context=ref({year:'',month:'',yearConfirmed:false,monthConfirmed:false})
let nextId=1
const mode=ref('draw'),zoom=ref(100),gesture=ref(null),canvas=ref(null)
watch(()=>props.report,r=>{gesture.value=null;rows.value=sampleCells(r??{}).map(c=>({...c,date:'',yearConfirmed:false,rowGroup:'',imageHash:r.image_sha256}));nextId=rows.value.length+1;selected.value=rows.value[0]?.id??null;context.value={year:'',month:'',yearConfirmed:false,monthConfirmed:false}},{immediate:true})
const snapshot=()=>JSON.stringify({rows:rows.value,context:context.value})
let previous=snapshot()
watch(()=>props.report,()=>{picked.value=[];preview.value=null;history.value=[];previous=snapshot();sent.value=false})
watch(snapshot,after=>{recordChange(history.value,previous,after);previous=after;preview.value=null;approved.value=false;picked.value=picked.value.filter(id=>rows.value.some(r=>r.id===id&&complete(r,context.value)));if(sent.value){emit('text','');sent.value=false}})
watch(picked,()=>{if(sent.value){emit('text','');sent.value=false}})
const output=computed(()=>selectedText(rows.value,context.value,picked.value))
function applyRow(){if(applyTierPreview(rows.value,preview.value,approved.value))message.value='同行会员已人工确认，其他字段仍须逐格核对';else message.value='预览已失效，请重新预览';preview.value=null;approved.value=false}
function send(){if(props.disabled||!output.value)return;emit('text',output.value);sent.value=true}
const current=computed(()=>rows.value.find(r=>r.id===selected.value))
const counts=computed(()=>reviewCounts(rows.value,context.value))
function reset(r){for(const key of Object.keys(r.checks)) r.checks[key]=false}
function headerChange(){context.value.yearConfirmed=false;context.value.monthConfirmed=false;for(const r of rows.value) r.checks.date=false}
function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(canvas.value.getScreenCTM().inverse());return {x:p.x,y:p.y}}
function startGesture(e){
 if(props.disabled||gesture.value||e.button>0)return
 const id=Number(e.target.closest('[data-id]')?.dataset.id),row=rows.value.find(r=>r.id===id)
 if(row)selected.value=id
 const action=e.target.dataset.action==='resize'?'resize':mode.value
 if(action!=='draw'&&!row)return
 const a=point(e);gesture.value={pointer:e.pointerId,action,id:row?.id,a,original:row?{...row.box}:null,box:null}
 canvas.value.setPointerCapture(e.pointerId);e.preventDefault()
}
function moveGesture(e){
 const g=gesture.value;if(!g||g.pointer!==e.pointerId)return
 const b=point(e),w=props.report.width,h=props.report.height
 if(g.action==='draw')g.box=regionBox(g.a,b,w,h)
 else if(g.action==='resize')g.box=regionBox({x:g.original.x,y:g.original.y},b,w,h)
 else {const o=g.original;g.box={...o,x:Math.max(0,Math.min(w-o.width,o.x+b.x-g.a.x)),y:Math.max(0,Math.min(h-o.height,o.y+b.y-g.a.y))}}
}
function endGesture(e){
 const g=gesture.value;if(!g||g.pointer!==e.pointerId)return
 gesture.value=null;if(canvas.value.hasPointerCapture(e.pointerId))canvas.value.releasePointerCapture(e.pointerId)
 if(!g.box)return
 if(duplicateRegion(rows.value,g.box,g.action==='draw'?null:g.id)){message.value='重复选区，未保存；请选择已有格子';return}
 if(g.action==='draw'){const row=manualCell(props.report,g.box,nextId++);rows.value.push(row);selected.value=row.id}
 else {const row=rows.value.find(r=>r.id===g.id);if(row)updateRegion(row,g.box,props.report)}
 message.value='选区已保存；日期、集数、会员需人工核对'
}
function removeCell(){rows.value=rows.value.filter(r=>r.id!==selected.value);selected.value=rows.value[0]?.id??null}
async function exportAnnotations(){
 try{
  if(!(props.imageFile instanceof Blob))throw new Error('原图不可用，请保留原图后再导出')
  const value=JSON.parse(JSON.stringify({image_sha256:props.report.image_sha256??null,original_ocr:props.report,origin:'manual_review',context:context.value,rows:rows.value,selected_ids:picked.value,history:history.value,counts:counts.value,reviewed_at:new Date().toISOString(),note:'人工校正不是OCR识别成功；不自动入库'}))
  const file=props.imageFile
  value.original_image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('原图读取失败'));r.readAsDataURL(file)})
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='calendar-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='原图、原始OCR及人工修改记录已导出到本机'
 }catch(e){message.value=e.message}
}
</script>
<template>
<section v-if="report.width > 0 && report.height > 0" class="calendar-review">
 <h4>通用日历截图 · 手动框选校正</h4>
 <p>鼠标或触控拖动框选；切换移动模式拖动已有格子，或拖动右下角方块调整大小。仅依据人工选区，不根据颜色、平台或行列推断。完整年月日及会员必须人工核对；每周规则和播放列表不能直接生成每日排期。</p>
 <label>操作<select v-model="mode" :disabled="disabled"><option value="draw">新增框选</option><option value="move">选择/移动格子</option><option value="resize">调整选区</option></select></label>
 <label>原图缩放 {{zoom}}% <input type="range" min="100" max="400" step="25" v-model.number="zoom"></label>
 <p>已有{{rows.length}}格；空白处可继续框选。未知字段留空，不会自动入库。</p>
 <div class="scroll"><table><thead><tr><th>选择导入</th><th>格/定位</th><th>日期框OCR</th><th>集数框OCR</th><th>会员框OCR</th><th>状态</th></tr></thead><tbody><tr v-for="r in rows" :key="r.id"><td><input type="checkbox" v-model="picked" :value="r.id" :disabled="disabled || !complete(r,context)" :aria-label="`选择已确认格${r.id}`"></td><td><button @click="selected=r.id">格{{r.id}}</button></td><td>{{r.dateRaw||'未识别'}}</td><td>{{r.raw||'未识别'}}</td><td>{{r.tierRaw||'未识别'}}</td><td>{{r.blocked?'无法确认：'+r.blocked:complete(r,context)?'字段已人工确认':'待标注，完整日期/集数/会员未知'}}</td></tr></tbody></table></div>
 <div class="visual-editor"><div class="scroll canvas-scroll"><svg ref="canvas" :viewBox="`0 0 ${report.width} ${report.height}`" :style="{width:zoom+'%'}" class="selection-canvas" role="group" aria-label="手动框选原图" @pointerdown="startGesture" @pointermove="moveGesture" @pointerup="endGesture" @pointercancel="gesture=null">
 <image :href="imageUrl" :width="report.width" :height="report.height"/>
 <template v-for="r in rows" :key="r.id"><rect v-bind="r.box" :data-id="r.id" :fill="r.blocked?'#8888':complete(r,context)?'#00a05055':'transparent'" :stroke="selected===r.id?'red':'green'" role="button" tabindex="0" :aria-label="`格${r.id}`" @keydown.enter="selected=r.id" @keydown.space.prevent="selected=r.id"><title>格{{r.id}} {{r.blocked?'跳过':complete(r,context)?'已确认':'待确认'}}</title></rect>
 <rect v-if="selected===r.id" :data-id="r.id" data-action="resize" :x="r.box.x+r.box.width-6" :y="r.box.y+r.box.height-6" width="12" height="12" fill="red"/>
 </template><rect v-if="gesture?.box" v-bind="gesture.box" fill="#4488ff33" stroke="blue" pointer-events="none"/>
 </svg></div>
 <fieldset v-if="current" :disabled="disabled"><legend>格{{current.id}}逐项核对（修改将撤销确认）</legend>
 <svg v-for="item in evidenceCrops(current)" :key="item.label" :viewBox="`${item.box.x-3} ${item.box.y-3} ${item.box.width+6} ${item.box.height+6}`" class="crop" role="img" :aria-label="item.label"><image :href="imageUrl" :width="report.width" :height="report.height"/></svg>
 <label>无法确认原因<select v-model="current.blocked" @change="reset(current)"><option value="">无（仍需逐项确认）</option><option>遮挡</option><option>裁切</option><option>模糊</option><option>不完整</option></select></label>
 <button @click="removeCell">删除此选区（不删除历史排期）</button>
 <label>完整日期<input type="date" v-model="current.date" @input="reset(current);current.yearConfirmed=false"></label>
 <label><input type="checkbox" v-model="current.yearConfirmed" :disabled="!current.date || !!current.blocked">年份由我主动输入并核对，不计入OCR准确率</label>
 <label><input type="checkbox" v-model="current.checks.date" :disabled="!!current.blocked || !current.date || !current.yearConfirmed">已核对该格完整日期（可跨月/跨年）</label>
 <label>人工同行分组<input v-model.trim="current.rowGroup" maxlength="50" placeholder="例如：会员第一行；同组格子才批量填入" @input="current.checks.tier=false"></label>
 <label>起集<input type="number" min="1" max="10000" v-model.number="current.start" @input="reset(current)"></label><label>止集<input type="number" min="1" max="10000" v-model.number="current.end" @input="reset(current)"></label><label><input type="checkbox" v-model="current.checks.episode" :disabled="!!current.blocked || !current.start || !current.end">已核对本格集数，未自动删除可疑尾数</label>
 <label>会员<select v-model="current.tier" @change="reset(current)"><option :value="null">未知（NULL）</option><option value="free">免费</option><option value="vip">VIP</option><option value="svip">SVIP</option></select></label><label><input type="checkbox" v-model="current.checks.tier" :disabled="!!current.blocked || !current.tier">我已对照会员文字/图例确认本行，非仅凭颜色</label>
 <label>排期性质<select v-model="current.status" @change="reset(current)"><option :value="null">未知</option><option value="expected">预计排期</option><option value="confirmed">已确认排期</option><option value="actual">实际更新（需另行核实）</option></select></label><label><input type="checkbox" v-model="current.checks.status" :disabled="!!current.blocked || !current.status">已人工核对排期性质，截图不自动视为已实际更新</label>
 </fieldset>
 </div>
 <fieldset :disabled="disabled"><legend>同行会员批量填入（人工来源）</legend>
 <button :disabled="!tierPreview(rows,selected)?.targets.length" @click="preview=tierPreview(rows,selected);approved=false">使用当前格已确认会员，预览同行</button>
 <template v-if="preview"><p>来源格{{preview.sourceId}}：{{preview.tier.toUpperCase()}}；已跳过格不填入。</p>
 <ul><li v-for="t in preview.targets" :key="t.id">格{{t.id}}：{{t.old||'未知'}} → {{t.next}} {{t.old&&t.old!==t.next?'（覆盖冲突，请核对）':''}}</li></ul>
 <label><input type="checkbox" v-model="approved">我已对照原图确认以上各格属于同一会员行</label><button :disabled="!approved" @click="applyRow">确认填入预览中的会员</button></template>
 </fieldset>
 <p>人工核对完成数（不是正确率）：数字{{counts.numberReviewed}}/{{rows.length}}，日期{{counts.dateReviewed}}/{{rows.length}}，会员{{counts.tierReviewed}}/{{rows.length}}；完整{{counts.complete}}/{{rows.length}}，无法确认{{counts.blocked}}/{{rows.length}}。离线标准答案不等于OCR识别结果，也不替代本次逐项核对。</p>
 <button :disabled="disabled" @click="picked=rows.filter(r=>complete(r,context)).map(r=>r.id)">勾选全部已确认</button><button @click="picked=[]">取消勾选</button>
 <p>已选可导入：{{output ? output.split('\n').length : 0}}条（人工校正，非OCR准确率）</p><pre v-if="output" class="selection-preview">{{output}}</pre>
 <button :disabled="disabled || !output" @click="send">将勾选记录送入原有导入候选</button><button :disabled="disabled" @click="exportAnnotations">下载原图、原始OCR及修改记录</button><p role="status">{{message}}</p>
 <p>不会自动保存排期。候选仍须通过原有解析、逐条确认及冲突预览；标注刷新或重新OCR前请下载，已采用文字沿用草稿。</p>
</section>
</template>
<style scoped>
.visual-editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1fr);gap:16px;align-items:start}.visual-editor .scroll{position:sticky;top:10px}.selection-preview{white-space:pre-wrap;overflow-wrap:anywhere}.calendar-review button{min-height:40px}.calendar-review input[type=checkbox]{width:22px;height:22px}.visual-editor rect[role=button]{cursor:pointer;touch-action:manipulation}@media(max-width:800px){.visual-editor{grid-template-columns:1fr}.visual-editor .scroll{position:static}}.calendar-review{border:1px solid #ccc;border-radius:8px;margin:12px 0;padding:10px}.scroll{overflow:auto}.scroll>svg{display:block;max-width:none;height:auto}.canvas-scroll{max-height:650px}.selection-canvas{touch-action:none;user-select:none}.crop{width:32%;height:100px;background:#eee}.calendar-review table{min-width:600px;font-size:12px;border-collapse:collapse}.calendar-review td{padding:6px;border:1px solid #ddd}.calendar-review fieldset{min-width:0}.calendar-review label{display:block;margin:8px 0}.calendar-review input[type=number],.calendar-review select{max-width:100%;box-sizing:border-box}.calendar-review p{font-size:12px;overflow-wrap:anywhere}
</style>
