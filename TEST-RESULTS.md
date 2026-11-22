# 纯浏览器版本清理与验收

仅在 `show-tracker-static` 隔离副本操作。FastAPI、Python 业务代码、SQLite 初始化与迁移、Render 和 Linux 部署配置在本轮开始时已不在该目录。

## 删除文件

- `frontend/src/api.js`。移除模拟请求分发层。组件直接调用本机数据操作。
- `frontend/src/api.test.js`。其本机数据测试迁至 `frontend/src/library.test.js`。
- `frontend/src/monitoring.js`、`frontend/src/monitoring.test.js`。移除已停用的采集辅助代码。
- `frontend/src/OcrDiagnostics.vue`、`frontend/src/ocrDiagnostics.js`、`frontend/src/ocrDiagnostics.test.js`。移除无引用的 OCR 诊断组件与测试，本机截图、框选和手动核对仍可用。

## 新增与修改文件

| 文件 | 变更 |
| --- | --- |
| `frontend/src/library.js`、`frontend/src/library.test.js` | 作品、收藏、进度、评分、排期、活动与导入直接使用 IndexedDB，覆盖改造后的本机操作 |
| `MediaWorkspace.vue`、`MediaDetail.vue`、`ImportPanel.vue`、`LinksPanel.vue`、`SmartImport.vue` | 在原有视图调用本机操作，去掉采集状态、授权同步选择和旧识别提示 |
| `CompetitionEditor.vue`、`CompetitionWorkspace.vue`、`EventEditor.vue`、`EventWorkspace.vue`、`TrackerHub.vue` | 保留活动、日历、关注和设置的布局与本机记录，去掉联网重连和后台消息处理 |
| `frontend/sw.js`、`frontend/src/pwa.js`、`worker.test.js` | 移除推送和通知代码，保留静态缓存及手动更新 |
| `screenshot.js`、`screenshot.test.js` | 去掉 OCR 请求，仅保留图片校验、预览与人工核对 |
| `localMedia.js`、`importing.js`、`importing.test.js`、`platforms.test.js` | 移除采集字段与独立请求模式，确认来源及链接行为 |
| `layout.css` | 删除旧登录表单样式 |
| `.gitignore`、`README.md`、`TEST-RESULTS.md` | 清理项目规则，记录发布步骤和验证结果 |

Vue 文件及未写路径的 JS 文件均在 `frontend/src/`。

## 发布源码目录

```text
show-tracker/
├── .github/workflows/deploy.yml
├── .gitignore
├── README.md
├── TEST-RESULTS.md
├── fixtures/                 # 浏览器回归样本
└── frontend/
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── sw.js
    ├── public/              # 图标与 PWA 清单
    └── src/                 # Vue、样式、IndexedDB、业务代码和测试
```

## 验收结果

| 项目 | 结果 |
| --- | --- |
| 安装依赖 | `npm ci` 通过 |
| 全部前端测试 | 68 项通过，覆盖空库、作品、进度、收藏、评分、日期排期、导入导出和事务保护 |
| 生产构建 | `npm run build` 通过。HTML、JS、CSS、图标和 PWA 清单指向 `/show-tracker/` |
| 关键词审查 | 生产应用无请求地址、认证或云端配置依赖。Vite 保留本机开发配置，忽略规则保留历史数据文件的排除保护 |
| 浏览器 | Edge 实测空库、建档、收藏、个人评分、排期详情及进度修改 |
| 离线与移动尺寸 | 停止预览并确认端口不可访问后，在 390×844 Edge 视口刷新，作品与收藏仍可读。修改观看进度并再次刷新，数据仍在 |
| 公网状态 | 目标网址当前为 404。手机实机和公网地址待发布后验收 |

[Windows 中文发布步骤](README.md#windows-发布到-github-pages)
