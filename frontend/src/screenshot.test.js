import test from 'node:test'
import assert from 'node:assert/strict'
import {IMAGE_LIMIT, pastedFiles, handleImagePaste, validateImage, imageSelection, reviewedText} from './screenshot.js'
import {groupPastedText} from './pasteBatch.js'

const png=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'})
function model(decode=async()=>{}) {
  let n=0;const released=[]
  return {released,selection:imageSelection({create:()=>`blob:${++n}`,revoke:url=>released.push(url),decode})}
}

test('Ctrl+V image event uses explicit clipboard files and preserves ordinary text paste',()=>{
  const file=png();let stopped=0,accepted=[]
  assert.equal(handleImagePaste({clipboardData:{items:[{kind:'file',getAsFile:()=>file}]},preventDefault(){stopped++}},f=>accepted=f),true)
  assert.deepEqual(accepted,[file]);assert.equal(stopped,1)
  assert.equal(handleImagePaste({clipboardData:{items:[{kind:'string'}]},preventDefault(){stopped++}},()=>assert.fail()),false)
  assert.equal(stopped,1)
  assert.deepEqual(pastedFiles({files:[file]}),[file]) // File picker and drag/drop use the same path.
})

test('formats are checked using MIME and bytes; invalid oversized and empty files rejected',async()=>{
  await validateImage(png())
  await validateImage(new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'}))
  await validateImage(new Blob(['RIFF0000WEBP'],{type:'image/webp'}))
  await assert.rejects(validateImage(new Blob(['<svg/>'],{type:'image/svg+xml'})),/PNG/)
  await assert.rejects(validateImage(new Blob(['not a PNG'],{type:'image/png'})),/内容与格式/)
  await assert.rejects(validateImage(new Blob([],{type:'image/png'})),/不能为空/)
  await assert.rejects(validateImage({type:'image/png',size:IMAGE_LIMIT+1}),/8MiB/)
})

test('deleting and reselecting the same image release previews; invalid replacement preserves original',async()=>{
  const {selection,released}=model();const file=png()
  await selection.select([file]);const original=selection.current
  await assert.rejects(selection.select([file,file]),/一次/)
  assert.equal(selection.current,original)
  selection.clear();assert.equal(selection.current,null);assert.deepEqual(released,['blob:1'])
  await selection.select([file]);assert.equal(selection.current.url,'blob:2')
  await selection.select([file]);assert.deepEqual(released,['blob:1','blob:2'])
  selection.clear();assert.deepEqual(released,['blob:1','blob:2','blob:3'])
})

test('corrupted decode and late completion cannot resurrect a deleted screenshot',async()=>{
  const broken=model(async()=>{throw new Error('bad decode')})
  await assert.rejects(broken.selection.select([png()]),/bad decode/);assert.deepEqual(broken.released,['blob:1'])
  let finish;const {selection,released}=model(()=>new Promise(r=>{finish=r}))
  const waiting=selection.select([png()])
  while(!finish) await new Promise(r=>setImmediate(r))
  selection.clear();finish();assert.equal(await waiting,null);assert.equal(selection.current,null)
  assert.deepEqual(released,['blob:1'])
})

test('manually corrected text requires confirmation and enters the existing group workflow',()=>{
  const text='作品名称：截图测试\n平台：腾讯视频\nhttps://v.qq.com/x/cover/test1.html\n2026-11-01 VIP 更新第1-2集'
  assert.throws(()=>reviewedText('',text,false),/确认/)
  assert.equal(reviewedText('旧原文',text,true),`旧原文\n\n${text}`)
  const groups=groupPastedText(reviewedText('',text,true))
  assert.equal(groups.length,1);assert.equal(groups[0].groupConfirmed,false);assert.equal(groups[0].result,null)
  assert.throws(()=>reviewedText('x'.repeat(30000),text,true),/超过/)
})
