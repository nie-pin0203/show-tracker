<script setup>
import {ref, computed, onUnmounted} from 'vue'
import TencentCalendarReview from './TencentCalendarReview.vue'
import {pastedFiles, handleImagePaste, imageSelection, reviewedText} from './screenshot'
const props=defineProps({modelValue:{type:String,default:''},disabled:Boolean})
const emit=defineEmits(['update:modelValue','group'])
const selection=imageSelection(), picture=ref(null), error=ref(''), selecting=ref(false)
const candidate=ref(''), checked=ref(false), imageSize=ref(null)
const reviewReport=computed(()=>imageSize.value?{...imageSize.value,lines:[],text:'',image_sha256:null,mode:'manual_no_ocr'}:null)
function correctedText(text){if(text.length>30000){error.value='修正文字超过30000字，请分批';return}candidate.value=text;checked.value=false}
let generation=0, disposed=false
async function accept(files) {
  if(props.disabled) return
  const version=++generation
  selecting.value=true;error.value=''
  try {
    const next=await selection.select(files)
    if(next && !disposed && version===generation) {imageSize.value=null;picture.value=next;candidate.value='';checked.value=false}
  } catch(e) {if(version===generation && !disposed) error.value=e.message}
  finally {if(version===generation) selecting.value=false}
}
function paste(event) {
  handleImagePaste(event,accept)
}
function drop(event) {event.preventDefault();accept(pastedFiles(event.dataTransfer))}
function choose(event) {const files=Array.from(event.target.files ?? []);event.target.value='';if(files.length) accept(files)}
function remove() {generation++;selection.clear();imageSize.value=null;picture.value=null;candidate.value='';checked.value=false;selecting.value=false;error.value=''}
function adopt() {
  try {emit('update:modelValue',reviewedText(props.modelValue,candidate.value,checked.value));candidate.value='';checked.value=false;error.value=''}
  catch(e) {error.value=e.message}
}
onUnmounted(()=>{disposed=true;remove()})
defineExpose({paste})
</script>

<template>
  <section class="screenshot-input" aria-label="追剧日历截图导入">
    <h3>截图导入 · 人工核对</h3>
    <p>展开智能导入后，点此区域按Ctrl+V，或拖入/选择PNG、JPG、WebP；一次一张，最大8MiB。普通文字粘贴照常使用。</p>
    <div class="screenshot-columns">
      <div class="drop-zone" tabindex="0" aria-label="截图粘贴与拖拽区域" @dragover.prevent @drop="drop">
        <label>选择或重新上传截图<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="disabled" @change="choose"></label>
        <p v-if="selecting" role="status">正在校验图片…</p>
        <template v-if="picture"><img @load="imageSize={width:$event.target.naturalWidth,height:$event.target.naturalHeight}" :src="picture.url" alt="用户提供的追剧日历截图，供人工核对"><p>{{picture.file.name || '剪贴板截图'}}</p><button @click="remove" :disabled="disabled">删除截图</button></template>
        <p v-else>截图预览在这里；可先点击此区域再粘贴。</p>
        <p>截图和未追加的核对文字仅留在当前页面，刷新后需重贴；下方待整理文字按原有草稿机制保存。删除截图不删除已录入文字。</p>
      </div>
      <div>
        <p>截图留在本机。请框选日历格子，逐项核对实际日期、集数和会员层级。</p>
        <div v-if="candidate">
          <label>框选后已核对的文字<textarea v-model="candidate" rows="8" maxlength="30000" :disabled="disabled" @input="checked=false"></textarea></label>
          <label><input type="checkbox" v-model="checked" :disabled="disabled">已对照截图核对候选文字，未确认内容已删除或留空</label>
          <button @click="adopt" :disabled="disabled || !checked">追加到待整理文字</button>
        </div>
        <label>待整理文字 / 人工录入<textarea :value="modelValue" @input="emit('update:modelValue',$event.target.value)" rows="10" maxlength="30000" :disabled="disabled" placeholder="对照截图逐行输入，补充人工确认的作品名称、平台、作品URL和完整日期。&#10;不明确的日期、会员层级或集数不填写。"></textarea></label>
        <button @click="emit('group')" :disabled="disabled || !modelValue.trim()">送入现有多作品分组（替换当前分组）</button>
        <p>分组后补齐作品URL，再点“解析全部作品组”；沿用字段确认、排期预览、冲突处置和最终事务导入。</p>
      </div>
    </div>
        <TencentCalendarReview v-if="reviewReport && picture" :report="reviewReport" :image-url="picture.url" :image-file="picture.file" :disabled="disabled" @text="correctedText" />
    <p v-if="error" role="alert" class="image-error">{{error}}</p>
  </section>
</template>

<style scoped>
.screenshot-input{margin:16px 0;padding:14px;background:#f8f9fb;border:1px solid #ddd;border-radius:10px}.screenshot-input h3{margin-top:0;font-size:16px}.screenshot-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.screenshot-columns>div{min-width:0}.drop-zone{border:2px dashed #b4bcb7;border-radius:8px;padding:12px;align-self:start}.drop-zone:focus{outline:2px solid #23392e}.drop-zone img{display:block;width:100%;max-height:620px;object-fit:contain;background:#eee;margin-top:12px}.screenshot-input textarea{display:block;width:100%;box-sizing:border-box;resize:vertical;padding:9px;border:1px solid #ccc;border-radius:6px;font:inherit}.screenshot-input label{font-size:13px;overflow-wrap:anywhere}.screenshot-input input[type=file]{display:block;max-width:100%;margin:8px 0}.screenshot-input p{font-size:12px;line-height:1.7}.image-error{color:#a82d24}@media(max-width:800px){.screenshot-columns{grid-template-columns:1fr}}
</style>
