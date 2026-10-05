# Blog

一个内容与渲染分离的 GitHub Pages 博客工程。共享 TypeScript 控制器依据作者内容生成页面模型，由 Vue 或 React 适配器展示；支持独立后端 API、两种网页风格、内容选择/排序、个人配置和分享恢复。

生产内容初始为空，不生成示例文章、作者、摘要或封面。框架在构建时选择，内容和风格在网页中选择。

需要 Node 24 LTS。

```sh
npm ci --ignore-scripts
npm run dev:vue
```

React 使用 `npm run dev:react`。构建命令为 `npm run build:vue` / `npm run build:react`；输出 `dist/vue/` / `dist/react/`。

```sh
npx playwright install chromium
npm run check
```

已明确选择 Vue 作为线上发布框架，工作流中已记录此选择，React 继续构建与验收。首次发布在 GitHub Pages 选择 GitHub Actions；无需额外框架变量。若以后要改变发布目标，可设置仓库变量 `BLOG_FRAMEWORK=vue` 或 `react`，显式覆盖工作流选择。工作流验证双框架后只上传选定应用的公开产物。

- [开发与首次发布](docs/usage.md)
- [内容字段、Markdown 与公开规则](docs/writing.md)
- [静态/API 配置](docs/configuration.md)
- [主题与新框架扩展](docs/extensions.md)
- [设计规格](docs/specs/design.md)
- [实施计划](docs/plans/plan.md)
- [执行和验证记录](docs/plans/execution.md)

本地工程验收与实际线上发布分开记录，详情见执行记录。
