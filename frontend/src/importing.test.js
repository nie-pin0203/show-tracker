import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceLabel, readImportFile, manualRecord, platformLatest } from './importing.js'

test('imports accept UTF-8 JSON/CSV and reject excessive size, encoding and extensions', async () => {
  assert.deepEqual(await readImportFile(new File(['[]'], '作品.JSON')), {format:'json',content:'[]'})
  assert.equal((await readImportFile(new File(['title\n作品'], '作品.csv'))).format,'csv')
  await assert.rejects(readImportFile({size:1024*1024+1}),/1MiB/)
  await assert.rejects(readImportFile(new File(['x'],'x.exe')),/JSON/)
  await assert.rejects(readImportFile(new File([new Uint8Array([255])],'x.csv')))
})
test('manual blank values stay unknown while explicit zero is preserved', () => {
  assert.deepEqual(manualRecord({title:'作品',latest_episode:'0',score:'8.2',total_episodes:'',poster_url:null}),{title:'作品',latest_episode:0,score:8.2})
  assert.throws(() => manualRecord({latest_episode:'invalid'}),/有效数字/)
})
test('source labels distinguish manual, file and archival examples', () => {
  assert.equal(new Set(['manual','file_import','mock'].map(sourceLabel)).size,3)
  assert.equal(sourceLabel('invalid'),'来源未知')
})
test('audience-specific imported observation takes precedence over public identity-unknown count', () => {
  const p={observations:{vip:{latest_episode:12},free:{latest_episode:0}},public_observation:{latest_episode:20}}
  assert.equal(platformLatest(p,'vip').latest_episode,12)
  assert.equal(platformLatest(p,'free').latest_episode,0)
  assert.equal(platformLatest({public_observation:{latest_episode:20}},'free').latest_episode,20)
})
