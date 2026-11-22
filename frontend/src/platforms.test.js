import test from 'node:test'
import assert from 'node:assert/strict'
import {groupPastedText} from './pasteBatch.js'
import {readFileSync} from 'node:fs'
test('three video platforms group separately; retired platform cannot become selected',()=>{
 for(const [platform,url] of [['腾讯视频','https://v.qq.com/x/cover/test.html'],['爱奇艺','https://www.iqiyi.com/v_test.html'],['优酷','https://v.youku.com/v_show/id_test.html']]) {
  const [g]=groupPastedText(`作品名称：测试\n平台：${platform}\n${url}`);assert.equal(g.platform,platform);assert.equal(g.targetId,'')
 }
 assert.equal(groupPastedText('作品名称：旧作品\n平台：芒果TV\nhttps://www.mgtv.com/h/123.html')[0].platform,'')
})
test('link management offers only local modes and opens official pages through links',()=>{
 const vue=readFileSync(new URL('./LinksPanel.vue',import.meta.url),'utf8')
 assert.deepEqual(Array.from(vue.match(/<label>模式<select.+?<\/select>/)[0].matchAll(/<option value="(.*?)"/g), m => m[1]), ['link','manual'])
 assert.match(vue, /rel="noopener noreferrer"/)
 assert.ok(vue.includes("mode:'link'"))
})
