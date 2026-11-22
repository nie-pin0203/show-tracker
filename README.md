# Show Tracker 本地版

Vue 3 + Vite 的静态应用。首次使用是空作品库，作品、收藏、进度、评分和排期写入当前浏览器的 IndexedDB。不同浏览器和设备独立保存，可在「我的 → 本地数据导入与导出」通过 JSON 转移。原有页面、导航和手机底栏继续使用。赛事、演出与活动可手动记录，截图可在本机框选与核对。

## Windows 本机运行

用资源管理器打开解压目录，在地址栏输入 `powershell`，然后执行：

```powershell
cd frontend
npm ci
npm test
npm run build
npm run preview
```

打开终端所显示的 `/show-tracker/` 预览网址。日常开发用 `npm run dev`。Vite 预览仅用于本机检查，发布时由 GitHub Pages 直接提供构建资源。首次打开生产版后，在「我的 → 安装与离线」确认应用资源已缓存。

## Windows 发布到 GitHub Pages

1. 登录 GitHub，点击右上角「+ → New repository」，创建 `nie-pin0203/show-tracker`。免费 Pages 使用公开仓库。保留空仓库，之后推送解压出的源码。仓库用于托管项目代码与测试夹具。
2. 用资源管理器打开源码包解压目录，在地址栏输入 `powershell` 并回车。运行以下命令。已有仓库应先检查其 Git 状态和历史。

   ```powershell
   git init -b main
   git add .
   git diff --cached --name-only
   git commit -m "Publish Show Tracker local edition"
   git remote add origin https://github.com/nie-pin0203/show-tracker.git
   git push -u origin main
   ```

3. 在仓库点「Settings（设置） → Pages（页面）」。在「Build and deployment（构建与部署） → Source（来源）」选择「GitHub Actions」。
4. 点「Actions（工作流） → Publish Show Tracker → Run workflow（运行工作流）」，分支选择 `main`。工作流依次执行 `npm ci`、`npm test` 和 `npm run build`，构建成功后才发布 `frontend/dist`。以后推送 `main` 自动发布。
5. 工作流成功后，在电脑和手机打开 [Show Tracker](https://nie-pin0203.github.io/show-tracker/)。Android Chrome 可从菜单安装或添加到主屏幕。iPhone Safari 通过「分享 → 添加到主屏幕」。首次缓存完成后可离线打开并修改记录。

网站使用免费 GitHub Pages，打开网站无需账号。推送代码时请使用自己的 GitHub 登录。业务记录和 JSON 导出文件请保存在设备上。在新设备打开站点后选择导出的 JSON，查看数量预览，再确认替换本机数据。

## 使用

- 「影视 → 添加或编辑作品、排期和评分」。名称、类型和平台足以建档。补充已知排期或评分后，点「校验并预览」及「提交整批导入」。
- 在作品卡片点击收藏或保存进度。作品详情显示已录入的排期和评分历史。「日历」可打开综合日历或影视七日日历。
- 「我的 → 导出 JSON」保存当前已提交记录。导入从本地版导出的文件会替换当前作品库，必须明确确认。清理浏览器站点数据前请先导出。

[测试报告与修改清单](TEST-RESULTS.md) · [GitHub Pages 工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
