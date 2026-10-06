# 工程初始化执行记录

执行起始日期：2026-10-05；最新验收日期：2026-10-06。实施基线：review-07；当前修订：implementation-17。P0–P6 与完整本地验收已完成；首次 Vue 发布及授权 RSI 全文/22 图发布与线上验收完成。跨发布正文失效/显式更新核心断言通过，恢复配置另行复核通过；整段脚本的最终控件定位错误未计成功，完整 T14 的线上异常注入仍待办。此前 Configure Pages 失败记录保留；真实 API 未接入。

## 已实施内容

| 阶段 | 交付 | 验证证据 |
| --- | --- | --- |
| P0 | npm 工作区、Node 24、TypeScript/Vite、共享类型及运行时校验、依赖边界、两应用入口 | typecheck、check:boundaries、双应用构建 |
| P1 | 严格 JSON frontmatter、SiteInfo、轻量目录、独立正文、哈希资源、清单/指针、公开范围及失败输出保护 | content.test.ts：T01/T02/T13a |
| P2 | 静态/API 来源、精确身份/发布状态校验、诊断、取消/超时/错误、来源工厂、共用版本探测 | source.test.ts：T03/T04/T13b，真实本机 HTTP 服务；HTTP 浏览器跨域链 |
| P3 | 控制器、初始化/恢复、选择/排序、配置基线、分享与存储分步提交、独立请求/消费实例及资源状态 | controller.test.ts、edge-cases.test.ts：T05–T08/T13c |
| P4 | 唯一 Markdown/GFM 解析、安全只读 AST、原始 HTML 文本、链接诊断、资源/alt 解析、脚注及原文错误入口 | content.test.ts、edge-cases.test.ts：T09a |
| P5 | Vue/React 适配器、两主题、参数草稿、站点/操作反馈、图片开始/完成/脱离/重试、移动端布局及开发实例隔离 | 65 项 Chromium 集成场景：24 项静态来源 + 20 项 HTTP 来源 + 8 项扩展主题表单 + 5 项开发回归 + 8 项双来源富正文，边界/扩展测试 T11 |
| P6 | 根/子路径、详情/历史、严格分享协议、版本变化显式重载、锁文件 CI/Pages 工作流、使用与扩展文档 | sharing.test.ts：T12，浏览器真实静态 V1→V2：T13d，产物审计与文档命令检查 |
| P7 | 实际 Pages 地址/部署日志、线上跨发布场景、可选真实 API | 2026-10-06 首次 Vue 发布成功，当前空内容线上验收通过；正文/图片/跨内容发布及真实 API 另记，历史失败保留 |

P7 最新结果：授权文章与配图线上验收完成，跨发布核心行为和恢复配置复核见末尾 RSI 发布记录；原表中的首次空内容状态为历史记录。

源码与测试均在当前工作区。早期 Git 写入受限时使用 `/tmp/blog-release-20261005` 独立检出；2026-10-06 根据用户“git提交所有修改”的明确授权，已在当前工作区 main 提交全部 95 个未忽略文件（6cbb3d8）。`.blog-init-probe` 和 `blog-architecture.json` 随此本地提交保留，但构建器不会上传它们。

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

下表保留 implementation-17 的 153/65 本地基线；最新恢复发布阶段的 155/65 完整复核、真实部署及线上证据见文末。

| 检查 | 结果 |
| --- | --- |
| npm ci --ignore-scripts | 通过；锁文件安装成功 |
| npm run typecheck | 通过 |
| npm run check:boundaries | 通过 |
| npm test | implementation-17：153 项全部通过，无失败、取消、跳过或 todo；新增 17 项边界测试，14 项先复现失败、3 项为合法编码/目录/回调补验。原有逻辑、构建、关闭与假响应诊断继续通过，没有查询 GitHub |
| npm run build:vue | 通过，dist/vue |
| npm run build:react | 通过，dist/react |
| npm run test:e2e | 65 项全部通过：24 项静态、20 项 HTTP、8 项扩展主题表单、5 项开发及 8 项富正文；无失败、跳过或重试 |
| npm run check | implementation-17 完整链通过：类型、边界、153 项逻辑/构建、双生产构建和 65 项浏览器；四项新增 HTTP 非法 UTF-8 响应失败与显式重载恢复 |
| 开发/预览烟雾检查 | dev:vue 5173、dev:react 5174、preview:vue 4173、preview:react 4174 的首页和 current.json 均为 200；空内容、选择/刷新/重置通过，未出现脚本异常、失败 JS/TS 请求或 Vue 功能标志警告 |
| 桌面/手机两风格补充检查 | 两框架 × 1280/375 像素宽度 × 卡片网格/简洁列表，共八组通过；正文/alt 忠实、无站点作者补值、详情刷新、图片加载、无横向溢出，卡片桌面两列/手机一列 |
| 编辑重启与开发/构建并行 | 两框架均通过：开发内容不受生产构建影响，非法内容失败后全部原输出 SHA-256 不变，正文编辑重启后版本改变、风格/选择恢复，无脚本异常 |
| 最终公开产物审计 | 两框架各七个文件，指针/清单/目录/站点版本一致；目录/正文为空，站点仅 schemaVersion；无符号链接、测试内容、文档或原始应用配置文件；保留文件 SHA-256 |
| git diff --check | 通过 |
| actionlint 1.7.11 | 官方归档 SHA-256 核验通过，工作流语法/表达式静态检查通过；未用本机 shellcheck |
| Vue 发布候选（此前证据） | 此前按 BLOG_FRAMEWORK=vue、BLOG_BASE_PATH=/Blog/ 单独构建并验证；本轮 dist/vue 最终为根路径构建，/Blog/ 由隔离双框架浏览器夹具验证，无线上验收 |

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

## implementation-07 本地测试与开发隔离修复

- 用户明确要求“先不线上发布，先在线下进行测试”；本轮没有推送、查询远端、设置平台参数或触发部署。P7/T14 与 Pages 失败排查暂缓，既有日志保留。
- 初次完整本地检查的 56 项逻辑测试和 36 项浏览器测试通过，但额外运行真实并发开发入口时，React 出现 `504 Outdated Optimize Dep`，页面未挂载；Vue 提示缺少编译功能标志。检查本机已安装 Vite 的默认缓存规则，确认两应用共用最近 package 根目录的依赖缓存。修复为各框架/端口独立 cacheDir，并显式提供 Vue 编译标志。新增双框架回归在旧共享缓存的暖/强制优化运行中也曾通过，所以不将它们声称为稳定复现该 504 的用例；该错误的修复前证据来自实际开发入口烟雾检查。
- 增加同一框架不同端口、不同作者内容版本的回归后，旧生成目录复用在修复前稳定导致“站点已更新，请更新页面”，无法初始化选择入口。修复为 `.generated/<框架>-<端口>/public/`，两个 Vue 实例分别保持 v1/v2，刷新后没有错误更新入口。生产框架输出和内容文件保持既有规则。
- `BLOG_DEV_PORT` 仅接受 1–65535 十进制整数，默认 Vue/React 为 5173/5174；strictPort 防止自动换端口使实例标识失配。真实开发夹具使用 4312/4313/4314，测试结束自动退出，不占用手动开发入口。dev 的 `--force` 支持重建本实例依赖缓存。
- 新增 `tests/dev-browser-fixtures.ts` 与 `tests/browser/dev.spec.ts`，在真实 Vite 开发服务器验证两框架同时启动、选择风格/内容、个人配置恢复、原文与刷新、JS/TS 请求及同框架内容版本独立。完整检查最终为 56 项逻辑/构建/边界测试和 39 项 Chromium 场景，全部通过。
- 补充四个生产空内容开发/预览入口、八组带隔离夹具的两框架/两风格/桌面手机检查，保存 12 张截图和 JSON。生产没有文章、标题或作者补值，测试文章、站点与图片没有写入 `content/`；最终双产物各七个文件，buildId 均为 `c89041b3bc4516b5264c267edc16e605b2ec09e428e28ee979b640f516999f54`。
- 本地工作流改为默认关闭的 publish 输入，只有默认分支显式手动选中才构建/部署 Pages；push/PR 仅验证。actionlint 通过。这一改动未同步远端，不声称已取消此前运行或关闭远端工作流。
- 最终文档检查通过：八个 Markdown 文件、23 个真实本地导航链接（排除代码中的写作示例）、无尾部空白；git diff --check 通过。临时开发/预览及浏览器夹具的 21 个本机端口均已停止监听。

本轮证据位置：完整检查日志 `/tmp/blog-local-check-implementation-07-final.log`；[Playwright HTML 报告](../../playwright-report/index.html)；[烟雾检查 JSON](../../.generated/local-smoke/results.json)；[公开产物审计 JSON](../../.generated/local-smoke/artifact-audit.json)；截图位于 `.generated/local-smoke/`。同框架内容覆盖的修复前失败日志为 `/tmp/blog-dev-content-before.log`。这些是本机生成的忽略文件，不随工程发布，重新执行测试可能覆盖报告。

当前环境没有系统 Node，可先执行以下命令，再分别在终端运行 `npm run dev:vue` 和 `npm run dev:react`：

```sh
export PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH
npm run check
```

其他 Node 24 环境直接运行 npm 命令即可。浏览器报告可用 `npx playwright show-report --host 127.0.0.1` 查看；开发命令启动时生成内容，修改作者文件后需要重启。临时烟雾检查服务在验收后关闭，需要查看页面时重新启动相应开发或预览命令。

## implementation-08 并发生产构建修复

- 继续按用户要求仅在线下工作，没有远端查询、推送、管理设置或部署。此前的 56/39 项验收是 implementation-07 的证据，本轮最新完整检查为 58/39 项。
- `tests/build.test.ts` 新增 Vue/React 各一项真实并发构建回归：同时调用相同框架构建不同内容，最终输出目录不同；旧实现仍共用 `.generated/<框架>/public/`。两项在修复前均失败，second 输出含 first 的文章目录，证明公开产物不一定尊重本次选择的内容，并非仅限开发缓存冲突。
- `scripts/site.ts` 生产调用现在分别使用 `.generated/build-<框架>-<UUID>/` 中的 public 快照与 vite-cache，不与另一构建或开发实例共享可变目录。finally 清理该次生成根目录；Vite 构建、输出替换成功或异常后也清理输出 stage。最终输出路径、哈希内容和 buildId 规则保持原契约；同时写同一最终目录仍应串行。
- 修复后的四项构建测试通过（两个并发静态、两个 HTTP），随后完整 npm run check 通过类型、边界、58 项逻辑/构建测试、双框架构建及 39 项浏览器场景。新测试分别核对目录只含各自 ID、作者正文原值，以及应用 JavaScript 含对应 pointer.buildId。
- `.generated/local-smoke/editor-lifecycle.mjs` 在 5183/5184 运行两个框架的真实开发服务器。先选择 minimal-list 和作者文章，在开发会话保持运行时构建另一份内容；刷新仍为原开发正文且指针不变。随后提供非法生产元数据，失败后逐文件 SHA-256 与原产物完全一致，输出父目录没有 stage/backup。编辑开发正文为 v2，关闭并重启同端口，个人风格/选中内容恢复，新正文与新 buildId 一致且没有错误更新入口。两框架全部通过，服务在 finally 中关闭，另存两张截图。

最新完整检查日志 `/tmp/blog-local-check-implementation-08.log`；修复前并发失败 `/tmp/blog-parallel-build-before.log`；修复后构建检查 `/tmp/blog-parallel-build-after.log`；编辑生命周期日志 `/tmp/blog-editor-lifecycle.log`。HTML 报告仍为 [playwright-report/index.html](../../playwright-report/index.html)，新的 [生命周期 JSON](../../.generated/local-smoke/lifecycle-results.json) 与脚本/截图位于本机忽略目录，不加入生产内容。此前 12 组布局/入口烟雾证据保留，不重复计入本轮 39 项浏览器测试。

## implementation-09 开发失败保护与关闭清理

- 继续保持线下范围，没有查询远端、推送或发布。审查发现此前按框架/端口命名的目录仍有失败启动覆盖风险：生成内容和创建优化器先于 strictPort 检查，一个新进程可在退出前替换正在运行实例的内容指针。
- `tests/browser/dev.spec.ts` 新增两个真实端口冲突回归，针对 Vue 4312、React 4313，在 v1 服务运行中启动 v2/--force 候选。修复前两项均收到预期端口占用错误，但原服务的 current.json 已从 v1 变成 v2，指针保护断言失败；不是将预期端口错误当作回归失败。
- `scripts/site.ts` 每次 dev 启动分别使用 `.generated/dev-<框架>-<端口>-<UUID>/public/` 与同实例的 vite-cache。内容和缓存均不复用已有进程的路径，新启动失败只关闭其 Vite 服务并清理自己的目录。监听成功后 SIGINT/SIGTERM 等待共用关闭 Promise，再删除本次目录；重复信号不会提前退出。依赖缓存每次启动重新优化，浏览器个人配置保持独立于生成目录。
- 完整 npm run check 通过：58 项逻辑/构建/边界测试、Vue/React 构建及 41 项 Chromium 场景。新回归同时核对端口占用错误、原指针完整值不变、刷新仍为 v1 原文、无错误更新入口、无失败 JS/TS 请求或页面脚本异常。
- 初次功能检查通过后，目录审计发现正常 SIGTERM 仍留下目录。读取本机已安装 Vite 的实现及类型，确认自带信号回调在 server.close 后直接 process.exit；外层异步 rm 因此可被抢先终止。`tests/dev-shutdown.test.ts` 增加四项真实进程回归；接受标准信号退出码后，两个 SIGTERM 的目录断言在修复前失败，两个 SIGINT 对照通过。清理改为 Vite closeServer/close 挂钩并被关闭过程等待，restart 原因不清理；最终完整验收为 62 项逻辑/构建/边界测试与 41 项浏览器场景。
- 编辑生命周期脚本再次在两个框架通过，包含开发期间构建、非法内容失败后原输出全部哈希不变、作者正文编辑重启以及个人选择恢复。相关服务正常关闭；本轮 dev/build UUID 目录清理另行核对。生产仍为空，不加入测试内容，也不把工程界面文字当作作者元数据。
- 确认测试服务已停止后，只清理本轮修复前失败回归遗留的 14 个隔离 UUID 目录并保存记录；再从无这些遗留目录的状态运行四项最终退出回归，全部通过。最终目录审计无本轮 dev/build UUID 目录，23 个测试端口关闭；两框架公开产物逐文件 SHA-256 与前轮空内容产物一致。最终类型、actionlint、文档链接与空白检查通过。

最终完整日志 `/tmp/blog-local-check-implementation-09-final.log`；初次功能检查 `/tmp/blog-local-check-implementation-09.log`；端口覆盖修复前失败 `/tmp/blog-dev-port-before.log`；关闭清理修复前失败 `/tmp/blog-dev-shutdown-before.log`；最新编辑生命周期日志 `/tmp/blog-editor-lifecycle-implementation-09.log`。最新 [HTML 报告](../../playwright-report/index.html) 与 [生命周期 JSON](../../.generated/local-smoke/lifecycle-results.json) 已更新；旧日志保留历史证据。日常启动命令不变，目录和退出规则见 [使用文档](../usage.md) 与 [配置文档](../configuration.md)。

最终关闭检查日志 `/tmp/blog-dev-shutdown-after.log`；[目录/端口清理审计](../../.generated/local-smoke/dev-cleanup-results.json)；[修复前遗留清理记录](../../.generated/local-smoke/cleanup-leftovers.json)。上述文件均为本机忽略的测试证据，不随博客产物发布。

## implementation-10 不安全链接与正文真实性

- 继续只做本地工作，没有推送、远端查询或部署。核对设计第 8 节发现：正文转换器允许不安全链接保留作者文字并给 unsafe-link-as-text，但静态资源收集器把 javascript/data/vbscript 链接当作本地附件，构建器提前报 unsafe-resource，导致静态/API 同一正文行为不同。
- `tests/content.test.ts` 新增真实静态发布回归，修复前在 content.unsafe-links.resource 失败。修复后普通链接的明确协议目标交由统一转换器校验，不进入本地复制候选；图片仍遵循严格资源校验。直接链接、引用式链接和含凭据 HTTP 目标保留文字、无危险 href；正常本地附件仍映射，下载链接不变为自动加载图片。不安全图片的 javascript/data/vbscript 三组仍失败，旧指针 buildId 保持不变。
- `tests/authored-body-fixture.ts` 仅提供测试作者元数据与富 Markdown；静态 V1/V2 和受控 HTTP 夹具共用此数据，未修改生产 content/。`tests/browser/authored-body.spec.ts` 八项覆盖 static/http × Vue/React × 根/子路径，每项在两主题验证作者、RFC 3339 原时区与 datetime、原标签及缺失元数据不补值；保留段落/强调、代码换行与缩进、表格表头/值/对齐、有序列表起点、任务勾选和禁用状态、Unicode 文章/脚注 ID。脚注跳转移动焦点且不改详情地址，危险直接/引用链接仅为文字，诊断公开可见，无执行变量。
- 首轮独立浏览器验证中四项静态通过，四项 API 因测试未先加载第二页、等待未出现的 B 选项超时；这是测试设置遗漏，没有记作产品回归。补齐加载更多并重跑完整检查后，八项全部通过。诊断在两个主题均显式展开核对；详情刷新保留原日期与脚注正文，375 像素宽度没有横向溢出。
- 初次 npm run check 完整通过：63 项逻辑/契约/构建/边界测试、两个框架构建与 49 项 Chromium 场景。公开产物仍各七个文件、合法空内容；逐文件哈希与前轮一致，新增作者、标签、代码和草稿测试文本均排除。
- 清理审计随后发现夹具遗留目录，不能将功能检查通过等同于关闭完成。两个新增重复 SIGTERM 场景在旧一次性监听器上复现非正常终止；改为持续监听、共用关闭 Promise 后，六项信号场景全部通过。浏览器开发夹具也等待所有子进程 close 后才退出，exit 回调只作为仍存活进程的兜底。
- 读取已安装 Playwright 的官方类型与实现，确认未配置 gracefulShutdown 时直接 SIGKILL 整个进程组，是浏览器夹具遗留目录的直接原因。显式设 SIGTERM、10000 毫秒宽限后，运行器给予关闭/目录清理机会；单独修复重复信号和等待子进程不能替代这个设置。
- 最终完整复验通过 65 项逻辑/构建/边界测试、双构建和 49 项 Chromium；运行器优雅退出后，本轮实例目录自动清理为空。之前失败/强制退出遗留的隔离目录在确认服务停止后单独清理，并保留记录；最终审计不会把手动清理旧目录当作新运行自动清理的证据。

最终日志 `/tmp/blog-local-check-implementation-10-verified.log`；初次功能/退出配置检查 `/tmp/blog-local-check-implementation-10.log` 与 `/tmp/blog-local-check-implementation-10-final.log`；静态回归修复前 `/tmp/blog-unsafe-links-before.log`、修复后 `/tmp/blog-unsafe-links-after.log`；重复信号修复前 `/tmp/blog-repeated-signal-before.log`、修复后 `/tmp/blog-repeated-signal-after.log`；首轮浏览器夹具设置检查 `/tmp/blog-authored-body-browser.log`。最新 [HTML 报告](../../playwright-report/index.html) 与 [公开产物审计](../../.generated/local-smoke/artifact-audit.json) 已更新。写作链接规则见 [writing.md](../writing.md)，本轮检查和夹具不替代真实 API 或线上验收。

最终计数与八组场景记录于 [正文真实性验收 JSON](../../.generated/local-smoke/content-fidelity-results.json)：无本轮 dev/build UUID 目录，25 个测试端口关闭，浏览器最近运行 passed。[本轮修复前残留清理记录](../../.generated/local-smoke/cleanup-leftovers-implementation-10.json) 单独保留。文件位于本机忽略目录，测试服务未继续占用端口。

## implementation-11 API 正文传输与取消边界

- 新增 `tests/request-lifecycle.test.ts` 四项回归。实际 Node HTTP 服务使用系统分配的 loopback 端口，不模拟浏览器网络；分别在响应头到达前、收到响应头后的部分 JSON 阶段取消，请求以 AbortError 结束，服务端确认连接关闭，随后独立请求成功。
- 部分 JSON 正文超时在真实 HTTP 上返回可重试 timeout，服务端确认关闭；断言未自动发起第二次请求，显式重试后才收到作者正文。测试结束等待 server.close，并关闭残余连接。
- 可注入 fetch 适配器在收到取消/超时信号后仍完成 JSON 时，旧请求层只在 catch 中检查状态，因此两个回归均复现 Missing expected rejection。修复为响应头到达和解析完成后复核状态；取消维持 AbortError，超时维持 timeout，迟到内容不作为成功返回。适配器仍需遵守 AbortSignal；这里不声称能强制终止忽略取消且永不完成的适配器。
- 四项定向检查修复后全部通过；完整 npm run check 退出码 0，69 项逻辑/构建/请求测试、双框架构建及 49 项 Chromium 全部通过，无失败、跳过、todo 或重试。

定向修复前日志 `/tmp/blog-request-lifecycle-before.log`，修复后 `/tmp/blog-request-lifecycle-after.log`；完整检查 `/tmp/blog-local-check-implementation-11.log`。该轮结果见上述日志；共享 [HTML 报告](../../playwright-report/index.html) 随最新验收更新。设计与 [配置说明](../configuration.md) 明确正文阶段超时和取消职责。

该轮最终审计见 [请求生命周期验收 JSON](../../.generated/local-smoke/request-lifecycle-results.json) 与 [implementation-11 产物审计](../../.generated/local-smoke/artifact-audit-implementation-11.json)：本轮实例目录自动清理为空，25 个固定测试端口关闭；两个生产输出各七个文件，没有测试内容，作者内容文件及 buildId、CSS 哈希与前轮相同。请求层代码改变 JavaScript 及 index.html 引用，全产物哈希并非不变。前轮基线单独保存在 [implementation-10 产物审计](../../.generated/local-smoke/artifact-audit-implementation-10.json)，不覆盖正文真实性及历史清理记录。以上均为本机忽略目录的证据；本轮没有推送、查询 GitHub 或恢复线上发布，也没有接入真实后端。

## implementation-12 扩展主题字段与自有 JSON 值

- 在独立主题夹具注册合法 constructor、toString、__proto__ 字段，未向生产主题或内容加入测试选项。共享契约新增一项测试，验证两框架的初始缺失、自有值、对象/字符串/null 枚举、显式默认及 JSON 往返；共享规范化原本正确，问题位于适配器表单。
- 四项真实浏览器回归在旧实现均失败：Vue/React 未填写的 constructor 控件显示 `function Object() { [native code] }`；__proto__ 对象枚举赋值触发继承 setter，草稿原型改变，提交后配置仍为 null。没有把这两类失败当作契约要求拒绝这些合法键。
- 两套渲染器改为只读取自有选项值，草稿写入使用可枚举、可修改、可删除的自有数据属性；清除后保留缺失语义。四项定向浏览器回归全部通过，覆盖填写、保存、刷新和清除，并核对存储中的 __proto__ 是自有 JSON 属性、对象原型保持普通、没有页面脚本错误。
- 完整 npm run check 退出码 0：类型、依赖边界、70 项逻辑/构建测试、双框架构建及 53 项 Chromium 全部通过，无失败、跳过、todo 或重试。浏览器组合为 20 项静态、12 项 HTTP、8 项扩展主题表单、5 项开发及 8 项富正文。

契约检查日志 `/tmp/blog-theme-keys-contract.log`；定向修复前 `/tmp/blog-theme-keys-before.log`、修复后 `/tmp/blog-theme-keys-after.log`；完整检查 `/tmp/blog-local-check-implementation-12.log`。该轮结果见上述日志；共享 [HTML 报告](../../playwright-report/index.html) 随最新验收更新，字段规则见 [扩展文档](../extensions.md)。

最终 [扩展字段验收 JSON](../../.generated/local-smoke/theme-option-results.json) 与 [implementation-12 产物审计](../../.generated/local-smoke/artifact-audit-implementation-12.json) 确认本轮实例目录自动清理为空，25 个固定端口关闭；两框架各七个生产文件、公开内容为空，无主题测试选项或文章混入。内容文件、buildId 和 CSS 哈希与 [implementation-11 基线](../../.generated/local-smoke/artifact-audit-implementation-11.json) 相同，JavaScript 与 index.html 引用随表单修复改变。原有请求生命周期、正文真实性和清理记录保留；所有验收文件均在本机忽略目录。本轮没有推送、查询 GitHub、发布或接入真实后端。

## implementation-13 准确性、鲁棒性与可靠性审查

本轮逐项审查内容契约、静态构建、HTTP 与请求生命周期、控制器、存储/分享/路由、正文转换、主题和双框架渲染、构建隔离及退出清理。问题影响、修复、兼容性和验证边界见 [审查文档](../specs/reliability-audit.md)。

- 首批 11 项新回归全部在旧实现失败：切换来源的分享清理/旧状态、URL 失败保持、非法身份、start 前提前初始化；API 基址 query/fragment、部署路径；posts/site.json 符号链接入口；空目标正文链接；错误 HTTP 正文和迟到响应未释放。修复前日志 `/tmp/blog-reliability-before.log`（24 项、13 通过、11 失败）。
- 第二批 3 项新回归全部在旧实现失败：冒号身份的个人存储键碰撞、连字符组成部分的脚注 ID 碰撞，以及显式 null 分页限额被当成默认。日志 `/tmp/blog-identity-before.log`。编码身份和锚点组成部分后消除碰撞，查询只在 undefined 时采用默认。
- 修复后相关 33 项回归全部通过，日志 `/tmp/blog-reliability-after.log`；地址失败保持回归进一步使用实际进行中的内容 Promise，验证 AbortSignal 未取消、模型保持、旧请求最终完成，五项来源/存储回归补验通过，日志 `/tmp/blog-reliability-switch-after.log`。没有添加新计数或替换旧请求内容。
- 真实 HTTP 回归验证 404/401/403/429/503/400 的持续正文在请求报错后关闭，固定错误不变，没有自动重试；可注入迟到响应也取消未读流。原有取消与超时正文测试继续通过；清理不能强制结束永不完成的自定义适配器。
- 八项富正文浏览器场景扩展验证空 href 与作者 title，并验证含连字符脚注的精确焦点及路由保留，覆盖两来源、两框架、根/子路径及两主题。
- 完整 npm run check 退出码 0：类型、边界、84 项逻辑/构建测试、双生产构建和 53 项 Chromium 全部通过，无失败、取消、跳过、todo 或重试。完整日志 `/tmp/blog-local-check-implementation-13.log`；该轮结果见日志，共享 [HTML 报告](../../playwright-report/index.html) 随最新验收更新。
- 补充回归调整后类型与模块边界复核通过；actionlint 1.7.11 对现有工作流的静态检查及 git diff --check 通过，没有执行 GitHub 作业。

最终 [可靠性验收 JSON](../../.generated/local-smoke/reliability-results.json) 与 [implementation-13 产物审计](../../.generated/local-smoke/artifact-audit-implementation-13.json) 记录 14 项新增回归、八项扩展正文场景及清理/内容检查。本机脚本 `.generated/local-smoke/reliability-audit.mjs` 绑定本轮日志和 [implementation-12 基线](../../.generated/local-smoke/artifact-audit-implementation-12.json)：临时实例目录自动清理为空，25 个固定端口关闭，两个生产目录各七个文件；公开文章数为零，站点只含 schemaVersion，无夹具、草稿或外部文件事实。内容文件、buildId 及 CSS 哈希与前轮相同，JavaScript 和 index.html 引用随运行时修复改变。测试 HTTP 使用系统分配的本机端口，退出等待 server.close；不计入固定 25 个端口。

当前生产身份的个人存储键不变；需要编码的旧身份改用新键，旧记录保留而不自动迁移歧义。API 基址 query/fragment 和非规范化部署路径现在提前拒绝；具体配置规则见 [configuration.md](../configuration.md)。本轮未推送、查询 GitHub、发布或接入真实后端，生产内容没有添加事实或测试文章。

## implementation-14 内容、构建和渲染完整性

问题、影响、兼容性与边界见 [完整性审查](../specs/integrity-audit.md)。本轮确认十类问题，不重复前轮已完成的修复。

- 新增 `tests/integrity.test.ts` 十六项回归，修复前全部失败；日志 `/tmp/blog-integrity-before.log`。输出覆盖仅使用隔离临时文件，证实旧构建会成功替换作者内容目录，未用项目输入执行破坏性复现。
- 内容根目录缺失拒绝；共享真实路径检查隔离内容与输出，包括符号链接别名；CLI 同时保护项目应用、包、脚本、文档、测试、默认内容、版本库、依赖与配置。两框架 static/http 各验证八个非法输出目标，作者正文和源码标记始终保持。
- 暂存创建与写入失败纳入 finally 清理，ENOSPC 注入后原指针保持且无 stage/backup；测试恢复内置 fs 绑定，不依赖磁盘填满或权限差异。
- 空链接遍历嵌套图片；本地 URI 路径段解码一次，中文/空格/百分号/# 文件名映射保持原始引用，编码分隔符/控制字符/坏 UTF-8 与实际目录逃逸失败且保留旧输出。
- 重复脚注保留每条作者文字，首条作为引用目标，其他定义使用确定唯一 ID；稀疏标签/资源/请求 ID/框架注册/API 页拒绝。静态目录集合须与清单一致，失败不缓存；静态工厂和独立探测器统一 directoryUrl。
- 十六项定向回归全部通过，日志 `/tmp/blog-integrity-after.log`。第一次完整检查的 100 项逻辑/构建通过、浏览器 49 通过/4 失败：链接内图片的重试按钮触发父链接导航，正文退出到首页。日志 `/tmp/blog-local-check-implementation-14-initial.log`；失败上下文与追踪保存于 `.generated/local-smoke/integrity-initial-browser/`。
- 双渲染器重试按钮阻止默认导航和冒泡，再派发原资源事件；四项静态来源恢复回归补充地址保持断言。八项富正文场景验证链接内图片、两条脚注文字、唯一 ID 和首定义焦点，覆盖两来源、两框架、根/子路径及两主题。
- 最终完整 npm run check 退出码 0：类型、模块边界、100 项逻辑/构建测试、双框架生产构建及 53 项 Chromium 全部通过，无失败、取消、跳过、todo 或重试；日志 `/tmp/blog-local-check-implementation-14.log`，最新 [HTML 报告](../../playwright-report/index.html)。现有工作流的 actionlint 1.7.11 静态检查及 git diff --check 通过，未执行 GitHub 作业。

[完整性验收 JSON](../../.generated/local-smoke/integrity-results.json) 与 [implementation-14 产物审计](../../.generated/local-smoke/artifact-audit-implementation-14.json) 由本机 `.generated/local-smoke/integrity-audit.mjs` 核对该轮日志与 [implementation-13 基线](../../.generated/local-smoke/artifact-audit-implementation-13.json)。实例目录自动清理为空，25 个固定测试端口关闭；两个生产目录各七个文件，公开文章数为零，站点只含 schemaVersion，无测试文章、夹具或草稿。内容文件、buildId 和 CSS 哈希与前轮一致，JavaScript 及 index.html 引用因运行时修复改变。前轮验收和首次失败证据均保留，脚本不用于给其他版本生成结论。

更新设计、审查、计划、配置、写作、扩展、使用和 README，明确 URI 文件名及输出路径的新规则。当前继续仅本地验证，未推送、查询 GitHub、线上发布或接入真实 API。

## 外部未完成条件

- P7 此前已完成初始化提交和推送；首次实际作业失败已定位到 Configure Pages，尚未确认线上地址或 T14。当前按用户要求暂缓，不影响上述本地验收通过；没有改变仓库 Pages 设置、仓库可见性、Actions 变量或 secrets。
- Vue 发布目标已明确并写入工作流；用户也已确认 Pages 来源设为 GitHub Actions，SSH 推送已成功。真实作业及线上结果仍需验证；没有环境 API 认证。BLOG_FRAMEWORK 变量是可选显式覆盖。
- 真实后端 API 未提供；HTTP 契约由受控本机服务及错误/取消测试验证，真实服务器的授权、CORS 和可用性待接入后验证。
- 不承诺 SSR、预生成文章 HTML、SEO 或分享卡片，这些不属于当前客户端初始化范围。

## implementation-15 静态版本与通知生命周期

五类问题、兼容行为及测试方法见 [审查文档](../specs/version-lifecycle-audit.md)。本轮继续审查未覆盖的输入与时序，保留全部前轮证据。

- 新增 `tests/version-lifecycle.test.ts` 的最初十四项在旧实现全部失败：五种跨版本地址、非法版本身份、URL 编码歧义、bootstrap 通知中重复初始化、嵌套导航倒序，以及五个阶段的即时销毁后继续读取。日志 `/tmp/blog-version-lifecycle-before.log`，14 项、0 通过、14 失败。
- 修复后十四项通过，日志 `/tmp/blog-version-lifecycle-after.log`。再添加合法根/子路径、编码版本与自定义文件名，以及错配探测失败后修正恢复的两项补验；相关来源、控制器及完整性回归共 54 项通过，日志 `/tmp/blog-version-lifecycle-targeted.log`。补验不计作修复前已复现失败。
- 静态指针及清单逐项验证同一版本目录；版本 ID 在请求前校验，地址拒绝原始或编码歧义。地址仍明确取自清单，不猜测正文或资源文件名。旧手工测试清单改为实际版本目录，正式构建格式不变。
- 控制器在通知中按顺序延后状态操作；初始化/请求捕获当前工厂、运行时及取消控制器，在通知后复核，destroy 立即生效。五项销毁测试检查实际方法调用数，连后续正文条目也不得读取。
- Chromium 新增四项用例覆盖 Vue/React 根/子路径，每项逐一注入五种跨版本映射，验证启动 invalid-response、零站点/目录/正文/图片请求、无脚本异常且不误判为已确认更新。原有来源切换、版本更新、富正文、表单及开发实例回归继续通过。
- 最终 `npm run check` 退出码 0：类型、模块边界、116 项逻辑/构建测试、双生产构建及 57 项 Chromium 全部通过，无失败、取消、跳过、todo 或重试。日志 `/tmp/blog-local-check-implementation-15.log`；最新 [HTML 报告](../../playwright-report/index.html)。actionlint 1.7.11 对现有工作流检查通过，git diff --check 通过，未执行 GitHub 作业。

[本轮验收 JSON](../../.generated/local-smoke/version-lifecycle-results.json) 与 [implementation-15 产物审计](../../.generated/local-smoke/artifact-audit-implementation-15.json) 来自 `.generated/local-smoke/version-lifecycle-audit.mjs`，绑定本轮日志和 [implementation-14 基线](../../.generated/local-smoke/artifact-audit-implementation-14.json)。25 个固定端口均关闭，实例目录自动清理为空；两框架各七个生产文件，公开文章数为零，站点仅 schemaVersion，没有夹具或额外作者事实。内容文件、buildId 及 CSS 哈希保持，JavaScript 和 index.html 引用随版本与生命周期修复改变。旧日志和审计文件保留，历史脚本不验收新版本。

本轮没有推送、查询 GitHub、恢复线上发布或接入真实后端。GitHub Pages 和真实 API 的环境验收继续暂缓，本机结果不替代这些尚未执行的项目。

## implementation-16 输入准确性与隔离

八类问题、兼容性与方法见 [审查文档](../specs/input-fidelity-audit.md)。本轮继续检查原始输入、查询契约和扩展行为，保留前轮产物基线与日志。

- 新增 `tests/input-fidelity.test.ts`。首批 16 项全部复现失败，补充两个引用隔离用例后 18 项全部在旧实现失败；最终旧行为日志 `/tmp/blog-input-fidelity-before.log`（18 项、0 通过、18 失败）。修复后相关请求生命周期、分享和主题测试共 34 项通过，日志 `/tmp/blog-input-fidelity-after.log`。
- 再添加两项合法输入补验，20 项定向通过，日志 `/tmp/blog-input-fidelity-targeted.log`。补验覆盖原生 JSON 语法、字符串转义、不同对象同名、12000 层数组，以及只读验证器、原值和引用隔离；不将它们计作已复现旧实现失败。
- 共享 parseJson 在原始文本层拒绝重复键，覆盖 frontmatter、site.json、应用配置、分享、个人配置和所有内容网络响应。键精确解码比较，不选最后值。静态歧义构建保持旧指针，个人歧义记录保留且不写入，API 整项报 invalid-response。
- HTTP 请求改读 Response.text，原有真实取消、部分 JSON 超时及非成功流释放回归全部保留；迟到注入改用 text()，实际稀疏数组序列化出的 null 条目继续失败。没有使用预解析对象绕过原始 JSON 检查。
- API 目录清除旧 ids/cursor/limit，只写本次参数；超限页失败而不截断，取消后的空查询不成功。主题验证读取独立只读快照，配置和目录返回值不共享输入/默认对象；通知中的事件保存快照，图片失败后探测不越过 destroy。
- 四项新增 Chromium 覆盖 Vue/React 根/子路径 HTTP 来源，注入重复 title 原始响应后报错且不展示任何替代标题，撤销注入并显式重载后恢复作者标题和全文，没有脚本异常。
- 最终 `npm run check` 退出码 0：类型、模块边界、136 项逻辑/构建、双生产构建及 61 项 Chromium 全部通过，无失败、取消、跳过、todo 或重试。日志 `/tmp/blog-local-check-implementation-16.log`；最新 [HTML 报告](../../playwright-report/index.html)。actionlint 1.7.11 与 git diff --check 通过，没有运行 GitHub 作业。

[输入验收 JSON](../../.generated/local-smoke/input-fidelity-results.json) 与 [implementation-16 产物审计](../../.generated/local-smoke/artifact-audit-implementation-16.json) 由本机 `.generated/local-smoke/input-fidelity-audit.mjs` 核对，绑定本轮日志与 [implementation-15 基线](../../.generated/local-smoke/artifact-audit-implementation-15.json)。25 个固定端口全部关闭，实例目录清理为空；两框架各七个文件，公开文章为空、站点仅 schemaVersion，无测试事实、夹具或草稿。内容文件、buildId 及 CSS 哈希保持；JavaScript 和 index.html 引用随解析与状态修复改变。审计同时检查 12 份 Markdown 及本地链接，前轮报告保留。

本轮没有推送、查询 GitHub、线上发布或真实后端接入。本机受控 API 与 Chromium 结果不替代尚未进行的环境验收。

## implementation-17 字节、来源配置与输出边界

五类问题及兼容行为见 [审查文档](../specs/boundary-lifecycle-audit.md)。本轮继续检查上一轮未覆盖的字节和异步输入，不重复已完成修复。

- 新增 `tests/boundary-lifecycle.test.ts` 最初十四项在旧实现全部失败，日志 `/tmp/blog-boundary-lifecycle-before.log`（14 项、0 通过、14 失败）。作者文件覆盖只在隔离的临时项目复现，没有修改实际 content 或项目 README。
- 修复后十四项与六项请求生命周期共二十项通过，日志 `/tmp/blog-boundary-lifecycle-after.log`。最初类型检查发现夹具 Buffer 与 Response BodyInit 泛型不匹配，改用独立 Uint8Array 并复核类型，不计入生产缺陷数。
- 三项补验加入后，来源/输入/请求与新增边界共 51 项通过，日志 `/tmp/blog-boundary-lifecycle-targeted.log`；补验合法 U+FFFD、中文/emoji、正文 BOM 与网络前导 BOM、已有目录更新，以及端点回调执行与原对象可编辑性。补验没有修复前失败记录。
- 文章、站点、配置和 HTTP 正文从原始字节严格解码；非法本地字节报 invalid-utf8，非法网络响应报 invalid-response。原作者文件、旧指针和正常输入值保持。请求迟到桩改用 arrayBuffer，取消/超时及未读正文释放继续通过。
- 两来源工厂、直接 HTTP 来源和探测器保存创建时配置；HTTP 端点对象独立拷贝、工厂身份冻结，等待响应时调用者修改也不能改变会话身份。回调函数闭包仍由调用者显式控制，不声称捕获所有外部状态。
- 超时仅 undefined 使用默认，null/非法范围在传输前拒绝。不可克隆排队事件按原有字段校验反馈，站点继续 ready；正常提交快照行为保持。已有普通文件输出在暂存写入前拒绝，两个 CLI 各验证 static/http，重叠保护仍优先。
- 新增四项 Chromium 覆盖 HTTP Vue/React 根/子路径，往唯一 title 字段插入非法 UTF-8 字节，确认 invalid-response 和没有替代标题，撤销注入并显式重载后恢复作者正文。夹具不是重复字段，不能靠上一轮 JSON 重复检查通过此回归。
- 最终 `npm run check` 退出码 0：类型、模块边界、153 项逻辑/构建、双生产构建和 65 项 Chromium 全部通过，无失败、取消、跳过、todo 或重试。日志 `/tmp/blog-local-check-implementation-17.log`；最新 [HTML 报告](../../playwright-report/index.html)。actionlint 1.7.11 与 git diff --check 通过，没有运行 GitHub 作业。

[边界验收 JSON](../../.generated/local-smoke/boundary-lifecycle-results.json) 与 [公开产物审计](../../.generated/local-smoke/artifact-audit.json) 由 `.generated/local-smoke/boundary-lifecycle-audit.mjs` 核对，绑定本轮日志及 [implementation-16 基线](../../.generated/local-smoke/artifact-audit-implementation-16.json)。25 个固定端口均关闭，临时实例目录为空；两框架各七个文件，公开文章为空、站点仅 schemaVersion，没有夹具/草稿/新增作者事实。内容文件、buildId 及 CSS 哈希与前轮相同，JavaScript 与 index.html 引用随修复改变。十三份 Markdown 与本地链接同时复核，前轮日志及产物审计保留。

本轮仅本地审查与修复，没有推送、查询 GitHub、发布或真实后端接入，环境验收继续暂缓。


## 恢复线上发布（2026-10-06）

- 用户明确要求公开仓库后继续线上发布；此次授权取代此前的线下范围，Vue 发布目标不变。
- 公开仓库 API 返回 private/false、default_branch/main、has_pages/false；站点尚未启用，已请求用户在 Settings → Pages 选择并保存 GitHub Actions 来源。当前环境没有 GitHub API 管理认证，仅有可用 SSH 推送权限，不索取或记录凭据。
- 远端 main 为 1e403f4，其历史为此前的初始化 32e6d27 和 Pages 修订 d663e92/1e403f4；当前本地初始化 6cbb3d8 含完整 implementation-17。合并已有远端历史并保留本地文件，后续快进推送，不改写已发布历史。
- 新增默认分支显式发布提交入口 `[publish-pages] `，手动 publish 输入仍默认关闭。普通 push/PR 不发布；发布需完整 verify 成功，再配置 Pages、构建 Vue、上传 dist/vue 并串行部署。无需创建 API 服务或添加作者内容。
- 工作流静态检查、候选构建、推送、实际作业和线上验收结果将在取得证据后追加；目前不宣告部署成功。

- 用户随后确认已重新启用 GitHub Actions 来源。Python 网络路径的匿名 API 达到共享速率上限，改用本机 Node 的公开请求读取实际状态；不会因此索取认证。
- actionlint 1.7.11 与 git diff --check 通过。以 BLOG_FRAMEWORK/vue、BLOG_BASE_PATH=/Blog/、BLOG_OUTPUT_DIR/dist/pages-vue 构建成功；七个公开文件，buildId 为 c89041b3bc4516b5264c267edc16e605b2ec09e428e28ee979b640f516999f54，站点仅 schemaVersion、文章目录和正文映射均为空，无夹具或工程文档。
- 真实 Chromium 候选验收通过：首页与资源 200、Vue 渲染、两主题、个人配置刷新、分享配置刷新、显式保存清理地址、重置、坏分享恢复及 390 像素移动布局；无页面异常、失败请求或 HTTP 错误。直接执行工作流中的实际发布表达式，九种事件/分支/提交/手动输入组合全部符合预期。候选报告和桌面/手机截图位于忽略目录 `.generated/pages-release/`，不进入发布产物。

- 发布提交 a9f525a 已快进推送 main，对应真实运行 https://github.com/JingInAI/Blog/actions/runs/37426640787。仓库 API 已确认 has_pages/true。verify 的依赖与 Chromium 安装成功，npm run check 失败，build-pages/deploy 均跳过，没有发布不完整产物。
- 公开检查仅给出退出码 1，检查摘要为空，详细日志 API 需要额外认证。自动审批拒绝公开未经审查的日志片段，该方案未执行；改为 scripts/ci-diagnostics.ts，只从日志选出固定阶段、数字计数、标准错误代码和已公开/已跟踪源码中的相对位置，不输出任意日志、断言值、URL、绝对运行路径或环境值。
- 工作流仍保留完整原始控制台日志并在验证失败时返回 1，限定元数据作为检查注释输出，权限不变。新增两项测试验证敏感值排除、白名单、ANSI、位置去重及上限，类型与 actionlint 检查通过；完整本地 CI 标记复核同时进行中。

- CI=true 的首次本地复核通过类型/边界、155 项逻辑/构建、双框架构建和 65 项浏览器，日志 `/tmp/blog-pages-ci-check.log`。候选再次检查通过，没有页面或网络错误。
- 第二次远端运行 https://github.com/JingInAI/Blog/actions/runs/37427459178 在 test 阶段失败；限定元数据显示 155 项中 149 通过、6 失败，全部指向 tests/dev-shutdown.test.ts:32 的 Local 文本断言，Pages 构建/deploy 跳过。
- 复现根因：本机 NO_COLOR 禁用 Vite/picocolors 颜色，远端开启颜色后 Local 与冒号之间插入 ANSI 控制字符，日志中不存在连续的 Local:。移除 NO_COLOR 并启用 CI/GITHUB_ACTIONS/FORCE_COLOR 后，原 Vue SIGTERM 测试在同一断言失败，日志 `/tmp/blog-ci-readiness-color-before.log`；服务器实际已监听，属于测试就绪判断错误。
- 修复改为等待真实 HTTP 200 并读完响应，十秒截止仍保留；六项测试子进程显式启用颜色且移除 NO_COLOR，不再依赖人类可读日志格式。关闭退出码、监听关闭、生成目录清理及单次/重复信号断言均保留。六项全部通过，日志 `/tmp/blog-ci-readiness-after.log`；类型/actionlint/空白检查通过。浏览器开发夹具原已使用 HTTP 就绪，不存在同类文字依赖。
- 正在相同 GitHub Actions 彩色环境下完整本地复核，并推送修复以重新验证真实发布。


### 最终发布与线上验收结果

- 在移除 NO_COLOR、CI/true、GITHUB_ACTIONS/true、FORCE_COLOR/1 的实际故障条件下，完整本地 `npm run check` 退出 0：类型与模块边界、155 项逻辑/构建、双框架生产构建、65 项 Chromium 全部通过，无失败、取消、跳过或 todo；日志 `/tmp/blog-pages-github-check.log`。
- 修复提交 **0b4d399f26589f9240f9b549bc899459edb8806f** 已推送 main。真实运行 [37428114955](https://github.com/JingInAI/Blog/actions/runs/37428114955) 的 **verify、build-pages、deploy 全部 success**，diagnose-pages 按规则 skipped；运行整体 completed/success。部署成功于 2026-10-06 07:15 UTC，未覆盖或强制推送远端历史。
- 实际站点：[https://jinginai.github.io/Blog/](https://jinginai.github.io/Blog/)，Vue，静态来源，部署根路径 `/Blog/`；buildId 为 `c89041b3bc4516b5264c267edc16e605b2ec09e428e28ee979b640f516999f54`。
- 真实线上 Chromium 验收于 07:16 UTC 通过：首页 HTTPS/200、Vue 渲染、JS/CSS 的 `/Blog/assets/` 路径、同版本指针/清单/目录/站点、两主题、个人配置刷新、分享刷新、显式保存清理地址、重置、坏分享恢复、390 像素无横向溢出、缺失详情刷新且不补标题，以及非法哈希返回首页恢复。无页面异常、失败请求或 HTTP 错误。报告 `.generated/pages-release/online-smoke.json`，桌面/手机截图为同目录 `online-desktop.png` / `online-mobile.png`；均是本机忽略证据，不上传至博客。
- 独立线上产物核对通过：七个公开文件 HTTP/200、每个 SHA-256 与 Vue `/Blog/` 候选完全一致；README.md、package.json、blog.config.json 的站点请求均为 404。记录 `.generated/pages-release/online-artifacts.json`；真实运行的作业/步骤记录为 `actions-status.json`。
- 内容真实性：生产目录仍为空，正文映射为空，站点信息仅 schemaVersion；没有加入测试文章、虚构作者或站点资料。当前空内容站点首次发布已完成；真实文章/图片与已打开旧页跨内容发布的故障/重载环境验证保持待办，已有本地跨版本证据不冒充线上验收。真实 API 未启用，不计生产 CORS/授权验收。
- 后续普通 push/PR 仅验证；更新站点时在默认分支手动 publish/true，或推送标题以 `[publish-pages] ` 开头的显式发布提交。此次收尾只更新文档，普通推送不会重复部署。


## 用户指定 RSI 文章的发布测试（2026-10-06）

- 用户指定 https://prism-shadow.github.io/awesome-rsi/#blog/understanding-rsi，并明确确认全文及配图使用权。源快照为 36e91f8fed67e2cd0c761126f91042513df5d6ae，使用来源原生中文 Markdown；其正文与实际网页部署脚本中的 Markdown 逐字一致。
- 导入 content/posts/understanding-rsi.md，id/understanding-rsi、publication/published。标题、摘要、标签来自原站元数据；没有原页 author，不填写 author。原页日期仅为 2026-09-03，在来源附记保留，不补具体时间或时区。只改图片引用路径并追加来源链接，原文其余字符完整保留。
- 22 张图共 7464415 字节，全部校验 PNG、源长度与 Git blob SHA-1、SHA-256。两张较大文件的网页/API请求超时后，通过固定版本只读 Git 对象补齐，未改变内容或压缩图片。
- 双框架 `/Blog/` 生产候选均构建成功，共用 buildId 6090834eca8ee395a7394ae8f849959c67624deec9689c1278ac22c0a78ae40c。两框架各一项长文验收均通过：正文全部文本、27 标题、30 链接、22 alt/图片解码、两主题、摘要不加载图片、详情刷新、分享/保存、个人刷新、1280/390 像素无溢出；无脚本或网络错误。
- `.generated/source-import/local-longform.json`、import-provenance.json、asset-provenance.json 与截图为本机忽略证据。详细规则见 [RSI 导入记录](../specs/understanding-rsi-import.md)。原文公式按原始 LaTeX 文本显示，不声称复刻源站 KaTeX 排版。
- 已准备真实旧版本会话，在本次新内容上线后验证目录失效提示、显式更新及分享/风格/空选择保留；发布和线上结果取得后追加。

- 首轮发布提交 54e20bc571f5f8a404d2af6c129ddb14351b44b5 的 [Actions 运行 37433009889](https://github.com/JingInAI/Blog/actions/runs/37433009889) 中 verify/build-pages/deploy 全部成功。真实线上重复长文的 12 类检查通过；30 个文件 SHA-256 与 Vue 候选完全一致，源码/配置/文档的 Pages 地址为 404。
- 首次旧空目录场景等待更新提示未通过，未计作跨发布成功：StaticContentSource 已缓存目录，刷新不会重新下载或探测；这符合固定会话版本设计。后续改用真实旧会话中未缓存正文的详情请求，避免把缓存行为误判为产品故障。保留首次证据，新增来源附记中的已核验源快照编号后进行第二次内容发布；正文其余部分与配图均不变。

- 最终发布提交 794c410c392c670ce13d6d00e0b76a1861c5480c 的 [Actions 运行 37433960384](https://github.com/JingInAI/Blog/actions/runs/37433960384) 中 verify/build-pages/deploy 全部成功。最终 buildId 为 9925b008ea691efcbd916dc9530429ff557394c391e5c48b811cf05af835b8db。Vue/React 最终本地长文检查通过；Vue 线上 12 类长文检查通过，全部 DOM 文本、27 标题/30 链接/22 alt 正确、22 图解码成功，1280/390 像素无溢出，无页面或非预期网络错误。
- 08:14 UTC 的最终产物审计确认 30 个文件均 HTTP 200、SHA-256 与 Vue 候选一致；README/配置/工程文件/源 Markdown/审查文档的 Pages 地址均 404。独立 Node 下载曾超时，改用 Chromium 实际 HTTPS 传输完成核对，不改文件或压缩配图。证据为 .generated/source-import/online-artifacts.json。
- 08:05 UTC 打开的真实旧版本 6090834 会话未读取正文；最终 9925b008 上线后，通过同文档 hash 导航请求旧正文，实际收到 404、更新按钮出现；更新前详情路由和分享查询保留，显式重载后新正文和 22 图恢复、更新按钮消失、风格仍为 card-grid。随后脚本错误地在详情页定位仅首页提供的选择框，退出 1，不能记作整段通过。检查位置已修正，此修正未再次进行跨发布运行。已完成断言的审查记录为 old-session-core-results.json。
- 08:15 UTC 另在最终真实页面打开旧会话的分享查询及详情目标，验证详情/22 图/风格/查询，返回首页验证空选择与无自动展示内容，全部通过；独立结果为 recovered-config-results.json，不称为同一跨发布脚本全通过。首轮缓存场景和最终脚本定位错误均保留，未因测试预期而修改产品运行时。
- 来源、最终本地/线上报告、资源哈希与桌面/手机截图位于本机忽略目录。真实 API/CORS/授权与线上存储/地址异常注入未执行，不计完整 T14；原文公式保留 LaTeX 文本。

## 网页风格与间距修复（2026-10-06）

- 用户报告切换网页风格和间距没有变化。两框架详情分支未应用主题与 density 类，旧 compact 只调整外层容器；表单草稿提交步骤也未直接说明。
- 新增四项实际外观回归，覆盖两框架根/子路径；旧实现四项均失败（/tmp/blog-theme-before.log），修复后全部通过（/tmp/blog-theme-after.log）。断言实际内边距、行距、段落间距、背景、边框、全文文字与详情宽度，并覆盖分享保存/刷新和手机布局。
- 两渲染器的详情应用当前已提交样式；卡片详情单列，简洁列表保留透明背景及分隔线。compact 扩展至正文行距与段落等留白。表单提示点击“应用风格”，不自动提交未完成参数。
- 原文与配图未修改。完整检查、长文补验和实际发布结果取得后追加；详细规格见 [风格与间距修复](../specs/theme-appearance-fix.md)。

- 完整本地检查通过类型、边界、155 项逻辑/构建、双框架构建和 69 项浏览器，/tmp/blog-theme-full-check.log；定向四项随后纳入完整浏览器检查。
- 双框架 /Blog/ 真实 RSI 验收通过，正文、27 标题/30 链接/22 alt 与图片解码正确，无脚本或非预期网络错误；卡片宽松/紧凑的文章顶部内边距为 28.8/16px，正文行高 27.2/24px、段落外边距 16/9.6px。简洁列表顶部边框为 0、背景透明；详情全文和桌面/手机布局、分享保存及刷新正确。证据为 .generated/theme-fix/local-longform.json。
- 内容 buildId 与上一发布相同，源正文和 22 张原图未修改；前端 JavaScript、CSS 和 index.html 引用改变，线上需刷新已打开的旧页面加载修复。

- 发布提交 78d7d3d92955fa983168e868f4ffaaac2ce02d65 的 [Actions 运行 37437454539](https://github.com/JingInAI/Blog/actions/runs/37437454539) 中 verify/build-pages/deploy 全部成功。08:42 UTC 实际线上外观测量与本地一致，全文/27 标题/30 链接/22 alt/22 图、分享保存及刷新、桌面/手机均通过，无页面或非预期网络错误；online-longform.json 保存结果。
- 30 个线上文件均 HTTP 200、SHA-256 与 Vue 候选一致，online-artifacts.json 保存结果；源码、配置和审查文档的测试路径均为 404。比较截图与手机正文截图保存于 .generated/theme-fix/，不进入发布产物。更新设计、计划、使用和修复文档，历史失败和原内容发布报告保留。

## 风格与间距即时响应（2026-10-06）

- 用户要求选择选项后立即响应，原手动应用交互被替代。修改两框架主题/枚举/布尔控件的事件，直接派发共享 set-theme；文本/数字保留草稿手动提交。不完整或无效事件由共享校验保留旧配置和记录，合法选择立即生效。
- 两框架根/子路径首页与详情共八项无应用按钮回归在旧实现全部失败（/tmp/blog-theme-live-before.log）；实现后八项与八项既有扩展表单场景全部通过（/tmp/blog-theme-live-after.log）。额外新增两项即时必填参数保护，随完整检查执行。
- 普通配置即时保存，分享会话仍仅内存修改、刷新恢复原分享、显式保存退出。修改原历史测试中的普通配置间距期望为 compact；这是新的即时提交需求，不再将选项修改视为未提交草稿。详情风格类和紧凑段落样式沿用上一轮修复。
- 全文和配图未修改，规格见 [即时响应](../specs/theme-immediate-response.md)。
- CI 标记下完整检查通过类型、模块边界、155 项逻辑/构建、双框架构建及 75 项浏览器，包含新增两项不完整参数保护；日志 /tmp/blog-theme-live-full.log。
- 双框架 /Blog/ 真实 RSI 验收直接选择而不点击应用按钮，全部正文、27 标题/30 链接/22 alt/22 图解码、分享/保存/刷新与 1280/390 像素布局均通过，无脚本或非预期网络错误。卡片宽松/紧凑内边距 28.8/16px、行高 27.2/24px、段落间距 16/9.6px，简洁风格透明背景、顶部边框为 0；证据 .generated/theme-live/local-longform.json。
- 内容 buildId 保持 9925b008ea691efcbd916dc9530429ff557394c391e5c48b811cf05af835b8db；本次只更新前端交互与相关文档、测试。
- 发布提交 27e4b6fb3f8263c2414ac7105e6278b885599c58 的 [Actions 运行 37440775862](https://github.com/JingInAI/Blog/actions/runs/37440775862) 中 verify/build-pages/deploy 全部成功。09:11 UTC 真实 Vue 页面无手动应用长文验收通过，实际间距与背景测量和本地一致；全文/标题/链接/22 图、分享/保存/刷新及桌面/手机布局正确，无页面或非预期网络错误。证据为 .generated/theme-live/online-longform.json。
- 30 个线上文件均 HTTP 200、SHA-256 与 Vue 候选完全一致，源码/配置/文档的核对路径均为 404；报告 online-artifacts.json 和运行状态 actions-status.json 保存于同一忽略目录。旧页面刷新一次加载新前端后，选择内置风格、间距和标签立即生效；文档收尾普通推送不重复部署。

## 多维度阅读设置（2026-10-06）

- 用户要求先搜索自由阅读维度再决定实现。官方资料覆盖字号、字体、配色、宽度、文字间距和对齐；新增九个阅读外观维度和一个隐藏来源作者/日期的开关，搜索依据与设计取舍见 [阅读设置](../specs/reading-preferences.md)。
- 两框架按四组展示中文选项，共享描述增加可选 group/choiceLabels 并校验。新参数可选，旧主题 version/1 配置保持有效；普通自动保存、分享显式保存契约延续。恢复默认保留内容与路由，共同阅读偏好在两内置风格之间保留。
- 新增四项浏览器综合场景首次均通过，原有四项外观测试因此前期待换主题重置 density 而失败。新版保留 density 后，测试补验切换保留再显式选择宽松/紧凑，继续检查真实外观差异，不删除断言；首次日志 /tmp/blog-reading-targeted.log 保留。
- 新增三项逻辑回归，覆盖旧配置、值/类型拒绝、分组/标签校验及跨框架分享。完整检查与真实长文/线上结果完成后追加；本机报告保存于 .generated/reading-preferences/。
- CI 标记下 npm run check 通过类型/边界、158 项逻辑/构建、双生产构建和 79 项浏览器，日志 /tmp/blog-reading-full.log。进一步将窄屏面板限制为 min(60vh, 32rem) 内部滚动后，全部 79 项浏览器再次通过，日志 /tmp/blog-reading-browser-final.log；新增检查覆盖面板限高、所有控件可访问，320/390 像素下 200% 字号与宽间距无横向溢出。
- 浅色/深色/暖纸色的九类正文及界面文字抽样对比度均不低于 4.5:1。两框架最终 /Blog/ 候选的真实 RSI 验收通过，全量文本、27 标题/30 链接/22 alt/22 图解码正确，全部新增参数直接生效、分享/保存/刷新和手机布局正常，无页面或非预期网络错误。200% 字号 32px、双倍行距/段间距 64px、字/词间距 3.84/5.12px、窄栏 448px；报告 local-longform.json。
- 内容 buildId 保持 9925b008ea691efcbd916dc9530429ff557394c391e5c48b811cf05af835b8db，正文与配图未修改。前端脚本和样式改变，已打开的旧页面需刷新一次加载新版本。
- 发布提交 721bfdfb169d9f362f65eb726d7738d9ff5b15ca 的 [Actions 运行 37444744447](https://github.com/JingInAI/Blog/actions/runs/37444744447) 中 verify/build-pages/deploy 全部成功。09:45 UTC 真实 Vue 页面新增参数外观、完整正文/27 标题/30 链接/22 alt/22 图、分享/保存/刷新和桌面/手机验收通过，实际外观与最终候选一致，无页面或非预期网络错误；报告 online-longform.json。
- 30 个线上文件均 HTTP 200、SHA-256 与最终 Vue 候选一致，源码/配置/文档的核对路径为 404；报告 online-artifacts.json、运行状态 actions-status.json 和截图均在 .generated/reading-preferences/。收尾普通文档提交不重复部署，原内容、上一轮即时响应与各轮失败证据保留。

## 展示状态与配置边界审查（2026-10-06）

- 用户要求审查准确性、鲁棒性、可靠性。发现六类问题及补充边界：快速操作覆盖设置/内容、键顺序不同的 JSON 枚举显示、浅复制与不兼容枚举保留、控制器配置/注册/身份引用污染、继承迁移执行，以及非法 API 端点进入传输。详见 [审查规格](../specs/presentation-reliability-audit.md)。
- 首轮四项逻辑/六项浏览器均失败；逻辑补齐七项为六失败一已有保护通过，非法请求和继承迁移另各一项旧实现失败。拆分内容后的十项浏览器为八失败两通过，React 快速设置存在调度差异，保留两次真实结果。
- 修复两框架事件为同步实例存储，分开主题/内容草稿清理，连续操作合并最新快照；共享校验与内容模型仍是提交来源。枚举按语义显示，拒绝重复 choices；切换深拷贝并匹配目标描述。控制器保存独立配置/注册/身份，来源切换提交时快照，作者 JSON 验证先于复制；迁移仅调用自有函数，请求先验证 HTTP(S) 与 URL 凭据。
- 八项逻辑回归及十项定向浏览器通过。首次来源切换夹具用单槽存储导致旧记录误读，改为来源键隔离 Map 后通过；没有修改产品存储键或放宽身份断言。完整检查、迁移补验和真实长文/线上结果完成后追加。证据目录 .generated/presentation-reliability/，原内容、样式和前轮报告不改。

- CI 标记下完整检查通过类型/模块边界、167 项逻辑/构建（含继承迁移补验）、双框架构建及 89 项浏览器，日志 /tmp/blog-presentation-full.log。独立 Vue/React /Blog/ 候选真实 RSI 验收全部通过，记录 local-longform.json 与 /tmp/blog-presentation-longform.log；同任务字号+配色、恢复、完整正文/27 标题/30 链接/22 alt/22 图、分享保存刷新及 1280/390 像素布局正确，无页面或非预期网络错误。内容 buildId、源正文、配图和 CSS 保持；两框架脚本改变。

- 复核 25 个测试端口均关闭、临时 dev/build 实例目录为空、Playwright 最后状态 passed，无失败项；结果 local-checks.json。发布提交 80f4129f045231d03ce79bd1b6da09132e3c08ac 已推送，对应 Actions 运行 37449332133，最终部署与线上验收结果另行追加。

- 发布提交 80f4129f045231d03ce79bd1b6da09132e3c08ac 的 [Actions 运行 37449332133](https://github.com/JingInAI/Blog/actions/runs/37449332133) 中 verify/build-pages/deploy 全部成功。10:28 UTC 真实 Vue 页面的同任务字号/配色、恢复默认、双风格及间距、全量正文/27 标题/30 链接/22 alt/22 图、分享/保存/刷新及桌面/手机布局均通过，页面和非预期请求错误为空；测量与候选一致，结果 online-longform.json。
- 30 个线上文件全部 HTTP 200、SHA-256 与本轮 Vue 候选逐一一致，核对的源码/配置/文档路径均 404，结果 online-artifacts.json；Actions 状态、截图和本机结果保存在 .generated/presentation-reliability/。已更新设计、计划、使用和扩展文档，原内容及历史记录保留；收尾文档普通提交不重复部署。
