# 开发与首次发布

项目将作者内容、共享控制器和 Vue/React 渲染适配器分开。生产内容初始为空；没有默认风格或默认文章。先应用风格，再选择内容。测试站点、文章及图片仅由测试脚本生成，不属于生产内容。

## 本地开发

使用 Node 24 LTS（`.nvmrc`）及随附 npm。依赖实际版本固定在 `package-lock.json`。

```sh
npm ci --ignore-scripts
npm run dev:vue
```

Vue 开发端口为 5173。另一个终端可运行 `npm run dev:react`，React 端口为 5174。内容和公开资源在启动时校验并生成；修改 `content/` 或 `blog.config.json` 后重启开发命令。组件代码由 Vite 热更新。

上述内容生成仅用于 static 来源。配置为 http 来源时，开发和生产构建都不读取 `content/`，不生成或复制静态内容产物；站点、目录、正文和资源由明确配置的 API 提供。本地内容即使有错误，也不会阻止 HTTP 应用构建。

```sh
npm run build:vue
npm run build:react
npm run preview:vue
```

生产目录分别为 `dist/vue/` 和 `dist/react/`。预览命令仅用于已构建的对应产物。构建为仓库子路径时，预览也必须传入同样的 base，再访问对应子路径；构建时的环境变量不会自动保留到下一条预览命令。

```sh
BLOG_FRAMEWORK=vue BLOG_BASE_PATH=/Blog/ npm run build
npm run preview:vue -- --base=/Blog/
```

上述候选产物可从 `http://127.0.0.1:4173/Blog/` 预览。React 同理使用 preview:react；域名根目录构建可直接使用默认预览命令。参数说明见 [Vite preview](https://vite.dev/guide/cli#vite-preview)。

```sh
npx playwright install chromium
npm run check
```

`check` 依次检查类型、依赖边界、契约/核心/公开产物、两应用构建和真实 Chromium 场景。Linux CI 使用 `npx playwright install --with-deps chromium` 安装浏览器系统依赖。浏览器夹具在 `.generated/e2e/` 生成，测试服务器只监听本机；不上传夹具或报告为博客内容。

浏览器验收包括静态来源 20 项和 HTTP 来源 12 项，均覆盖 Vue/React 的根路径与仓库子路径。HTTP 场景由独立端口提供 API，验证真实跨域请求、凭据默认省略、分页、资源基址优先级、分享及失败恢复。测试服务不构成生产后端，也不证明真实服务器的 CORS 或授权设置已完成。

## 首次 GitHub Pages 发布

本项目已明确选择 Vue 作为线上发布框架，选择记录在 `.github/workflows/pages.yml` 的 build-pages.env 中，React 仍参与构建与验收。在 GitHub 仓库 Settings → Pages 中选择 GitHub Actions 作为来源即可；无需再设置框架变量。以后如需改变发布目标，在 Settings → Secrets and variables → Actions → Variables 设置 `BLOG_FRAMEWORK=vue` 或 `react`，显式覆盖已记录的选择。其他非空变量值会令构建失败，不能静默回退。

提交工程到默认分支后，`.github/workflows/pages.yml` 先验证两框架，再按上述明确选择构建一个应用；从 configure-pages 的 `base_path` 取得根/仓库子路径，只上传相应 `dist/` 目录，最后交给 `github-pages` 环境发布。工作流不会启用 Pages 设置或创建 API 服务。动作使用官方仓库已核对的提交 SHA。

build-pages 仅有 contents/read、pages/read，用于读取 Pages 元数据；deploy 才授予 pages/write 和 id-token/write。默认分支运行不因后续提交被取消，PR/其他分支仍可取消旧验证；部署作业继续串行。这样工作流级取消不会覆盖部署作业的保护。设置与并发规则参考 [Pages 元数据权限](https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site)、[Actions 并发](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。

也可以手动构建选定框架，便于发布前检查：

```sh
BLOG_FRAMEWORK=vue BLOG_BASE_PATH=/Blog/ npm run build
```

`BLOG_BASE_PATH=/` 用于域名根目录。所有静态资源使用该路径，详情用 `#/content/<编码ID>`，因此详情刷新不要求服务端重写。

GitHub Pages 设置、可选仓库变量和工作流成功结果需要在真实仓库验证。本地构建通过不代表线上已发布。首次发布后检查首页、详情刷新、图片、分享/保存/恢复，再用已打开旧页面检查一次跨发布更新。

官方资料：[Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[configure-pages 输出](https://github.com/actions/configure-pages/blob/main/action.yml)、[Vite](https://vite.dev/guide/)、[Playwright CLI](https://playwright.dev/docs/test-cli)。

## 配置、分享和恢复

应用配置见 [configuration.md](configuration.md)，作者写作见 [writing.md](writing.md)，扩展主题/框架见 [extensions.md](extensions.md)。

普通会话初始优先采用有效个人配置，再采用明确作者默认，最后进入选择入口。首次加载不写入存储；之后合法修改自动尝试保存。无摘要、作者、日期或图片时不补写。

分享会话的修改只在内存，刷新回到原分享配置；“保存为个人配置”写入后清理分享参数。坏分享不会自动使用个人或作者配置。保存提示若说明地址未清理，个人记录已经更新，但刷新仍尊重原链接。重置的类似提示表示个人记录已删除，而当前内存展示尚未切换。

“采用作者默认”不删除个人记录；“重置个人配置”删除个人记录。无作者默认时回到选择入口。详情导航保留个人选择。分享结果描述当前目标与配置，配置或目标改变后旧链接不再显示为当前结果。
