import {emptyGroup} from './pasteBatch.js'
export function quickPayload(form) {
  return {...form,total_episodes:form.category==='movie'||form.total_episodes===''?null:Number(form.total_episodes),
    link_show_id:form.link_show_id?Number(form.link_show_id):null}
}
export function selectLinkGroup(groups,link) {
  let index=groups.findIndex(g=>g.sourceUrl===link.detail_url && Number(g.targetId)===link.show_id)
  if(index>=0) return index
  index=groups.findIndex(g=>!g.original && !g.sourceUrl && !g.targetId && !g.result)
  if(index<0) {if(groups.length>=20) throw new Error('每批最多20组，请先完成当前导入');index=groups.length}
  groups[index]={...emptyGroup(),platform:link.platform,sourceUrl:link.detail_url,targetId:link.show_id,reason:'由当前作品链接带入；请核对截图归属，尚未确认'}
  return index
}
