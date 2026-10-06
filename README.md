# Blog

一个内容与渲染分离的 GitHub Pages 博客工程。共享 TypeScript 控制器依据作者内容生成页面模型，由 Vue 或 React 适配器展示；支持独立后端 API、两种网页风格、内容选择/排序、个人配置和分享恢复。

内容模块当前包含一篇用户授权的 RSI 长文，标题、摘要、标签和 22 张配图来自指定原文；导入规则和测试见 [内容导入记录](docs/specs/understanding-rsi-import.md)。框架在构建时选择，内容和风格在网页中选择。

线上站点：[https://jinginai.github.io/Blog/](https://jinginai.github.io/Blog/)，Vue 已发布；[对应的 Actions 运行](https://github.com/JingInAI/Blog/actions/runs/37428114955) 验证、构建和部署全部成功。

需要 Node 24 LTS。

```sh
npm ci --ignore-scripts
npm run dev:vue
```

Vue 使用本机 5173 端口，React 使用 `npm run dev:react` 和 5174 端口，两者可以同时启动。构建命令为 `npm run build:vue` / `npm run build:react`；输出 `dist/vue/` / `dist/react/`。

```sh
npx playwright install chromium
npm run check
```

最新审查见 [字节、来源配置与输出边界记录](docs/specs/boundary-lifecycle-audit.md)。本轮修复五类问题：非法 UTF-8 被替换成作者字符、可变来源配置污染异步身份、超时输入校验不一致、不可克隆事件打断初始化、已有文件被当作输出目录覆盖。新增十七项逻辑测试，其中十四项先复现失败再修复，三项补验合法编码、目录输出和回调；新增四项非法字节 API 响应与恢复的浏览器场景。前轮证据保留于 [输入准确性](docs/specs/input-fidelity-audit.md)、[版本与生命周期](docs/specs/version-lifecycle-audit.md)、[内容完整性](docs/specs/integrity-audit.md) 和 [可靠性记录](docs/specs/reliability-audit.md)。

首次线上发布已于 2026-10-06 完成，真实 HTTPS 页面、资源、两主题、分享与个人配置恢复及移动端验收通过；首次发布时内容为空；本轮新增授权 RSI 文章与配图，正在进行内容发布及跨版本线上验收，真实 API 未接入。发布前 CI 标记下的完整本地复核通过：155 项逻辑/构建测试、类型与模块边界检查、双框架构建和 65 项浏览器测试；报告位于 `playwright-report/index.html`。两来源、两框架验证作者元数据及富 Markdown；不安全链接保留作者文字并给诊断，不阻断静态文章构建。API 请求超时覆盖 JSON 正文读取，取消或超时后迟到的适配器解析不能返回成功；本机 HTTP 回归验证正文中途取消、超时和显式重试。扩展主题字段只读取自有 JSON 值，与对象原型同名的合法字段也能填写、保存、刷新及清除，不把继承值显示为默认。每次开发启动和生产构建均隔离内容与缓存，同端口的新启动失败也不覆盖运行中的页面；单次或重复信号正常关闭清理实例目录，支持为不同内容使用独立输出目录并发构建。普通 push/PR 只执行验证；发布可在默认分支手动运行工作流并勾选 publish（默认关闭），或显式推送提交标题以 `[publish-pages] ` 开头的发布提交。只有默认分支可发布。已明确选择 Vue 作为线上框架，React 继续构建与验收。GitHub Pages 使用 GitHub Actions 来源；可选仓库变量 `BLOG_FRAMEWORK=vue` 或 `react` 可覆盖框架选择。显式发布运行验证双框架后只上传选定应用的公开产物。

- [开发与首次发布](docs/usage.md)
- [内容字段、Markdown 与公开规则](docs/writing.md)
- [静态/API 配置](docs/configuration.md)
- [主题与新框架扩展](docs/extensions.md)
- [设计规格](docs/specs/design.md)
- [实施计划](docs/plans/plan.md)
- [执行和验证记录](docs/plans/execution.md)

本地工程验收与实际线上发布分开记录，详情见执行记录。
