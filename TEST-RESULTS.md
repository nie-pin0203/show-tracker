# 手动录入简化版验收记录

2026-11-25，仅修改 work/show-tracker-static 隔离副本。

## 功能变化

- 影视添加保留名称、类型、平台、普通作品链接、总集数/期数和备注。保留电视剧、电影、综艺、国漫，支持腾讯、爱奇艺、优酷、哔哩哔哩、芒果TV和其他。
- 赛事添加保留名称、原有赛事类型、日期、时间和备注，电竞及体育分别保存。
- 演出添加保留名称、艺人/团体、日期、时间、地点和备注。音乐节采用手动添加，旧多舞台、阵容和票务记录仍可编辑。
- 活动添加保留名称、类型、日期、时间、地点、链接和备注，保留已有自定义分类。
- 四个添加表单共用 ManualAdd.vue，名称置顶，桌面双列、650px以下单列，输入框和主要按钮至少44px。按钮统一为「添加」「清空表单」。
- 移除截图粘贴、拖拽上传、图片预览、日历框选、识别校正、文字分组解析及URL平台/ID识别。对应组件、函数、专属测试和图片夹具已清理。没有OCR或AI依赖。
- 移除桌面及发现页的「导入与来源」，删除 tools/sources 路由及页面内容，旧入口回到首页。左侧保留七个菜单。
- 作品编辑器迁入影视模块并默认折叠。手动排期、评分历史、电影发行记录和跨平台关联编辑继续可用。「我的」JSON备份、导出及确认恢复继续可用。

## 数据兼容

沿用 IndexedDB 名称 show-tracker-local-v1、数据库版本和已有集合含义。启动和构建不读取或清空用户浏览器数据。保留旧链接、日历链接、评分、排期、收藏、进度、赛事子记录、阵容、票务与历史字段。

普通URL仅进行HTTP/HTTPS安全校验和同平台完全相同URL查重。重复链接提示编辑已有作品，同名记录独立保存，平台和标题完全手填。未知字段为NULL，添加作品不会生成排期。

## 实际自动化验证

- npm test，32项全部通过。退休功能专属测试随代码移除，本次数量不与旧68项直接比较。
- 新增测试覆盖六种平台、空选填项、普通URL、零网络请求、同名独立、重复链接保护、北京时间、无时间日期、非法日期回滚、赛事/演出/音乐节/活动日历、活动编辑子记录保护、评分/排期/收藏/关注和JSON备份往返。
- 保留测试覆盖进度并发保护、持久化、导入事务、CSV兼容、排期统计、日期切换、离线草稿和Service Worker安装/更新/离线行为。
- npm run build成功，50模块构建。产物包含首页、JS、CSS、图标、manifest和Service Worker，保持 /show-tracker/ 子路径和原GitHub Actions流程。
- 构建内容变化自动生成新的Service Worker缓存版本，更新提示及未保存编辑确认沿用现有实现。

## 验证边界及人工验收

浏览器自动化工具超时，备用Edge启动未输出可验证的页面DOM。本轮未完成桌面实际点击、浏览器重开、控制台错误检查及手机实机验收。未读取或写入真实设备历史库，数据兼容使用隔离的fake-indexeddb验证。

本地运行 cd frontend、npm ci、npm run dev，打开终端给出的 /show-tracker/ 地址。在测试浏览器逐项添加、编辑四个模块，测试选填全空、收藏进度、搜索筛选、日历和JSON导出恢复。桌面检查双列，手机检查单列与触控。更新PWA时先保存编辑，再点击更新提示并检查离线打开。

## 发布文件

完整发布包包含源码和 frontend/dist。原工作流继续执行 npm ci、npm test、npm run build 后发布 frontend/dist。本轮未提交、推送或部署线上仓库。

## 完整文件变化清单

M为修改，D为删除，A为新增。ImportPanel.vue迁移为MediaEditor.vue。构建目录不纳入Git，随发布包提供。

| Status | File |
| --- | --- |
| M | `README.md` |
| M | `TEST-RESULTS.md` |
| D | `fixtures/generic_playlist/source.png` |
| D | `fixtures/tencent_calendar_lowres/annotation.json` |
| D | `fixtures/tencent_calendar_lowres/confirmed-2026.csv` |
| D | `fixtures/tencent_calendar_lowres/numbers.json` |
| D | `fixtures/tencent_calendar_lowres/pending.csv` |
| D | `fixtures/tencent_calendar_lowres/source.png` |
| D | `fixtures/tencent_calendar_lowres/standard.json` |
| M | `frontend/src/App.vue` |
| M | `frontend/src/CompetitionEditor.vue` |
| M | `frontend/src/CompetitionWorkspace.vue` |
| M | `frontend/src/EventEditor.vue` |
| M | `frontend/src/EventWorkspace.vue` |
| D | `frontend/src/ImportPanel.vue` |
| D | `frontend/src/LinksPanel.vue` |
| M | `frontend/src/MediaDetail.vue` |
| M | `frontend/src/MediaWorkspace.vue` |
| D | `frontend/src/ScreenshotInput.vue` |
| D | `frontend/src/SmartImport.vue` |
| D | `frontend/src/TencentCalendarReview.vue` |
| M | `frontend/src/TrackerHub.vue` |
| D | `frontend/src/calendarRegions.test.js` |
| M | `frontend/src/library.js` |
| M | `frontend/src/library.test.js` |
| M | `frontend/src/localImport.js` |
| M | `frontend/src/localMedia.js` |
| M | `frontend/src/navigation.js` |
| M | `frontend/src/navigation.test.js` |
| D | `frontend/src/pasteBatch.js` |
| D | `frontend/src/pasteBatch.test.js` |
| D | `frontend/src/pasteImport.js` |
| D | `frontend/src/pasteImport.test.js` |
| D | `frontend/src/platforms.test.js` |
| D | `frontend/src/quickLinks.js` |
| D | `frontend/src/quickLinks.test.js` |
| D | `frontend/src/screenshot.js` |
| D | `frontend/src/screenshot.test.js` |
| D | `frontend/src/tencentCalendar.js` |
| D | `frontend/src/tencentCalendar.test.js` |
| D | `frontend/src/tencentCalendarBenchmark.test.js` |
| A | `frontend/src/ManualAdd.vue` |
| A | `frontend/src/MediaEditor.vue` |
| A | `frontend/src/manualForms.js` |
| A | `frontend/src/manualForms.test.js` |
