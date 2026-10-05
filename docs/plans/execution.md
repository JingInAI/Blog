# 工程初始化执行记录

执行日期：2026-10-05。实施基线：review-07；当前修订：implementation-06。工程阶段 P0–P6 已完成并通过本地验收；初始化提交已推送，首次 P7 作业在 Configure Pages 读取元数据失败，修订与 T14 验收继续进行，真实 API 未接入。用户已明确选择 Vue 作为线上构建目标。

## 已实施内容

| 阶段 | 交付 | 验证证据 |
| --- | --- | --- |
| P0 | npm 工作区、Node 24、TypeScript/Vite、共享类型及运行时校验、依赖边界、两应用入口 | typecheck、check:boundaries、双应用构建 |
| P1 | 严格 JSON frontmatter、SiteInfo、轻量目录、独立正文、哈希资源、清单/指针、公开范围及失败输出保护 | content.test.ts：T01/T02/T13a |
| P2 | 静态/API 来源、精确身份/发布状态校验、诊断、取消/超时/错误、来源工厂、共用版本探测 | source.test.ts：T03/T04/T13b，真实本机 HTTP 服务；HTTP 浏览器跨域链 |
| P3 | 控制器、初始化/恢复、选择/排序、配置基线、分享与存储分步提交、独立请求/消费实例及资源状态 | controller.test.ts、edge-cases.test.ts：T05–T08/T13c |
| P4 | 唯一 Markdown/GFM 解析、安全只读 AST、原始 HTML 文本、链接诊断、资源/alt 解析、脚注及原文错误入口 | content.test.ts、edge-cases.test.ts：T09a |
| P5 | Vue/React 适配器、两主题、参数草稿、站点/操作反馈、图片开始/完成/脱离/重试、移动端布局 | 36 项 Chromium 集成场景：20 项静态来源 + 12 项 HTTP 来源 + 4 项扩展主题表单，边界/扩展测试 T11 |
| P6 | 根/子路径、详情/历史、严格分享协议、版本变化显式重载、锁文件 CI/Pages 工作流、使用与扩展文档 | sharing.test.ts：T12，浏览器真实静态 V1→V2：T13d，产物审计与文档命令检查 |
| P7 | 实际 Pages 地址/部署日志、线上跨发布场景、可选真实 API | 初始化提交已推送，用户提供首次 Configure Pages 404；尚未成功部署及完成线上场景 |

源码与测试均在当前工作区；原工作区的 Git 元数据只读，未暂存、提交或改变其分支。发布准备使用 `/tmp/blog-release-20261005` 独立检出，真实推送/部署结果另行记录。此前的 `.blog-init-probe` 和 `blog-architecture.json` 保留，不加入工程发布提交；构建器不会上传它们。

## 工具和明确选择

- Node 24 LTS；本机原无 Node/npm，本次从 nodejs.org 下载 Node v24.21.0 到 `/tmp` 并校验官方 SHA-256，未替换系统安装。
- npm 工作区；依赖精确版本及传递依赖固定于 package-lock.json；`npm ci --ignore-scripts` 已重新安装验证。
- TypeScript 7.0.2、Vite 8.3.2；Vue 3.5.43、React/React DOM 19.3.0；Playwright 1.63.0。这些是本次锁定版本，不表示永远为最新。
- 边界检查使用直接锁定的 @babel/parser 7.29.9、@babel/types 7.29.8 处理实际 TypeScript/JSX 语法树，不依赖 TypeScript 编译器的旧程序化接口。
- 内容格式：Markdown + 严格 JSON frontmatter；避免元数据隐式转换。SiteInfo 单独用 JSON。
- 唯一正文链：unified 11.0.5、remark-parse 11.0.0、remark-gfm 4.0.1；运行时手工 schema 校验与共享错误类型。
- 构建选择框架，运行时选择内容/风格；生产没有默认主题、示例文章或作者。生产 site.json 缺失，只输出合法空信息。
- buildId 由公开站点、已发布正文与引用资源哈希确定；会话固定清单，应用嵌入相同 buildId，不在会话中自动换正文版本。
- 合法 share 参数名严格解码一次后识别；无法解码成 share 的其他参数不参与协议，恢复时按原始形式保留。share 的值仍严格解码、计数、校验，重复识别出的 share 一律无效。
- 文内锚点/脚注移动当前正文焦点，不改唯一哈希路由；非法路由显示固定恢复入口。

## 本次实际运行结果

| 检查 | 结果 |
| --- | --- |
| npm ci --ignore-scripts | 通过；锁文件安装成功 |
| npm run typecheck | 通过 |
| npm run check:boundaries | 通过 |
| npm test | implementation-06：56 项全部通过，无跳过或 todo，含 4 项只读 Pages 诊断回归 |
| npm run build:vue | 通过，dist/vue |
| npm run build:react | 通过，dist/react |
| npm run test:e2e | 36 项全部通过：Vue/React × 根路径/Blog 子路径 ×（5 组静态 + 3 组 HTTP 场景），另有两框架各 2 项扩展主题表单场景 |
| npm run check | implementation-05 完整链通过：52 项逻辑测试、双构建、36 项浏览器；implementation-06 仅改诊断/工作流/文档，另行通过 typecheck、边界、56 项逻辑测试及 actionlint |
| 开发/预览烟雾检查 | dev:vue 5173、dev:react 5174、preview:vue 4173 的首页和 current.json 均返回 200 |
| 最终公开产物审计 | 两框架指针/清单/目录/站点版本一致；目录/正文为空，站点仅 schemaVersion；无符号链接、测试、文档或原始应用配置文件 |
| git diff --check | 通过 |
| actionlint 1.7.11 | 官方归档 SHA-256 核验通过，工作流语法/表达式静态检查通过；未用本机 shellcheck |
| Vue 发布候选 | 按 BLOG_FRAMEWORK=vue、BLOG_BASE_PATH=/Blog/ 单独构建 dist/vue，并以相同 base 在真实 Chromium 验证壳、JS/CSS、指针、空内容、风格选择和刷新 |

浏览器验证选择、排序、无作者补值、两主题、原始 HTML 不执行、详情刷新与历史、分享改动刷新还原/显式保存、坏分享恢复、存储访问受限、保存/重置部分提交、启动网络失败重试、图片未展示不请求、相同 URL 重试、旧会话跨真实产物 V1→V2 故障及显式刷新。已解码的旧图片可继续显示；版本失效测试使用未缓存的旧会话，不将浏览器缓存误判为协议失效。

T09a/b 与 T13a/b/c/d 各有独立本地证据，整组本地验收完成。测试证明列出的行为，不能替代 T14 的真实 Pages/CORS/平台验证。

## implementation-02 回归与修复

- 主题 enum 原来用 String(value) 比较，错误数组 `['compact']` 可被当成合法字符串；共享描述也没有强制约束扩展字段类型。新增类型回归在旧实现失败，修复后按描述严格检查类型和 JSON 语义的枚举选择，自定义验证器只增加约束；相同字段错误去重。
- 描述 defaultValue 原来未参与 defaults 合并，表单和规范化结果可能不一致。新增默认值回归在旧实现失败，修复后使用唯一默认值映射，并拒绝矛盾、未知及类型错误的默认值。
- 外部分享/历史已切换展示主题时，Vue/React 的旧表单草稿仍显示此前的风格。新增四组浏览器回归全部先复现失败，修复后按已提交 id/version/options 的语义变化同步草稿。同主题仅改变参数、无效分享后返回、重复地址事件及无变化提交均验证；普通内容选择和详情导航保留未提交参数，个人记录不被外部分享同步改写。
- 本次新增 `tests/theme-validation.test.ts` 三项共享回归，以及 `tests/browser/blog.spec.ts` 四个框架/路径组合的集成用例。完整检查通过后记录为 43 项逻辑测试、20 项浏览器测试。

## implementation-03 API 构建与跨域证据

- `tests/build.test.ts` 在两个框架实际构建中先复现 HTTP 模式仍读取未使用本地内容的失败；修复后前端构建忽略本地内容，仅输出 index.html 与应用 assets，不输出静态内容指针或文件。
- `tests/config.test.ts` 先复现 `resourceBasePriority: ['config']` 被转换接受；修复后应用 JSON 配置与 HttpContentSource 均严格接受 config/response 字符串，明确提供的空资源基址也拒绝。
- `tests/http-browser-fixtures.ts` 在 4305 提供受控 API，4306–4309 提供两个框架的根/子路径真实构建。API 与应用不同 origin；没有浏览器请求模拟。所有夹具位于 `.generated/e2e/`，不写生产内容。
- `tests/browser/http.spec.ts` 的 12 项验证实际 CORS 允许/拒绝、API 请求省略已有 Cookie、独立站点错误/恢复、目录分页/401、正文 503 重试、错误 ID/draft 拒绝及恢复；同时验证明确资源基址优先级、作者原文/alt、无事实补值、未知字段只展示路径、主题切换、分享与详情刷新。HTTP 成功或失败均未请求静态内容文件，也不显示静态版本更新入口。
- 最新完整验收为 46 项逻辑/构建测试与 32 项浏览器场景；真实 API 的域名、生产 CORS、授权及可用性仍未验证。

## implementation-04 扩展与发布准备证据

- `tests/boundaries.test.ts` 先复现固定包/.ts/正则扫描遗漏与误判。修复后五项用临时真实包和独立检查进程验证 TSX、Vue/Svelte 脚本块、新 renderer、require/动态/类型导入/import-equals/再导出、计算模块名、相对逃逸、peer 依赖，以及注释/字符串不误报。
- `tests/theme-validation.test.ts` 新增一项先复现重复/非法注册；目录生成、规范化及适配器核对现在共用注册校验，不能由先匹配项隐藏同名版本或框架声明。
- 用户选择 Vue 后，明确选择写入 Pages 工作流，可选 BLOG_FRAMEWORK 变量仍可覆盖；无变量不再跳过已明确选择的发布目标。React 保留构建/验收。
- 根据 [Pages API 权限](https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site) 和 [Actions 并发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)，build-pages 明确取得 pages/read，默认分支 workflow 不取消进行中的运行，部署仍串行；PR/其他分支可取消旧验证。
- actionlint 1.7.11 从官方发布下载到 `/tmp/blog-actionlint-1.7.11`；归档 SHA-256 为 `900919a84f2229bac68ca9cd4103ea297abc35e9689ebb842c6e34a3d1b01b0a`，与官方校验和一致。工作流静态检查通过，未执行真实 GitHub 作业。
- 只读确认远端为 JingInAI/Blog、当前分支 main。SSH 的 ls-remote 成功，远端 HEAD 为 `2327ef43011973f2c71b37ee9b4e8a1c7c663195`；这证明读取访问可用，不证明写权限或 Pages 设置。当前没有 GH_TOKEN/GITHUB_TOKEN 环境认证，也没有 gh 或 GitHub 连接工具；仓库与 Pages API 请求均返回 403，不能据此推断仓库可见性或 Pages 是否已启用。没有创建提交、推送、远程变量或部署。
- 最新完整检查为 52 项逻辑/构建/边界测试、32 项浏览器场景；Vue 的 /Blog/ 候选构建单独准备，平台最终路径仍按 configure-pages 输出。

## implementation-05 主题表单与发布提交准备

- `tests/theme-form-fixture/` 用测试专用注册表、真实 Vue/React 适配器、共享控制器和浏览器 localStorage 构建独立测试入口，不修改生产主题或内容。
- 四项新浏览器回归均先在旧实现失败：null 枚举显示错误，未填写枚举在 React 被显示为第一项，HTML required 阻止布尔 false 提交和共享字段错误反馈。修复后 required 遵循 JSON 字段存在语义，aria-required 表达要求，共享校验器给出字段错误。
- 两框架均验证合法 false/null/空字符串、小数、对象枚举、缺失必填字段、清空可选数字与枚举，以及提交到个人记录后的刷新恢复。清空草稿字段不产生 NaN，不隐式选择枚举第一项。
- 本轮 `npm run check` 全链通过：52 项逻辑/构建/边界测试、36 项 Chromium 场景。actionlint 静态检查再次通过，Vue 按 /Blog/ 单独重新构建。
- 用户明确确认仓库 Pages 发布来源已设为 GitHub Actions。原工作区 Git 元数据只读，在 `/tmp/blog-release-20261005` 从本地初始提交建立独立检出，以准备发布提交；推送和线上结果不会由本地测试替代。
- 独立检出已创建工程发布提交：74 个文件逐一比较 SHA-256 与原工作区相同，保留既有初始提交为父提交，作者明确为 Codex；没有加入旧探测文件、既有架构文件、node_modules、构建产物或测试生成目录。SSH `git push --dry-run origin HEAD:main` 成功，未修改远端；实际推送和线上验收另行记录。

## 真实推送与待验证发布结果

- 初始化提交 `32e6d27a6b3b0a62e5575e8fc1ca144c6ac445fd` 已通过独立检出推送至 `git@github.com:JingInAI/Blog.git` 的 main；未强推，保留原始提交历史。原工作区 HEAD 仍为 `2327ef43011973f2c71b37ee9b4e8a1c7c663195`，其只读 Git 元数据未修改。
- 用户已确认仓库 Pages 来源为 GitHub Actions；工作流实际名称为 **Verify and publish blog**，发布选择 Vue。
- 推送后未认证查询仓库 Actions API 与网页均返回 404，候选 `https://jinginai.github.io/Blog/` 也返回 404。API 剩余请求额度为 27；这次结果不能当作作业失败日志、成功证据或最终站点地址确认。没有获取真实作业/Pages API 的认证读取能力，已请求用户提供该提交对应的工作流状态或失败步骤。
- 最终本地 Vue /Blog/ 候选通过 Chromium 烟雾检查：应用壳为 Vue，无文章、无作者补值，风格选择后刷新恢复；资源初次请求 200，缓存刷新 304，无页面脚本异常。

## 首次真实工作流失败与修订

- 用户提供 `32e6d27` 对应作业的 build-pages 日志：`HttpError: Not Found`，固定版本 configure-pages 在 GET Pages site 时失败。这是受认证工作流的实际失败证据，不同于此前未认证 API 404；应用本次 Pages 构建和上传尚未开始。
- 核对固定 SHA 的 [action.yml](https://github.com/actions/configure-pages/blob/983d7736d9b0ae728b81ab479565c72886d7745b/action.yml) 及 [API 实现](https://github.com/actions/configure-pages/blob/983d7736d9b0ae728b81ab479565c72886d7745b/src/api-client.js)：enablement 默认为 false；首次创建必须提供普通 GITHUB_TOKEN 以外的适当凭据。按 [创建 Pages API 权限](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)，受限管理凭据需要 Pages/write 与 Administration/write。
- 工作流增加可选 Actions secret `PAGES_SETUP_TOKEN`，配置时向官方 action 传入该凭据和 enablement；未配置仍只读取站点。保持 build-pages 的原 GITHUB_TOKEN 权限，未加入无效的 administration 权限项，也未盲目开大权限。失败提供操作摘要，保持作业失败并阻止构建/上传。
- `docs/usage.md` 补齐设置状态、首次创建、仓库方案范围和凭据配置排查。已请求用户提供 Settings → Pages 实际提示以确认原因；不能仅凭 404 确定仓库可见性、账号方案或站点是否存在。新增启用入口与诊断通过 actionlint；尚无配置 setup secret 或创建 Pages 成功的证据。

## implementation-06 只读发布诊断

- 复查未认证 Pages/Actions API 得到 403，响应明确为请求额度耗尽；候选 Pages 地址仍为 404。这些结果不能代替最新受认证作业日志。当前没有 gh、GH_TOKEN/GITHUB_TOKEN 环境认证或 GitHub 连接工具；SSH 仍只能提供工程推送能力。
- 自动审批拒绝了为诊断作业授予 contents/write 并持续更新远端诊断分支的补丁，理由为持久化权限和远端写入范围超过当前排查授权。核对后确认补丁没有落地；没有以其他执行方式绕过拒绝。
- 改用独立 diagnose-pages 作业，仅在默认分支非 PR、verify 成功而 build-pages 失败时运行，权限只有 contents/read 与 pages/read。脚本对 GitHub 做两个 GET，禁止重定向，15 秒超时，只选择受校验字段；结果仅输出到 Actions 日志和摘要。
- `tests/pages-diagnostics.test.ts` 四项验证明确事实与固定 GitHub 请求范围、401/403/404/429/500 状态不复制错误正文、非法 JSON 字段/含凭据或查询的 URL 拒绝、网络错误不泄露凭据，以及非法上下文在请求前拒绝。
- 本轮 typecheck、check:boundaries、npm test 全部通过；逻辑/构建/边界测试共 56 项，actionlint 通过。未改应用渲染代码；最近完整双框架构建和 36 项浏览器证据仍来自 implementation-05，本轮未重复浏览器验收。
- 已请求用户提供新工作流结果或 Settings → Pages 的实际文字提示；diagnose-pages 的限定 JSON 将进一步确认平台事实，不要求提供 token，不推断账号套餐或宣告发布成功。

## 外部未完成条件

- P7 已完成初始化提交和推送；首次实际作业失败已定位到 Configure Pages，尚未确认线上地址或 T14，没有宣告线上地址可用，没有改变仓库 Pages 设置、仓库可见性、Actions 变量或 secrets。
- Vue 发布目标已明确并写入工作流；用户也已确认 Pages 来源设为 GitHub Actions，SSH 推送已成功。真实作业及线上结果仍需验证；没有环境 API 认证。BLOG_FRAMEWORK 变量是可选显式覆盖。
- 真实后端 API 未提供；HTTP 契约由受控本机服务及错误/取消测试验证，真实服务器的授权、CORS 和可用性待接入后验证。
- 不承诺 SSR、预生成文章 HTML、SEO 或分享卡片，这些不属于当前客户端初始化范围。
