# 开发与首次发布

项目将作者内容、共享控制器和 Vue/React 渲染适配器分开。生产内容初始为空；没有默认风格或默认文章。首次选择风格后选择内容；风格和间距即时生效。测试站点、文章及图片仅由测试脚本生成，不属于生产内容。

Vue 博客地址为 [https://jinginai.github.io/Blog/](https://jinginai.github.io/Blog/)。2026-10-06 首次发布后，已完成授权 RSI 全文与 22 图发布，最终 [Actions 运行](https://github.com/JingInAI/Blog/actions/runs/37433960384) 成功；实际版本、证据与验收边界见 [执行记录](plans/execution.md)。以下本地命令不需要 GitHub 认证或 Pages 设置。

## 本地开发

使用 Node 24 LTS（`.nvmrc`）及随附 npm。依赖实际版本固定在 `package-lock.json`。

```sh
npm ci --ignore-scripts
npm run dev:vue
```

Vue 开发端口为 5173。另一个终端可运行 `npm run dev:react`，React 端口为 5174。内容和公开资源在启动时校验并生成；修改 `content/` 或 `blog.config.json` 后重启开发命令。组件代码由 Vite 热更新。

两应用可以同时启动。每次开发启动独立生成 `.generated/dev-<框架>-<端口>-<UUID>/`，内容在 public、依赖优化缓存在 vite-cache；不同框架、不同端口以及同端口的失败启动都不覆盖已有实例。端口被占用时新启动仍直接失败，运行中的页面和内容版本保持不变。启动失败或正常关闭（Ctrl+C/SIGTERM）会清理本次目录；每次重启重新优化依赖。需要其他端口时使用 `BLOG_DEV_PORT=5183 npm run dev:vue`（1–65535）；`npm run dev:vue -- --force` 将 force 传给本实例优化器。本地浏览器回归使用独立端口，不占用 5173/5174。

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

浏览器 webServer 在本机/Linux CI 使用 SIGTERM 和 10 秒宽限时间关闭；开发夹具等待子进程关闭后再退出。正常关闭会清理各实例目录，重复信号也等待同一关闭任务。Playwright 原默认 SIGKILL 无法执行此清理，配置和验收证据见 [configuration.md](configuration.md) 与 [execution.md](plans/execution.md)。

当前逻辑/构建测试为 158 项（implementation-17 的 153 项、两项 CI 限定诊断测试及三项阅读偏好回归），类型与模块边界另行检查。这些测试包括 Vue/React 各一项真实并发构建回归：同框架、不同作者内容及独立输出同时构建，各自目录、正文和内嵌 buildId 一致；另有四项单次 SIGTERM/SIGINT 和两项重复 SIGTERM 的真实进程关闭回归，验证监听关闭和本次目录清理。静态发布回归验证不安全链接保留原文/诊断、真实附件映射，以及不安全图片仍失败并保留旧产物。六项请求生命周期回归验证本机 HTTP 响应头前/正文中取消、部分 JSON 超时与显式重试，以及可注入适配器在取消/超时后迟到解析不能成功，错误 HTTP 状态与取消后迟到响应释放未读正文；实际 HTTP 服务使用系统分配的本机端口，测试退出等待服务关闭。共享主题契约另验证与对象原型同名的合法 JSON 字段、自有值、显式默认及无损往返。生产内容快照与缓存按每次构建隔离，并在成功或失败后清理；不同构建不要共用最终输出目录，参数见 [配置文档](configuration.md)。

浏览器验收包括静态来源 24 项和 HTTP 来源 20 项，均覆盖 Vue/React 的根路径与仓库子路径，另有两框架各 4 项扩展主题表单场景、5 项真实开发服务器回归，以及 8 项双来源富正文场景，另有 8 项实际主题与间距即时外观回归、2 项扩展参数即时校验保护及 4 项多维度阅读设置场景，总计 79 项。主题表单覆盖合法 constructor/toString/__proto__ 字段的初始缺失、填写、对象/字符串/null 枚举、保存刷新和清除，不从继承属性补值。富正文场景各自核对卡片/列表两主题下作者、日期原值与 datetime、标签、代码缩进、表格对齐、列表起始编号、任务状态、空目标链接及嵌套图片、作者 title、含连字符与重复定义脚注的唯一定位及焦点及危险链接诊断；无元数据文章不补值。开发回归同时运行 Vue/React，验证不同端口各自的内容版本、个人选择和刷新，另有两框架同端口重复启动失败后的原指针、正文及依赖请求保护。HTTP 场景由独立端口提供 API，验证真实跨域请求、凭据默认省略、分页、资源基址优先级、分享及失败恢复。测试服务不构成生产后端，也不证明真实服务器的 CORS 或授权设置已完成。

Playwright HTML 报告位于 `playwright-report/index.html`，可运行 `npx playwright show-report --host 127.0.0.1` 查看。当前线下验收的补充结果与 12 张截图位于 `.generated/local-smoke/`，公开产物审计记录为该目录的 `artifact-audit.json`；这些文件都不进入博客产物。具体修复和验收范围见 [执行记录](plans/execution.md)。

后续编辑生命周期检查保存为 `.generated/local-smoke/lifecycle-results.json`，两框架均验证开发期间生产构建、非法内容失败后原输出哈希保持不变，以及修改作者正文、重启开发命令后显示新正文并恢复个人选择。对应本机脚本为 `.generated/local-smoke/editor-lifecycle.mjs`，可用 `node .generated/local-smoke/editor-lifecycle.mjs` 重现；它使用独立测试内容和 5183/5184 端口，退出时关闭服务，运行后另存两张截图。该脚本和结果属于忽略的本机证据，不是 npm run check 的用例数，也不随代码提交。

请求生命周期与最终清理验收保存为 `.generated/local-smoke/request-lifecycle-results.json`，对应审计脚本为该目录的 `request-lifecycle-audit.mjs`，使用项目根目录作为当前目录运行。记录四项新增请求回归、完整检查计数、25 个固定测试端口关闭、临时实例目录为空及公开内容哈希与前轮相同。请求层修复改变 JavaScript 及 index.html 引用，不能将全部前端产物误称为哈希不变。该审计脚本属于本机证据，依赖记录的本轮日志与前轮产物基线，不是通用发布检查命令。

implementation-12 扩展字段验收保存为 `.generated/local-smoke/theme-option-results.json`，对应本机脚本为该目录的 `theme-option-audit.mjs`。该轮包含 70 项逻辑/构建测试和 53 项浏览器测试，四项新增主题浏览器回归均验证真实表单、共享提交、存储与刷新。脚本核对最新完整日志、25 个固定端口、目录清理和生产产物，与前轮内容/CSS 哈希比较；表单修复改变 JavaScript 及 index.html 引用。前轮审计单独保留，原有请求生命周期结果不覆盖；历史本机审计脚本各自绑定该轮日志和基线，不用旧脚本给新版本生成验收结论。

implementation-13 深度审查结果见 [审查文档](specs/reliability-audit.md)，本机验收保存为 `.generated/local-smoke/reliability-results.json`，对应脚本为该目录的 `reliability-audit.mjs`。新增 14 项回归在旧实现全部失败，修复后完整检查通过 84 项逻辑/构建与 53 项浏览器测试；来源切换失败时进行中请求保持另有五项补验。审计核对日志、25 个固定端口关闭、实例目录为空、公开内容/CSS 哈希与前轮一致，以及生产无夹具。旧存储键兼容性及地址规则见 [配置文档](configuration.md)，原有各轮记录保留。

implementation-14 验收见 [完整性审查](specs/integrity-audit.md)，结果保存为 `.generated/local-smoke/integrity-results.json`，对应本机脚本 `integrity-audit.mjs`。十六项新增回归先在旧实现失败，修复后通过；首次完整检查另复现四项链接内图片重试导航失败，双渲染器修复后重新通过 100 项逻辑/构建、双框架构建和 53 项浏览器。八项富正文补验嵌套图片及重复脚注，四项重试补验地址保持。审计检查 25 个固定端口、目录清理、内容/CSS 哈希和生产无夹具，前轮及首次失败证据保留。新的内容目录、输出隔离及 URI 路径规则见 [配置](configuration.md) 与 [写作](writing.md)；历史脚本绑定旧日志，不用来验收新版本。

implementation-15 验收见 [版本与生命周期审查](specs/version-lifecycle-audit.md)，本机结果为 `.generated/local-smoke/version-lifecycle-results.json`，脚本为 `version-lifecycle-audit.mjs`。新增十六项逻辑测试与四项跨版本浏览器场景；十四项逻辑回归先复现失败，另外两项补验合法编码与错配探测恢复。完整检查通过 116 项逻辑/构建、类型/边界、双构建及 57 项浏览器，审计核对 25 个固定端口关闭、实例目录为空、生产内容/CSS 哈希与前轮一致。通知中的状态操作时序见 [扩展文档](extensions.md)，静态版本目录约束见 [配置文档](configuration.md)。

implementation-16 验收见 [输入准确性审查](specs/input-fidelity-audit.md)，结果为 `.generated/local-smoke/input-fidelity-results.json`，脚本为 `input-fidelity-audit.mjs`。新增二十项逻辑测试，其中十八项在旧实现全部失败；四项 HTTP 浏览器场景确认重复字段响应报错、修正后显式重载恢复。完整检查通过 136 项逻辑/构建、类型/边界、双构建与 61 项 Chromium；25 个固定端口关闭、实例目录为空、公开内容及 CSS 哈希与前轮相同。严格 JSON、只读验证器、API 查询参数和事件快照规则见 [扩展文档](extensions.md)，写作规则见 [writing.md](writing.md)。

implementation-17 验收见 [字节与生命周期审查](specs/boundary-lifecycle-audit.md)，结果为 `.generated/local-smoke/boundary-lifecycle-results.json`，脚本为 `boundary-lifecycle-audit.mjs`。十四项回归在旧实现全部失败，三项补验验证合法字符/BOM、目录输出及回调；相关 51 项通过。完整类型/边界、153 项逻辑/构建、双生产构建和 65 项 Chromium 通过，四项新浏览器验证非法 UTF-8 响应失败及显式重载恢复。25 个固定端口关闭、实例目录为空、生产内容和 CSS 哈希保持。来源配置快照、原始字节传输和输出文件保护见 [扩展](extensions.md)、[写作](writing.md) 与 [配置](configuration.md)。

## 首次 GitHub Pages 发布

本项目已明确选择 Vue 作为线上发布框架，选择记录在 `.github/workflows/pages.yml` 的 build-pages.env 中，React 仍参与构建与验收。首先在 GitHub 仓库 Settings → Pages 中启用站点并选择 GitHub Actions 作为来源，确认设置已保存；无需再设置框架变量。以后如需改变发布目标，在 Settings → Secrets and variables → Actions → Variables 设置 `BLOG_FRAMEWORK=vue` 或 `react`，显式覆盖已记录的选择。其他非空变量值会令构建失败，不能静默回退。

`.github/workflows/pages.yml`（**Verify and publish blog**）对普通 push/PR 和未勾选 publish 的手动运行仅执行验证，不调用 Pages 设置、诊断或部署。在 Actions 中选择默认分支手动运行并勾选 **publish**（默认 false）即可明确发布。只有 SSH 推送权限时，也可创建提交标题以 `[publish-pages] ` 开头的发布提交并推送到默认分支；匹配的是 push 事件的最后一条提交消息，其他分支、标签、PR 或正文中单独提及该标记都不会发布。两种显式入口均先验证两框架，再构建选定应用。从 configure-pages 的 `base_path` 取得根/仓库子路径，只上传相应 `dist/` 目录，最后交给 `github-pages` 环境发布。默认只读取已启用的 Pages；显式提供下述 setup secret 时才尝试创建站点，不创建 API 服务。动作使用官方仓库已核对的提交 SHA。

verify 若失败，控制台保留原始日志且作业仍失败；公开检查注释只输出当前验证阶段、数字计数、标准错误代码和已跟踪公开源码的相对位置，帮助在只有 SSH 权限时定位 CI 故障。该元数据不包含任意日志内容、断言值、URL、绝对运行路径或环境值，也不能替代完整验证通过。

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

首次发布验证 HTTPS 首页与 JS/CSS、版本清单、两风格、个人/分享刷新、保存、重置、坏分享、缺失详情及非法路由恢复和手机布局；七个文件哈希与对应候选一致。最终文章发布进一步验证全部正文与 22 张原图、分享保存、详情刷新，30 个文件哈希与最终 Vue `/Blog/` 候选一致。旧正文 404 与显式更新核心断言已通过，恢复链接配置独立复核通过；整段跨发布脚本最后的首页控件定位错误另记。真实 API 未接入。来源和公式显示限制见 [RSI 导入审查](specs/understanding-rsi-import.md)。

线上首页先选择“简洁列表”或“卡片网格”，再勾选“万字长文带你读懂 RSI（自进化，Self-Evolving）”。简洁列表显示正文，卡片网格可点击“阅读全文”；详情页生成的分享链接保留当前文章目标与风格。首次访问由用户选择内容。数学公式目前显示 LaTeX 文本，未提供 KaTeX 排版。

首页和详情页均支持切换风格及间距。选择选项后立即生效，无需点击“应用风格”；紧凑间距会缩小文章留白、正文行距和段落间距。详情的卡片主题保留全文，默认浅色下显示单列白色卡片；简洁列表采用透明背景与分隔线。分享会话中修改仅在本次浏览生效，保存为个人配置后才退出分享；详情页生成新的分享链接可以携带当前风格和间距。

展示设置现在按外观、文字、排版和内容信息分组，新增配色（含跟随系统）、字号（最高 200%）、字体、阅读宽度、正文行距、段落间距、字间距、词间距、正文对齐和隐藏作者/日期。选项即时生效；明确设置行距或段间距后优先于“间距”。新枚举选择“使用默认”可单独恢复默认，切换两内置风格会保留共同阅读偏好。“恢复默认外观”恢复当前风格的视觉默认，保留所选内容和文章位置；分享会话仍需显式保存才写个人记录。字体取决于本机安装情况，词间距主要影响有空格的文本。搜索依据与全部选项见 [阅读设置](specs/reading-preferences.md)。

官方资料：[Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[configure-pages 输出](https://github.com/actions/configure-pages/blob/main/action.yml)、[Vite](https://vite.dev/guide/)、[Playwright CLI](https://playwright.dev/docs/test-cli)。

## 配置、分享和恢复

应用配置见 [configuration.md](configuration.md)，作者写作见 [writing.md](writing.md)，扩展主题/框架见 [extensions.md](extensions.md)。

普通会话初始优先采用有效个人配置，再采用明确作者默认，最后进入选择入口。首次加载不写入存储；之后合法修改自动尝试保存。无摘要、作者、日期或图片时不补写。

分享会话的修改只在内存，刷新回到原分享配置；“保存为个人配置”写入后清理分享参数。坏分享不会自动使用个人或作者配置。保存提示若说明地址未清理，个人记录已经更新，但刷新仍尊重原链接。重置的类似提示表示个人记录已删除，而当前内存展示尚未切换。

“采用作者默认”不删除个人记录；“重置个人配置”删除个人记录。无作者默认时回到选择入口。详情导航保留个人选择。分享结果描述当前目标与配置，配置或目标改变后旧链接不再显示为当前结果。
