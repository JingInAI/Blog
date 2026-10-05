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

浏览器验收包括静态来源 20 项和 HTTP 来源 12 项，均覆盖 Vue/React 的根路径与仓库子路径，另有两框架各 2 项扩展主题表单场景，总计 36 项。HTTP 场景由独立端口提供 API，验证真实跨域请求、凭据默认省略、分页、资源基址优先级、分享及失败恢复。测试服务不构成生产后端，也不证明真实服务器的 CORS 或授权设置已完成。

## 首次 GitHub Pages 发布

本项目已明确选择 Vue 作为线上发布框架，选择记录在 `.github/workflows/pages.yml` 的 build-pages.env 中，React 仍参与构建与验收。首先在 GitHub 仓库 Settings → Pages 中启用站点并选择 GitHub Actions 作为来源，确认设置已保存；无需再设置框架变量。以后如需改变发布目标，在 Settings → Secrets and variables → Actions → Variables 设置 `BLOG_FRAMEWORK=vue` 或 `react`，显式覆盖已记录的选择。其他非空变量值会令构建失败，不能静默回退。

提交工程到默认分支后，`.github/workflows/pages.yml`（**Verify and publish blog**）先验证两框架，再按上述明确选择构建一个应用；从 configure-pages 的 `base_path` 取得根/仓库子路径，只上传相应 `dist/` 目录，最后交给 `github-pages` 环境发布。默认只读取已启用的 Pages；显式提供下述 setup secret 时才尝试创建站点，不创建 API 服务。动作使用官方仓库已核对的提交 SHA。

build-pages 仅有 contents/read、pages/read，用于读取 Pages 元数据；deploy 才授予 pages/write 和 id-token/write。默认分支运行不因后续提交被取消，PR/其他分支仍可取消旧验证；部署作业继续串行。这样工作流级取消不会覆盖部署作业的保护。设置与并发规则参考 [Pages 元数据权限](https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site)、[Actions 并发](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。

如果 **build-pages → Configure Pages** 报 `Get Pages site failed` / `Not Found`，失败点是 Pages 元数据读取，应用尚未开始本次发布构建。404 本身不能确定是站点未创建、凭据不可见还是平台设置问题。查看 Settings → Pages 是否已经启用站点及 GitHub Actions 来源；免费方案支持公开仓库的 Pages，私有仓库需要支持该能力的 Pro/Team/Enterprise 方案。仓库可见性与账号方案由所有者决定，工作流不会更改。参见 [Pages 可用范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

如果设置中尚未创建站点，也可使用工作流的显式首次启用接口：在仓库 Actions Secrets 中添加 `PAGES_SETUP_TOKEN`，值为仅授权此仓库且具有 **Pages: write** 与 **Administration: write** 的管理凭据，并重新运行工作流。具备相应管理权限的所有者创建和保存该 secret；不要将凭据写进代码、内容或聊天。工作流检测到 secret 才向官方 configure-pages 传入该凭据和 `enablement: true`；没有 secret 时仍使用普通 GITHUB_TOKEN 读取既有设置。成功创建后删除 setup secret，后续部署不需要它。

普通 GITHUB_TOKEN 不支持此首次创建流程，单独把作业权限改成 pages/write 或只添加 enablement/true 不会满足管理权限要求。配置失败会保持作业失败并输出排查摘要，不猜测 basePath、不上传不完整产物，也不假报部署成功。参见 [本项目固定版本的 configure-pages 参数](https://github.com/actions/configure-pages/blob/983d7736d9b0ae728b81ab479565c72886d7745b/action.yml) 与 [创建 Pages 的 API 权限](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)。

默认分支的 verify 成功而 build-pages 失败时，独立 **diagnose-pages** 作业用普通 GITHUB_TOKEN 做两次只读 API 查询，只授予 contents/read 与 pages/read。结果写入该作业的 **Read limited authenticated Pages diagnostics** 日志及作业摘要，包含提交/运行身份、仓库的 private/hasPages、Pages 请求状态及有效响应中的 buildType/siteUrl。它不写远端分支、不创建站点，不取得管理权限；token、API 原始错误正文、响应头及额外字段均不记录。PR 和其他分支不执行此作业，诊断成功也不将失败发布改为成功。

排查时复制这段限定字段的 JSON 即可，不需要提供凭据。`hasPages: false` 是仓库 API 报告未启用 Pages 的事实；Pages `status: 404` 本身仍不能说明账号套餐或管理权限。`status: 200` 加 buildType/workflow 只证明站点元数据可读，不证明部署完成；实际地址与访问仍以 deploy 和线上验收为准。网络失败与无效响应单独记录，不能伪装成未启用。

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
