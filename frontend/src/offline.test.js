import test from 'node:test'
import assert from 'node:assert/strict'
import { clearLocalDrafts, progressDraft, readFormDraft, saveProgressDraft, writeFormDraft } from './offline.js'

test('local drafts persist independently and restoring a library clears only this app’s drafts', t => {
  const disk = { otherProject:'keep', getItem(key){ return this[key] ?? null },
    setItem(key,value){ this[key]=value }, removeItem(key){ delete this[key] } }
  const old = Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  Object.defineProperty(globalThis,'localStorage',{ configurable:true,value:disk })
  t.after(() => {
    if (old) Object.defineProperty(globalThis,'localStorage',old)
    else delete globalThis.localStorage
  })
  saveProgressDraft({ 1:4 },{ 1:2 })
  writeFormDraft('event/performance/1',{ data:{ title:'draft' },version:1 })
  assert.deepEqual(progressDraft(),{ 1:{ value:'4',version:2 } })
  assert.equal(readFormDraft('event/performance/1').data.title,'draft')
  clearLocalDrafts()
  assert.deepEqual(progressDraft(),{})
  assert.equal(readFormDraft('event/performance/1'),null)
  assert.equal(disk.otherProject,'keep')
})
