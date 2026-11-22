import test from 'node:test'
import assert from 'node:assert/strict'
import {quickPayload,selectLinkGroup} from './quickLinks.js'
import {emptyGroup} from './pasteBatch.js'
const link={platform:'腾讯视频',detail_url:'https://v.qq.com/x/cover/test.html',show_id:31}
test('unknown optional data stays null and name candidates never supply an association',()=>{
 const p=quickPayload({title:'同名',total_episodes:'',link_show_id:''})
 assert.equal(p.total_episodes,null);assert.equal(p.link_show_id,null)
 assert.equal(quickPayload({total_episodes:'30',link_show_id:'31'}).link_show_id,31)
 assert.ok(!('score' in p));assert.ok(!('update_date' in p))
})
test('jump to screenshot reuses empty group and returning preserves text and selected identity',()=>{
 const groups=[emptyGroup()]
 assert.equal(selectLinkGroup(groups,link),0);assert.equal(groups.length,1)
 assert.equal(groups[0].targetId,31);assert.equal(groups[0].groupConfirmed,false)
 groups[0].original='人工输入';assert.equal(selectLinkGroup(groups,link),0);assert.equal(groups[0].original,'人工输入')
 assert.equal(selectLinkGroup(groups,{...link,show_id:32,detail_url:'https://v.qq.com/x/cover/other.html'}),1)
 assert.equal(groups[0].targetId,31)
})
