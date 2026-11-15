# 版本管理

首次正式记录从 **0.8.0** 开始。写表、选卡、存档和资料维护已具备，规则与数据结构仍在完善，暂不宣称 1.0 稳定版。原 package.json 的 1.0.0 是初始化值，不追溯编造历史发行版本。

日常工作只更新 `CHANGELOG.md` 的「未发布」部分；已发布版本与日期以更新日志为准。

用户明确要求「上传代码／发布」时：

1. 检查待上传差异，补齐面向用户的更新说明，不把临时实验、未完成内容写成已完成。
2. 执行 `python tools/release.py prepare`。首次使用 0.8.0；之后有「新增」内容默认递增次版本，否则递增修订号。也可明确传 `--bump minor` 或 `--bump patch`。
3. 脚本同步 package.json / package-lock.json、填写本地日期，并保留一个新的「未发布」区。较大功能如 0.8.0 → 0.9.0；修复如 0.8.0 → 0.8.1。1.0.0 由用户决定。
4. 完成相关测试与 `npm run build`，执行 `python tools/release.py check`，再按用户要求提交和上传。GitHub Pages CI 同样检查版本记录。
5. 上传失败后重试同一版。没有新的未发布内容时，不重复递增版本。

## 日志保留

主 `CHANGELOG.md` 保留「未发布」及最近 **10 个已发布版本**，按新到旧排列；更早版本保存在 `docs/changelog/YYYY.md`，永久保留。10 个是针对本项目频繁迭代选择的阅读窗口，并非外部规范的硬性要求。

采用 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的未发布区、日期和分类方式；参考 [Vite 的更新日志](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md) 将当前记录与旧记录分开查阅。这里只管理本仓库，不修改同级仓库。

当前自动上传仍暂停。此流程只在用户明确要求上传时运行，不设置定时上传、自动提交或自动推送。
