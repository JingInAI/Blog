# 博客项目设计规格

修订标识：implementation-05，基于 review-07，与计划同步实施。

状态：P0–P6 已实施并通过本地验收；初始化提交已推送，首次 P7 作业在 Pages 元数据读取失败，修订与 T14 验收继续进行。历史审查表记录当时的修订，当前代码/测试状态见 [执行记录](../plans/execution.md)。

“必须”为验收要求，“建议”为可替换实现选择。计划见 [plan.md](../plans/plan.md)。

## 1. 需求与范围

| 编号 | 要求 |
| --- | --- |
| R01 | 内容与渲染分离，依据底层内容自动渲染网页 |
| R02 | 支持静态数据源，提供独立后端 API 接入接口 |
| R03 | 同一份内容支持不同风格 |
| R04 | 用户选择内容、顺序与风格 |
| R05 | 内容事实仅来自内容模块，不编造、猜测或自动补写 |
| R06 | 支持 Vue、React，并可通过适配器扩展框架 |
| R07 | GitHub Pages 根路径、仓库子路径及刷新可用 |
| R08 | 设计位于 docs/specs/，计划位于 docs/plans/ |
| R09 | 未明确允许公开的内容及专属资源不进入产物 |
| R10 | 请求失败、异步竞争与配置恢复行为确定 |

R09、R10 是落实公开发布与真实性的工程约束。顺序调整、本地保存、分享为本版本采用的交互能力。

GitHub Pages 托管静态前端，API 服务独立部署。初期采用客户端渲染：构建应用壳、公开目录和独立正文文件，浏览器按需加载正文；API 内容运行时获取。预生成文章 HTML、搜索收录、分享卡片、服务端渲染不属于初期完成标准。

分别构建 Vue 与 React，通过显式发布配置选择一个应用部署。内容和风格为运行时选项；浏览器内切换框架不属于本版本范围。认证仅预留请求策略注入接口，后端部署与账号系统不属于初始化任务。

## 2. 模块与依赖

```text
docs/specs/design.md       设计规格
docs/plans/plan.md         实施计划
content/site.json         作者提供的公开站点信息
content/posts/            Markdown 与显式元数据
content/assets/           原始内容资源
packages/contracts/       类型、运行时校验、错误结构
packages/content-source/  静态与 HTTP 数据源
packages/render-core/     共享控制器、模型构造、正文转换
packages/theme-contracts/ 主题注册与参数协议
packages/renderer-vue/    Vue 适配器与主题实现
packages/renderer-react/  React 适配器与主题实现
apps/blog-vue/            Vue 应用装配
apps/blog-react/          React 应用装配
scripts/build-content/    公开目录、正文与资源生成
.github/workflows/        验证与 Pages 发布
```

目录在检查现有工程后可以调整，职责和依赖边界必须保持。contracts 不依赖框架、DOM 运行时或业务包；mount 的 HTMLElement 等仅为宿主端口类型，不在契约中访问 DOM。数据源、核心、主题契约可依赖 contracts，不能依赖 Vue/React。两个 renderer 只依赖共享契约、主题契约与自身框架，不能互相导入。apps 装配路由、存储、数据源、控制器与适配器。构建脚本复用内容校验，不能从页面组件提取内容。

控制器通过注入的数据源和存储接口工作，不直接访问 DOM 或 localStorage。模型构造、正文转换和参数校验为纯逻辑。CI 检查反向依赖和跨框架导入。

源码边界检查自动发现 renderer-<name> 包，以语法树检查实际导入/再导出、动态导入/require、类型导入和 import-equals；禁止计算的动态模块名及源码目录逃逸，运行时/peer/optional 依赖遵循相同政策。覆盖 TS/JS 及 JSX 变体、MTS/CTS/MJS/CJS 和 Vue/Svelte 脚本块，正文字符串与注释不被当作依赖。其他新增共享包须显式声明政策；源码检查不替代新框架的编译/渲染验收。

```text
内容文件 / HTTP API → 数据源校验 → 共享控制器 → 页面模型 → 框架适配器
                                    ↑                       ↓
                             展示配置与存储 ← 标准用户事件
```

## 3. 内容契约与公开边界

```ts
interface SiteInfo {
  schemaVersion: 1;
  title?: string;
  description?: string;
  author?: string;
  language?: string;
}
interface ContentRecord {
  schemaVersion: 1;
  id: string;
  publication: 'draft' | 'published';
  title: string;
  body: { format: 'markdown'; value: string };
  summary?: string;
  author?: string;
  publishedAt?: string;
  tags?: string[];
  assets?: Array<{ id: string; url: string; decorative: boolean; alt?: string }>;
}
interface ContentSummary {
  schemaVersion: 1;
  id: string;
  publication: 'published';
  title: string;
  summary?: string;
  author?: string;
  publishedAt?: string;
  tags?: string[];
}
```

schemaVersion、id、publication、title、body 必填。ID 稳定，不随标题改变；非空，最大 128 个 Unicode 码点，拒绝控制字符、斜杠、反斜杠、单独 . 或 .. 以及非法 Unicode。导航编码为独立路径段；静态文件由安全清单映射，不直接拼接原始 ID。

title 不能仅含空白；body.value 可以为空，表示作者明确提供空正文。校验不修改原文，可选字段的缺失和显式空值保留区别，都不生成替代信息。publishedAt 若提供必须为含时区 RFC 3339 时间戳，默认显示原值；其他显示格式须显式配置并保留完整原值可访问，不猜测时区或补当前时间。

静态内容严格校验：未知元数据、正文/资源对象字段及 site.json 字段阻止构建，诊断包含源文件、字段路径和 unknown-field 代码。summery 等拼写错误不能静默成为缺失摘要。site.json 的公开字段为 schemaVersion: 1 及可选 title、description、author、language。应用的 siteId、sourceId、API 地址和默认展示配置由独立应用配置提供，不当作文章事实。

HTTP 包络和内容允许兼容字段，但未知字段不进入展示模型，并产生独立 unknown-api-field 诊断。已知字段严格校验，未知版本、非法类型、正文格式和发布状态拒绝接受。公开诊断入口展示字段路径与固定提示，不暴露字段值、密钥或内部服务信息。不能声称支持被忽略的字段。新增事实字段须同步契约版本或兼容变更、内容规范、主题映射和验证。

publication 必须显式声明；只有 published 进入公开索引和正文。draft 不进入。缺失状态、重复 ID 或非法静态内容令构建失败，保留上次有效产物。日期不承担发布权限，未来日期的 published 不自动隐藏。

公共 API 仅返回已发布内容，未公开 ID 返回统一 not-found；客户端筛选不替代授权。用户选择只控制展示，未选中的 published 文件仍可被直接访问。

禁止复制整个 content/：只输出公开目录、正文及其显式引用的资源。草稿专属资源、夹具、内部配置和密钥不能进入产物；公开内容引用的共享资源可以公开。资源清单记录来源，本地路径规范化与解析符号链接后仍须在 content/assets/ 内，输出不保留符号链接。远程图片只能使用作者提供的地址。

构建按明确来源隔离：static 才读取本地内容、生成指针/清单与公开资源；http 仅构建前端应用，不读取或复制本地 content/，也不携带静态来源的指针、站点、目录、正文或资源。HTTP 模式不因未使用的本地内容无效而失败；整体替换目标目录时移除上一份静态产物。开发模式遵循相同来源选择，不因 API 失败自动回到本地来源。

信息性图片须有非空 alt；装饰性图片须明确 decorative: true 并使用空 alt，Markdown 装饰用途通过显式资源引用声明。不能猜测图片描述。

site.json 采用 SiteInfo 契约。文件缺失时构建器输出仅含 schemaVersion: 1 的合法空站点信息；这是空结构，不添加站点事实。显式文件中的未知字段或非法已知字段仍阻止构建。站点 author 是站点信息，不能填入缺失的文章 author；其他站点字段也不能自动补成文章字段。

站点名称、作者、介绍等只来自内容，缺失省略。选择、重试等固定操作文案不代表文章事实。初始化不添加虚构文章或作者，无内容使用空状态。元数据序列化格式在 P0 确定，字段说明和示例必须满足本契约。

## 4. 数据源与 HTTP 协议

```ts
interface SourceDiagnostic { code: 'unknown-api-field'; fieldPath: string; }
interface ContentQuery { ids?: string[]; cursor?: string; limit?: number; }
interface ContentPage {
  items: ContentSummary[];
  nextCursor?: string;
  diagnostics: readonly SourceDiagnostic[];
}
interface StaticAssetEntry { publishedUrl: string; }
type ResourceContext =
  | { kind: 'static'; sourceId: string; buildId: string;
      assetsByReference: Readonly<Record<string, StaticAssetEntry>> }
  | { kind: 'http'; sourceId: string; resourceBaseUrl?: string };
interface ContentResult {
  item: ContentRecord;
  diagnostics: readonly SourceDiagnostic[];
  resourceContext: ResourceContext;
}
type SourceIdentity =
  | { kind: 'static'; sourceId: string; buildId: string }
  | { kind: 'http'; sourceId: string };
interface SiteResult {
  info: SiteInfo;
  diagnostics: readonly SourceDiagnostic[];
  source: SourceIdentity;
}
interface ContentSource {
  getSite(signal?: AbortSignal): Promise<SiteResult>;
  list(query: ContentQuery, signal?: AbortSignal): Promise<ContentPage>;
  get(id: string, signal?: AbortSignal): Promise<ContentResult>;
}
type ContentErrorCode = 'not-found' | 'unauthorized' | 'forbidden'
  | 'unavailable' | 'network' | 'timeout' | 'invalid-response' | 'deployment-changed';
interface ContentError { code: ContentErrorCode; retryable: boolean; }
```

getSite 返回站点信息、独立兼容诊断及来源身份。静态来源读取会话清单指定的独立站点文件，HTTP 建议 GET /site 返回 `{ "schemaVersion": 1, "site": {...} }`；没有站点事实时服务返回 `{ "schemaVersion": 1, "site": { "schemaVersion": 1 } }`，不能把 404 当成合法空站点。HTTP 适配层可映射既有端点，但不能从文章作者、API 主机或仓库名拼出站点信息。SiteResult 的 sourceId 和静态 buildId 必须匹配当前实例；身份或已知字段非法拒绝接受。站点也采用静态未知字段拒绝、HTTP 未知字段独立诊断的规则。

list 是轻量目录，不含正文；get 返回正文、独立诊断与 ResourceContext。ResourceContext 是读取/部署上下文，不属于作者事实，不写回 ContentRecord。其 sourceId 必须与当前来源一致，静态 buildId 必须与当前会话清单一致；不匹配时拒绝提交。静态资源表由公开构建清单生成，HTTP 基址由后端映射或显式数据源配置提供，不能从详情端点猜测。若两处均提供，数据源配置必须声明采用哪一处；无声明且值不同则 invalid-response。resourceBaseUrl 若存在必须为有效绝对 http/https URL，无基址也允许读取仅含绝对资源的正文。静态诊断为空，因为未知字段在构建时拒绝。两来源共享已知字段、身份和公开状态校验。

get 的 item.id 必须与请求 ID 精确相等，不能忽略大小写、归一化或替换别名；publication 必须为 published。请求 A 返回 B、返回 draft 或非法结构均为 invalid-response，不缓存、不展示替代文章。ids 筛选不能返回未请求 ID；非法条目使整页失败，不部分接受。

查询规则：

- ids 与 cursor/limit 互斥，重复 ID 或非法组合请求前拒绝；空 ids 返回空结果。
- 普通分页 limit 默认 20，整数范围 1–100。
- 默认目录按 ID 的 Unicode 码点顺序排列，不本地化排序或推测日期。
- 筛选响应顺序不保证，正文按 contentIds 排序。
- 筛选不存在 ID 可省略；get 返回 not-found，控制器保留错误位置。
- nextCursor 缺失为结束；空字符串、重复游标、跨页重复 ID 为 invalid-response。
- API 变更期间不保证跨页快照，刷新从第一页开始；目录不决定正文最终可用性。

HTTP 建议端点 GET /contents?limit=20&cursor=...、重复 ids 参数和 GET /contents/:id；可映射其他端点但必须满足契约。ID 按独立路径段编码。

列表成功包络为 `{ "schemaVersion": 1, "items": [...], "nextCursor": "..." }`，末页省略游标；详情为 `{ "schemaVersion": 1, "item": {...} }`。诊断由适配层生成，不要求后端提供。错误可用 `{ "schemaVersion": 1, "error": { "code": "..." } }`，客户端依据 HTTP 状态及校验分类，不直显后端任意正文。

HTTP 404 → not-found（静态文件/清单缺失按第 9 节版本探测处理）；401/403 → unauthorized/forbidden；429、5xx → unavailable；其余非成功或非法成功响应 → invalid-response。fetch 网络/CORS 失败统一 network，不能可靠承诺区分。超时默认 15 秒，可配置 1–120 秒。

失败抛统一 ContentSourceError 携带 ContentError，取消抛 AbortError，控制器不显示取消错误。network、timeout、unavailable 可重试，其余不可重试。初期不自动重试、不换源、不用旧缓存代替失败。静态成功内容按 sourceId/buildId/资源种类/ID 会话缓存，站点与正文使用不同种类，避免文章 ID 与站点缓存键冲突；重试绕过缓存。HTTP 不缓存。正文、目录、资源使用同部署版本及哈希名。deployment-changed 不允许普通请求重试，提供显式更新页面操作，不自动拼入新版内容。

API 地址为公开配置，默认 credentials: omit，后端处理 CORS。认证预留策略注入，不在 Pages 保存密钥。

来源创建也通过共享端口注入，不在适配器内启动。SourceRuntimeFactory.initialize 返回已校验运行时；静态运行时含固定 buildId 与 DeploymentProbePort，HTTP 不提供静态探测器。初始化被取消时抛 AbortError。返回后才开始 getSite/list/get；来源身份和加载代号的规则同样适用于初始化，不能先创建可用假来源再补校验。

```ts
type SourceRuntime =
  | { kind: 'static'; sourceId: string; sourceInstanceId: string; buildId: string;
      source: ContentSource; deploymentProbe: DeploymentProbePort }
  | { kind: 'http'; sourceId: string; sourceInstanceId: string; source: ContentSource };
interface SourceRuntimeFactory {
  readonly identity:
    | { kind: 'static'; sourceId: string; expectedBuildId: string }
    | { kind: 'http'; sourceId: string };
  initialize(signal?: AbortSignal): Promise<SourceRuntime>;
}
type BootstrapFailure =
  | { kind: 'request'; error: {
      code: 'network' | 'timeout' | 'unavailable' | 'unauthorized' | 'forbidden' | 'invalid-response'; retryable: boolean } }
  | { kind: 'version'; expectedBuildId: string; observedBuildId: string };
type BootstrapState =
  | { status: 'loading' }
  | { status: 'error'; failure: BootstrapFailure };
```

工厂 identity 是显式应用配置，不能从文章字段生成；返回运行时的 kind/sourceId 以及静态 buildId 必须与之相符，否则拒绝且释放运行时。请求初始化失败抛统一 BootstrapError 携带 BootstrapFailure；来源工厂配置/包络/清单非法为 request/invalid-response，不能让未捕获异常阻止应用壳挂载。HTTP 来源创建只校验配置并建立运行时，具体 API 是否可用由后续站点/目录/正文状态表达。

## 5. 主题协议、配置与保存模式

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
interface JsonObject { [key: string]: JsonValue; }
interface DisplayConfig {
  version: 1;
  contentIds: string[];
  themeId: string;
  themeVersion: number;
  themeOptions: JsonObject;
}
interface ThemeOptionDescriptor {
  key: string;
  label: string;
  kind: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  defaultValue?: JsonValue;
  choices?: readonly JsonValue[];
}
interface ThemeChoice {
  id: string;
  label: string;
  version: number;
  availability: 'available' | 'unsupported-framework';
  unavailableReason?: 'unsupported-framework';
  options: readonly ThemeOptionDescriptor[];
  defaults: JsonObject;
}
interface ConfigStatus {
  origin: 'personal' | 'author-default' | 'share' | 'manual' | 'none';
  persistence: 'auto' | 'explicit';
  dirty: boolean;
  saveStatus: 'not-saved' | 'saved' | 'failed';
}
```

contentIds 不能重复，顺序就是展示顺序，空数组为明确空选择。themeVersion 为正整数。共享注册表是主题名称、版本、兼容性、参数及默认值的唯一来源；注册项包含 frameworkIds、选项校验器和上述描述。校验器具体类型在 P0 确定，选项描述必须与实际 schema 一致。初期参数采用基础控件；扩展复杂编辑参数须同步控件协议。

主题 ID 在整个注册表唯一，跨框架支持通过同一项的 frameworkIds 声明，不能注册同名的不同版本或按当前框架隐藏重复项。注册版本为正安全整数，frameworkIds 非空、元素有效且无重复；描述 key/label/kind/required、默认值与验证器均有效。生成 ThemeChoice、规范化配置及核对适配器前执行同一注册校验，拒绝歧义选择。

共享校验先执行选项描述的基础规则，再执行注册项验证器的附加约束。string/number/boolean 严格检查类型，不使用 String/Number 等隐式转换接受错误输入；enum 按 JSON 语义与明确 choices 比较，数组不会被转换成字符串选择。字段错误按 key/code 去重。defaultValue 与注册项 defaults 共同形成唯一默认值映射；相同字段同时声明时必须语义一致，未知默认字段、无效默认类型、重复选项键和没有 choices 的 enum 均拒绝。ThemeChoice.defaults 与 DisplayConfig 规范化使用同一默认值映射。

首次主题配置采用先填写、后提交：组件可以维护未提交的表单草稿，但草稿不是 DisplayConfig，不触发正文加载或持久化。必填且没有默认的选项必须填写，完成后一次提交 set-theme。共享校验器返回 ThemeValidationIssue 的字段路径/固定错误码，经 ViewCommon.themeValidation 显示；失败保留原配置，成功清除错误。切换草稿主题按新描述初始化，不能将前一主题参数隐式带入。两个框架可有不同表单内部实现，但字段和提交结果遵循同一契约。

已提交主题的 id/version/options 发生语义变化，或者当前配置被清除时，两个适配器均丢弃旧主题表单草稿并展示当前配置。比较忽略对象键顺序，保留数组顺序；同主题只改变参数也必须同步。仅修改内容选择、切换首页/详情、更新请求/保存提示时，已提交主题未变化，保留未提交表单参数。表单同步本身不能写个人记录或派发主题提交。

两框架实现按同一 id/version 注册，启动时检查缺失和多余实现。控制器生成 ThemeChoice 并通过全部 ViewModel 的共享字段提供给适配器，不在两框架硬编码另一份列表。不可用主题标明原因，选择事件拒绝。

未知选项拒绝，缺失视觉参数由共享规范化流程补入明确默认值，保存和分享规范化后的 DisplayConfig。number 必须有限；对象须为无自定义序列化行为的普通数据对象。拒绝 undefined、函数、symbol、BigInt、NaN/Infinity、循环引用、Date、Map、Set。参数和迁移结果都须 JSON 校验且往返后语义相等；解析采用同一策略，不由框架转换。

初期 minimal-list 与 card-grid 在 Vue/React 都实现，支持无摘要/图片/日期。缺图用无图布局，不制造封面。主题不能更改事实、正文段落、选择或顺序。同主题字段映射、参数含义、全文能力和事件一致，不要求 DOM 或像素相同。目录须有全文入口，摘要只用明确 summary，截断标题须仍可访问完整值，全文不截断。

未知主题/版本/参数报配置错误，不静默换风格。迁移必须为注册表声明的确定性 JSON 转换，无迁移保留旧记录要求重新选择。

个人配置存储通过同步端口注入，宿主惰性取得浏览器存储句柄并规范化异常，不能在模块顶层访问 localStorage 导致应用壳无法挂载。read 的 null 仅表示不存在；访问受限/句柄不可用为 storage-unavailable，其他读取失败为 storage-read-failed，不能包装成 null。write/remove 失败分别归类，抛 StorageError；单次操作失败不部分修改当前键。不能为可用性探测而覆盖或删除个人记录。

```ts
type StorageErrorCode = 'storage-unavailable' | 'storage-read-failed'
  | 'storage-write-failed' | 'storage-remove-failed';
interface PersonalStoragePort {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}
type PersonalReadState =
  | { status: 'not-read' }
  | { status: 'missing' }
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'error'; code: 'storage-unavailable' | 'storage-read-failed' };
```

PersonalReadState 描述本实例已观察到的个人记录结果，成功写入/删除也可更新为 valid/missing；不保证其他标签页未改变记录，不向视图提供或展示原始坏记录。分享参数存在时初始化不读取个人记录，状态为 not-read；只有按优先级确实需要个人配置或显式 use-personal-config 时才读取。

配置显式提供 siteId/sourceId，存储键 `blog:<siteId>:<sourceId>:display:v1` 不含框架 ID；更换来源身份须更换 sourceId。初始化先判断分享参数是否存在：存在且有效则进入分享会话；存在但无效则阻止建立展示配置，不能跳到个人或作者默认。只有分享参数缺席时，才依次采用有效个人 → 作者明确默认 → 选择入口。无主题不擅自选择，选主题形成空选择合法配置后再选文章。

| 分享输入 | 初始视图与保存模式 | 恢复行为 |
| --- | --- | --- |
| 不存在 | 个人/作者/入口；auto，ShareInputState 为 absent | 按普通会话规则编辑 |
| 存在且有效 | 分享配置；origin 为 share、explicit、dirty 为 false；状态 valid | 修改仅内存，显式保存或切换来源退出 |
| 存在但无效，包括空值、重复参数 | configure，无展示配置；origin 为 share、explicit、dirty 为 false；状态 invalid | 显示固定错误原因；用户可采用个人/作者或重置，均保留当前路由；不自动回退 |

无效分享会话也允许用户从选择入口建立合法内存配置，首次合法主题提交形成空选择，后续编辑保持 share/explicit；合法内存配置相对于不存在的基线为 dirty，原无效地址及 ShareInputState.invalid 保留并提示刷新会重新进入恢复入口。saveSharedConfig 仅在已有合法配置时可保存；仅个人写入与地址清理都成功才退出并将 shareInput 置 absent；校验/写入失败保持原配置、保存模式、ShareInputState、地址与个人记录。写入已成功但地址清理失败时按下文 partial 规则报告，不能声称原个人记录未变。采用个人/作者或重置成功也将 shareInput 置 absent。状态报告输入有效性，不将合法的内存草稿误称为原链接已经修复。

普通会话采用 auto：初始加载不写存储，新合法选择才尝试保存；失败仍更新内存并提示。损坏个人记录保留并提示，用作者默认或入口建立内存，只有新合法选择才覆盖。初始读取受限/失败时显示 PersonalReadState.error，仍允许采用合法作者默认或选择入口，不伪装成个人记录不存在、不写入或删除以修复；站点、目录与正文加载不因此中断。没有可用默认或默认非法时进入选择入口并给固定原因，不猜测其他主题。空选择有效，不自动填文章；失效 ID 留错误项。

分享会话采用 explicit：内容/风格修改仅在内存，dirty 按下述配置基线计算，不写个人记录或改 URL；刷新恢复原分享配置。saveSharedConfig 先校验并写入当前配置，再清理分享参数；两步成功才转 personal/auto 并保留路由。校验/写入失败继续 explicit，保留参数和旧记录；写入成功、地址失败为 partial，个人记录已更新，不能按整体失败描述。

use-personal-config 先读取并校验记录：有效则准备个人配置，不存在/损坏则准备选择入口并提示，不隐式换成作者默认；读取抛错时保留当前配置/模式/基线/地址，通过 RecoveryState.error 报错。use-author-default-config 先校验作者默认，无默认允许准备入口；默认非法保持当前会话并报 invalid-author-default，不删除个人记录。两种切换都不写存储，准备成功并清理分享参数成功后才提交新内存配置；地址清理失败保持原会话，通过 RecoveryState 报 url-update-failed。

reset-to-author-default 先校验作者默认（无默认允许进入选择入口），再同步删除当前个人记录，最后清理分享参数并恢复默认或入口。默认非法或删除失败时，保持当前配置、origin、persistence、dirty、saveStatus、路由与分享参数不变，保留旧个人记录，通过 ResetState.error 报错。删除成功但地址清理失败是 ResetState.partial：个人记录已删除，当前内存配置、基线和会话模式仍保留，saveStatus 为 not-saved，PersonalReadState 为 missing；不能声称旧记录仍在或重置已经完整完成。用户可再次执行当前操作或另行选择会话来源。

重置成功后：有作者默认则 origin 为 author-default，无默认则 none；persistence 为 auto，dirty 为 false，saveStatus 为 not-saved，个人记录已不存在。reset 与 use-author-default-config 不将默认值自动保存为个人值。退出分享但保留首页/详情目标；刷新按已确定的初始化优先级处理。单次存储端口失败必须不产生部分写入/删除；存储操作与 URL 更新是两个独立提交点，不能承诺跨两者的原子事务。

宿主通过同步 SessionUrlPort.removeShare(expected: LocationInput): LocationInput 清理分享参数，保留目标及其他查询参数。端口先验证当前地址仍与 expected 一致，再更新历史地址；地址构造和校验须在 History 更新前完成，成功更新后仅返回已准备的 LocationInput，不执行可能抛错的后续步骤；失败抛 UrlUpdateError 且不改 URL。没有分享参数时返回原输入，不调用 History 更新。核心只有取得成功结果才将 ShareInputState 和记录的地址身份置 absent，再提交新来源/模式；内部地址提交沿用第 7 节规则。

saveSharedConfig 写入成功但 URL 清理失败时，SaveState.partial 明确记录 personalRecordSaved: true。当前配置已作为新的保存基线，dirty 为 false、saveStatus 为 saved、PersonalReadState 为 valid；origin/persistence/ShareInputState 保留原分享状态。界面提示“个人配置已保存，分享地址未清理”，刷新仍按原分享链接初始化。reset 的 partial 按上段保留内存而承认记录已删除；不会为恢复“整体原子性”自动回写旧记录，也不会隐式清除 URL。

再次点击同一 save/use-personal/use-author/reset 是新的同步尝试，重新校验当前来源、配置、默认与地址；不执行延迟的旧目标。重复写入同一配置和删除已不存在记录合法。每次会话操作清除其他保存/切换/重置操作结果，完整成功或产生配置语义变化的普通编辑后不保留过期 partial 提示；保留已发生的个人记录效果。分享链接结果仍按配置/路由修订校验。存储/地址失败信息只显示固定错误，不暴露异常堆栈或原始记录。

dirty 只表示当前规范化 DisplayConfig 与会话基线是否存在语义差异，不表示最近保存是否失败。基线为本次初始化/显式切换加载的配置或最近成功保存的配置；无配置的恢复入口以“无配置”为基线。比较忽略对象键顺序，但保留 contentIds 和其他数组顺序，使用共享 JSON 语义比较，不依赖对象引用。A→B→A 恢复 dirty 为 false；无效分享从无配置建立合法草稿为 true。成功保存、成功恢复/重置更新基线并为 false。保存的校验/写入失败保持原基线，dirty 重新按差异计算，失败通过 saveStatus/SaveState 单独表达，不能无条件置 true。 URL 清理失败的保存 partial 已完成写入，基线按上文更新；不能把它当成写入失败。

规范化结果等于当前配置的 set-content/set-theme 是无变化事件：不写存储、不重新读取内容、不增加 configRevision，不清除有效分享结果；可以清除已被合法提交解决的主题校验错误。此规则也适用于作者默认与分享配置，不能通过重复提交相同值把它们标成个人已保存。作者默认和初始分享不能标为已保存个人记录。初期 read/write/remove 与地址端口均为同步注入接口，控制器串行处理各提交点并报告完整/部分结果；未来异步端口需另补提交协议，不能只忽略旧回调。

## 6. 双向适配器与可见状态

```ts
type DisplayEvent =
  | { type: 'set-content'; ids: string[] }
  | { type: 'set-theme'; themeId: string; options: JsonObject }
  | { type: 'retry-item'; id: string }
  | { type: 'retry-bootstrap' }
  | { type: 'retry-site' }
  | { type: 'retry-catalog' }
  | { type: 'retry-catalog-page' }
  | { type: 'load-more-catalog' }
  | { type: 'use-personal-config' }
  | { type: 'use-author-default-config' }
  | { type: 'reset-to-author-default' }
  | { type: 'start-resource'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'detach-resource'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'resource-load-failed'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'resource-loaded'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'retry-resource'; id: string; resourceKey: string; resourceRevision: number };
interface RendererContext {
  dispatch(event: DisplayEvent): void;
  navigateToContent(id: string): void;
  navigateHome(): void;
  reloadCurrentDeployment(): void;
  requestShare(): void;
  saveSharedConfig(): void;
}
interface RendererAdapter {
  frameworkId: string;
  supportedThemeIds: readonly string[];
  mount(container: HTMLElement, model: ViewModel, context: RendererContext): void;
  update(model: ViewModel): void;
  unmount(): void;
}
type BodyErrorCode = 'unsupported-content' | 'unsafe-resource'
  | 'unresolved-resource' | 'invalid-image-description' | 'conversion-failed';
interface BodyError { code: BodyErrorCode; retryable: false; }
interface BodyDiagnostic {
  code: 'raw-html-as-text' | 'unsafe-link-as-text';
  sourcePosition?: { line: number; column: number };
}
type ItemState =
  | { id: string; status: 'loading' }
  | { id: string; status: 'ready'; content: ContentRecord; body: SafeBody;
      sourceDiagnostics: readonly SourceDiagnostic[]; bodyDiagnostics: readonly BodyDiagnostic[];
      resources: readonly RenderedResource[]; resourceStatus: 'idle' | 'loading' | 'ready' | 'degraded' }
  | { id: string; status: 'error'; error: { kind: 'source'; detail: ContentError } }
  | { id: string; status: 'error'; content: ContentRecord;
      error: { kind: 'body'; detail: BodyError }; sourceDiagnostics: readonly SourceDiagnostic[] };
interface ProcessedResource { key: string; url: string; }
interface BodyProcessResult {
  body: SafeBody;
  resources: readonly ProcessedResource[];
  diagnostics: readonly BodyDiagnostic[];
}
type ResourceLoadError =
  | { code: 'load-failed'; retryable: true }
  | { code: 'deployment-changed'; retryable: false };
type ResourceLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: ResourceLoadError };
interface RenderedResource extends ProcessedResource {
  resourceRevision: number;
  attemptRevision: number;
  state: ResourceLoadState;
}
interface CatalogSnapshot {
  items: readonly ContentSummary[];
  diagnostics: readonly SourceDiagnostic[];
}
type PagingState =
  | { status: 'idle'; nextCursor?: string }
  | { status: 'loading'; cursor: string }
  | { status: 'error'; cursor: string; error: ContentError };
type CatalogState =
  | { status: 'loading'; snapshot: CatalogSnapshot; retained: boolean }
  | { status: 'ready'; snapshot: CatalogSnapshot; paging: PagingState }
  | { status: 'error'; snapshot: CatalogSnapshot; retained: boolean; error: ContentError };
type ShareState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; url: string; configRevision: number; routeRevision: number }
  | { status: 'error'; code: 'invalid-config' | 'too-large' | 'source-mismatch' | 'url-unavailable' };
type SaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; configRevision: number }
  | { status: 'partial'; code: 'url-update-failed'; configRevision: number; personalRecordSaved: true }
  | { status: 'error'; code: 'invalid-config' | 'not-share-session' | 'storage-unavailable' | 'storage-write-failed' };
type RouteTarget = { kind: 'home' } | { kind: 'detail'; id: string };
interface NavigationState { target: RouteTarget; routeRevision: number; }
interface NavigationConsumer { setNavigation(target: RouteTarget): void; }
interface LocationInput { target: RouteTarget; search: string; }
interface LocationConsumer { setLocation(input: LocationInput): void; }
interface SessionUrlPort { removeShare(expected: LocationInput): LocationInput; }
type RecoveryState =
  | { status: 'idle' }
  | { status: 'success'; target: 'personal' | 'author'; result: 'loaded' | 'configure' }
  | { status: 'error'; target: 'personal' | 'author';
      code: 'storage-unavailable' | 'storage-read-failed' | 'invalid-author-default' | 'url-update-failed' };
type DeploymentState =
  | { status: 'not-applicable' }
  | { status: 'current'; buildId: string }
  | { status: 'checking'; buildId: string }
  | { status: 'changed'; buildId: string; observedBuildId: string }
  | { status: 'check-failed'; buildId: string };
type ResetState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'partial'; code: 'url-update-failed'; personalRecordRemoved: true }
  | { status: 'error'; code: 'invalid-author-default' | 'storage-unavailable' | 'storage-remove-failed' };
type DeploymentObservation =
  | { kind: 'same'; observedBuildId: string }
  | { kind: 'different'; observedBuildId: string }
  | { kind: 'failed' };
interface DeploymentProbeResult {
  sourceInstanceId: string;
  sessionBuildId: string;
  probeGeneration: number;
  observation: DeploymentObservation;
}
type DeploymentProbeEvent =
  | { phase: 'started'; sourceInstanceId: string; sessionBuildId: string; probeGeneration: number }
  | { phase: 'finished'; result: DeploymentProbeResult };
interface DeploymentProbePort {
  check(signal?: AbortSignal): Promise<DeploymentProbeResult>;
  subscribe(listener: (event: DeploymentProbeEvent) => void): () => void;
  dispose(): void;
}
interface ThemeValidationIssue {
  key: string;
  code: 'required' | 'invalid-value' | 'unknown-option';
}
type SiteState =
  | { status: 'loading' }
  | { status: 'ready'; info: SiteInfo; diagnostics: readonly SourceDiagnostic[] }
  | { status: 'error'; error: ContentError };
type ShareInputState =
  | { status: 'absent' }
  | { status: 'valid' }
  | { status: 'invalid'; code: 'malformed' | 'too-large' | 'source-mismatch' | 'invalid-config' };
interface ViewCommon {
  site: SiteState;
  shareInput: ShareInputState;
  personalRead: PersonalReadState;
  themes: readonly ThemeChoice[];
  navigation: NavigationState;
  deployment: DeploymentState;
  themeValidation: readonly ThemeValidationIssue[];
  configuration: ConfigStatus;
  operations: { share: ShareState; save: SaveState; reset: ResetState; recovery: RecoveryState };
}
interface PageModel {
  revision: number;
  config: DisplayConfig;
  catalog: CatalogState;
  items: ItemState[];
  status: 'loading' | 'ready' | 'partial' | 'empty' | 'error';
  notices: Array<{ code: string }>;
}
type ViewModel = ViewCommon & (
  | { kind: 'bootstrap'; bootstrap: BootstrapState }
  | { kind: 'configure'; catalog: CatalogState; notices: Array<{ code: string }> }
  | { kind: 'page'; page: PageModel }
  | { kind: 'detail'; config: DisplayConfig; item: ItemState; notices: Array<{ code: string }> });
```

实现使用只读快照；SafeBody 是共享处理器生成的不透明、只读安全节点树，原始字符串不能绕过安全链构造。适配器按共享访问协议将安全节点映射到框架元素，不重新解析 Markdown。图片节点通过 resourceKey 关联 ProcessedResource 与 RenderedResource，不能包含绕过 start-resource 的活跃图片 src；新图像节点仅在当前 loading 模型下按对应 URL 建立，ready 状态保留已成功节点，idle/错误用固定提示及作者 alt 展示占位。P4 定义安全节点类型、遍历协议与图片 key 映射，不能用注入含图片 src 的 HTML 字符串提前触发网络。ViewCommon 的字段位于 ViewModel 顶层，不是额外嵌套对象。

适配器只展示并发事件，不请求来源、不写存储、不独立转换正文或序列化分享。控制器校验事件、按保存模式持久化、调度数据并生成模型。set-content 表达选择/取消/重排；set-theme 使用注册表当前版本。非法事件不部分应用，保持配置并提示。

来源尚未初始化时优先显示 bootstrap，不能伪装为 empty/configure 或让适配器等待 Promise 而不挂载。应用壳立即 mount 并显示 BootstrapState；静态启动的 DeploymentState 初始为 checking（factory.identity.expectedBuildId），版本失败为 changed 并记录观察版本，其他启动失败为 check-failed，成功建立运行时为 current。HTTP 始终为 not-applicable。尚未开始站点读取时顶层 SiteState.loading 表示等待来源就绪，bootstrap 使用固定启动文案，不展示假站点字段。启动期间只接受导航与允许的启动恢复操作，不保存内容/主题事件。运行时成功后才进入 configure/page/detail 并启动来源请求；初始存储读失败按第 5 节处理，不能变成启动致命错误。

BootstrapState.error.kind=request 只有 retryable 为 true 才允许 retry-bootstrap，同一在途重复点击合并；版本不一致使用显式 reloadCurrentDeployment，不自动换清单或循环重载。非重试错误显示固定原因与显式重载入口，无法恢复时保持故障，不报告空内容。初始化尝试有独立代号，重试/换源取消旧尝试，卸载后无提交；旧尝试迟到返回运行时时必须释放其探测器，不能开始旧来源读取。

SiteState、ShareInputState 与 PersonalReadState 在所有 ViewModel 顶层可见。站点加载不阻塞内容选择或正文；失败只显示站点错误和允许的 retry-site，不使用文章事实替代站点事实。站点信息缺失时省略对应展示，错误时不伪装成合法空站点；兼容诊断有公开入口。SiteState.error 不改变 PageModel 的正文聚合状态，界面分别显示两者。retry-site 只在当前站点错误可重试时有效；deployment-changed 使用已有更新入口。

来源运行时已就绪且无合法配置为 configure；详情不改变个人选中列表，使用有效主题。无主题先配置，完成后返回原目标。宿主编码导航并调用共享详情加载，不由框架自行解释地址。

空选择为 empty；非空全加载为 loading、正文获取和转换全成功为 ready、全失败且无加载为 error，其余 partial。页面 ready 不代表所有图片已加载，必须检查各 ready 项的 resourceStatus：无图片或全部图片成功为 ready，任何资源错误为 degraded，否则只要存在已启动的加载就为 loading，其余为 idle。未展示/未启动的图片不算加载中；idle 不声称完整文章图片已经加载。摘要卡片未展示正文图片时不显示正文图片的永久加载提示。图片错误不将整个项降级为正文转换错误，保留 SafeBody、元数据和其他正文；界面必须显式显示失败资源状态，不能宣称展示完整。目录独立，不抹掉正文，每个 ID 保留原位置。

mount 一次、后续 update；unmount 释放监听和根节点。宿主按顺序处理适配器事件，mount/update 执行期间产生的事件先排队，调用返回后才发布并应用后续模型，不能递归调用 update 或在 mount 完成前 update。相同模型/保存提示变化不重建已有资源槽位；卸载清理事件不得触发已销毁控制器的模型提交。新框架须注册适配器/主题并通过共同契约，不改内容和核心。

## 7. 异步、分页与操作反馈

选中内容请求关联来源实例、选择修订、ID 与单项请求代号。详情请求独立关联来源实例、routeRevision、详情 ID 与单项请求代号，不能仅使用选择修订，因为详情导航不改变个人选择。消费者分别校验各自范围，即使同一读取被复用，也不能把选中请求结果直接当成当前详情结果。

宿主解析路由后，用 LocationConsumer.setLocation 同时提交目标及原始 location.search（含开头 ?，无查询为空字符串），初始化、popstate、hashchange 与应用导航使用同一路径；共享服务按第 9 节解析分享输入，框架不能另做查询解析。NavigationConsumer.setNavigation 仅是保留当前分享输入的目标命令接口，不能替代浏览器完整地址同步。首页/详情目标变化递增 routeRevision，离开详情取消旧详情订阅，迟到结果不能切换当前视图；相同目标仅改变分享输入不增加 routeRevision。

控制器记录上次地址对应的分享身份：有效输入按 sourceId 与规范化配置的 JSON 语义比较，非法输入按识别出的原始 share 参数序列比较，不存在为独立身份。身份是原地址输入而不是编辑后的内存配置，修改内存草稿不会改变它。目标变化但分享身份相同时保留内存草稿、dirty 和保存模式；无关查询参数变化也不重建配置。同一地址被 popstate/hashchange 重复通知时去重，不重复加载或保存。

浏览器地址中的分享身份改变（包括在相同详情目标从分享 A 到分享 B、有效到非法、存在到缺席）时，按第 5 节初始化规则重新建立配置/基线、ShareInputState 和保存模式，不写个人记录。递增 configRevision 并清除旧分享/保存操作结果；选择变化使旧选中请求失效，无合法配置时释放选中与详情消费实例并显示 configure。主题有效且详情目标仍相同，可复用已校验内容，但只按当前配置呈现。前进/后退恢复的是该地址对应的配置，不自动恢复此前该地址下未保存的草稿。

saveSharedConfig、采用个人/作者和重置成功时的参数移除，是同一控制器操作的内部地址提交：更新已记录的分享身份为 absent 并通知宿主同步当前 URL，不再把该内部移除作为一次外部初始化，避免刚选好的作者配置又被个人优先级覆盖。仅移除参数且保留目标不递增 routeRevision；相关配置/会话变化由 configRevision 隔离。无主题时记录原详情目标，配置完成后仅返回仍有效的目标。

选择/来源改变递增相关代号并尝试取消；来源变化同时使目录和详情范围失效。单项重试更新代号，取消不提示错误，卸载后不提交。换主题复用内容，结果按当前主题构造，不恢复旧主题。retry-item 只允许当前选中/详情且来源错误可重试的项；正文处理错误不做网络重试。

图片资源的运行时状态由控制器单独管理，新绑定为 idle、attemptRevision 为 0，不因纯处理结果中存在图片就宣称正在加载。适配器确实要展示某个图片槽位时提交 start-resource，携带当前 resourceRevision/attemptRevision；仅当前可见消费实例的 idle 状态接受，控制器递增 attemptRevision 并发布 loading。适配器收到新 loading 模型后才建立该尝试的图片节点/监听和 URL，不能先启动再补报。每个消费实例中同一个 resourceKey 只对应一个槽位；重复出现相同 URL 的正文图片使用不同 key。

加载成功为 ready，失败为 error/load-failed。loaded/failed 只在当前 loading 尝试接受，缓存命中也报告完成；每个尝试只接受第一个终态。retry-resource 仅针对当前失败且可重试图片，校验来源/可见消费实例/resourceRevision；递增 attemptRevision 并回 loading，保留 SafeBody 和其他资源状态。适配器按新代号重新创建或加载相同声明 URL，不猜测新路径、不增加破坏签名的参数，不承诺绕过浏览器缓存。重复开始/重试合并，旧尝试结果忽略。

槽位主动退出展示时提交 detach-resource，仅当前非 idle 状态在代号匹配后接受，递增 attemptRevision 并置 idle，使旧节点迟到结果失效。失败占位保留逻辑槽位，不因显示错误占位就 detach 并抹掉错误；按新 attemptRevision 替换节点属于重试，不另发旧槽位的 detach。主题、活动视图或正文重新绑定导致展示实例更换时，控制器分配新 resourceRevision，旧节点的开始/脱离/完成事件全部失效。仅保存状态或不改变展示实例的模型更新保留修订；适配器不得因此反复重建图片。

静态会话在有效失败事件发生时就记录资源 URL，确认 changed 前同 URL 的有效成功事件可移除记录；不能等探测结束才记录而丢掉期间已重新绑定的失败。确认 changed 时合并当前失败 URL 并固定禁止重试集合；普通主题/视图切换、detach 或新 resourceRevision 不清除此集合。相同会话中对已知失败 URL 的 start-resource 直接形成 error/deployment-changed，不发布 loading 或重新建立网络尝试，防止用重新挂载绕过禁止重试规则。已成功的旧快照不自动替换；新来源实例或显式重载才重建集合。HTTP 不采用此静态规则。

网络暂时失败不要求改正文。静态版本已确认改变时，失败资源转为 error/deployment-changed 并禁止普通资源重试，只提供显式更新入口；HTTP 来源不套用静态版本原因。资源请求成功可以恢复 degraded 项；整个正文不因一张图片失败切到原文错误视图。加载提示、失败占位与 alt 来自固定界面文案/作者数据，不能编造图片内容。

站点请求也有独立 sourceInstanceId/requestSeq，初始化每个来源实例读取一次；选择、主题、路由变化不重复请求站点。retry-site 递增请求代号，旧结果忽略；换源立即清除旧站点信息/诊断并加载新来源，卸载使回调无效。站点请求与正文、目录互不覆盖，分享输入错误也不授权显示其他来源的站点信息。

目录有独立代号，正文选择不使分页失效。目录数据为完整 CatalogSnapshot，items 与 diagnostics 一起保留。load-more-catalog 仅在 ready/idle 且有 nextCursor 时有效，相同加载重复点击合并。分页失败保持 ready 和旧 snapshot，paging 为 error，保存失败 cursor；retry-catalog-page 仅在该错误可重试时请求失败 cursor，成功追加条目及该页诊断，末页进入无 nextCursor 的 idle。

retry-catalog 从第一页刷新，清除游标历史并使旧分页失效。刷新中保留旧 CatalogSnapshot，retained 为 true，禁用分页；失败继续保留条目与兼容诊断，并另附本次请求错误，明确数据非最新；成功用新第一页的条目和诊断一起替换。首次无旧数据时 snapshot 两数组为空且 retained 为 false；换源同时清除旧条目和诊断。适配器不得私有缓存诊断。

requestShare/saveSharedConfig 由宿主转发共享服务，结果通过 operations 返回。分享地址描述当前首页或详情目标，以及当前规范化展示配置；捕获来源实例、configRevision 和 routeRevision。配置变化或目标导航使旧分享结果回到 idle，异步结果必须匹配三个范围，不能在 B 页面显示 A 的分享 URL。保存采用第 5 节同步提交顺序，仍校验当前配置，存储成功与地址清理成功分别报告，不能提前宣告整项成功。开始新操作清除旧结果。

分享成功模型提供可复制 URL。地址生成不等于复制成功，复制失败提示并保留手动复制。保存成功状态与 ConfigStatus 一致，不提前显示已保存。

## 8. 正文转换、诊断与真实性

唯一流程：Markdown → 共享解析结构 → 资源解析 → 统一清理 → BodyProcessResult。处理器显式接收 ContentRecord 与 ResourceContext，纯函数成功输出 SafeBody、确定性 ProcessedResource 列表和 BodyDiagnostic，失败输出 BodyError。处理器不能生成运行时资源修订号，不读取时钟、随机数、外部状态或自增计数。相同输入和处理器版本必须产生语义相同结果。两框架共用解析器/选项/映射/白名单，不能从当前地址补齐资源上下文。

资源引用规则：

- assets 的 id 在单篇文章内唯一，使用与内容 ID 相同的字符约束；Markdown 的 asset:<id> 引用严格匹配该篇 assets，不按名称猜测。
- 资源先由引用找到作者声明的 assets.url，再通过 ResourceContext 解析。静态相对资源必须命中 assetsByReference 的显式映射；远程绝对地址直接通过协议校验，HTTP 相对资源以明确 resourceBaseUrl 按标准 URL 规则解析。
- 静态映射以正文/元数据中的原始引用为键，由构建器验证本地路径并生成部署地址；不存在、重复冲突或跨 buildId 映射报错。公开地址来自构建清单，不能由适配器拼接。
- 直接 Markdown 图片必须给出作者的替代文本，装饰性图片必须用 asset:<id> 并在元数据明确 decorative: true。信息性 asset 引用的 Markdown alt 必须与 assets.alt 完全一致；装饰性引用两处必须为空。冲突为 invalid-image-description，不自行选择一个值。
- 普通相对资源引用与 asset:<id> 最终转换为允许的部署/HTTP URL；asset 是内部引用协议，不交给浏览器或作为任意外部协议放行。

控制器在绑定新的正文展示消费实例时分配 resourceRevision，并将纯处理结果包装为 RenderedResource，初始资源为 idle。修订号在同一控制器生命周期内严格递增，不因换源、重试或导航而复用。即使正文/URL 完全相同，主题切换、活动视图/详情目标切换或重新绑定也分配新修订，重新从 idle 建立展示观察；只改变保存/提示状态而不改变展示实例时保留修订。纯处理结果和已校验正文可复用，不因此重新请求文章或执行第二套转换。选中项与详情项各有独立实例，只有当前活动视图的资源实例可启动/提交加载；退出展示使旧实例失效，返回时建立新实例。

ProcessedResource.key 在单个正文内按解析位置/出现次序确定且唯一，不能仅用 URL：同一 URL 的两处图片是两个观察槽位，相同输入仍得到相同 key。每个新运行时实例的 attemptRevision 初始为 0；开始、重试、脱离均按第 7 节由控制器递增，已开始的首个尝试为 1。适配器提交 start-resource/detach-resource/resource-loaded/resource-load-failed，携带当前修订、资源 key 和尝试代号。控制器检查来源、活动消费实例、resourceRevision、key、attemptRevision 及合法前置状态，未知或迟到事件忽略。每次尝试只接受第一个完成事件。修订、活动展示、attempt 状态和 I/O 属于控制器/运行时，不能塞入纯正文转换。

显式下载链接可进行 URL 校验和产物映射，但不列入自动图片加载状态；ProcessedResource/RenderedResource 的本版本列表仅描述需要监听加载的图片。

允许标记转语义元素、显式资源解析、实体编码和视觉换行；禁止生成摘要/标签/作者/日期/阅读时长/封面，禁止改写、重排段落或改变代码。缺失字段省略，不添加匿名作者等替代事实。

原始 HTML 作为文本显示，不执行/编译模板，产生 raw-html-as-text。只允许文章语义元素，移除事件属性和执行能力；链接允许 http/https/mailto 与已解析站内地址，图片允许 http/https 与已解析资源，拒绝 javascript/data。P4 列出并测试完整元素/属性白名单。

不安全链接可保留文字并产生 unsafe-link-as-text，不阻断全文。资源/扩展内容若无法安全表达且导致信息丢失，产生 BodyError，不能静默删除后称完整。BodyDiagnostic 不猜测内容含义，必要时给出源码位置。

正文错误使用 ItemState.body 分支，不伪装 invalid-response。保留获取成功的 title、元数据与原始 ContentRecord，提供显式查看原始 Markdown 的入口，仅转义文本展示，不绕过安全链执行。转换错误无网络重试按钮，需要修正内容或处理器；获取错误按 retryable 重试。运行时图片故障使用独立 ResourceLoadState，不属于 BodyError，不要求作者为暂时网络故障修改正文。

静态相对资源按清单解析，不依当前路由；API 相对资源须提供明确基址，否则 unresolved-resource，不猜测根路径。正文校验比较字段、语义顺序和文字，不比较框架 DOM。

## 9. 路由、分享与 Pages

固定 `#/` 和 `#/content/<编码ID>`，全文不改个人选择。宿主监听 popstate/hashchange 并传完整 LocationInput；程序化 pushState/replaceState 后必须显式同步一次位置，不依赖浏览器自动发出这些事件。内部恢复操作提交地址时沿用第 7 节的去重/内部提交规则。部署根路径统一用于应用/动态导入/目录/正文资源，不硬编码仓库名，API 地址独立。分享路径使用当前 NavigationState.target，不用 contentIds 代替当前详情目标。

静态部署采用会话固定版本，不保留所有历史产物。构建输出稳定 current.json（schemaVersion: 1、buildId、manifestUrl）及版本清单；清单含相同 buildId、独立站点文件的 siteUrl、轻量目录的 catalogUrl、按内容 ID 映射的正文地址和每篇资源映射。应用内置 buildId，SourceRuntimeFactory 启动校验指针/清单/应用版本一致，之后才创建固定清单运行时。正文/资源使用该清单哈希地址，不在会话内静默换清单。

首次启动先按 no-store 读取指针并校验 schema/地址：network、timeout、429/5xx 分别归类为 network/timeout/unavailable，可显式重试；404、非法 JSON/字段/版本/地址为 invalid-response，不伪装为空站点/空目录。有效指针的 buildId 与应用内置值不同为 BootstrapFailure.version，记录两者且只允许显式重载；不能为了启动成功把旧应用绑定新版清单。指针相同再读取清单，清单缺失、非法或 buildId 不一致为 request/invalid-response。其他状态按第 4 节非成功响应分类，非法状态不得进入来源运行时。

清单的 manifest/site/catalog/正文部署地址须来自当前应用的显式公开产物基址并在允许范围内，不由文章 ID 或路由拼接；作者声明的远程资源仍按正文规则处理。合法空目录与空 SiteInfo 文件仍由构建输出，只有读取并校验成功才表示空。成功锁定后 SiteState/CatalogState 按各自请求读取，不要求初始化预取所有正文。

哈希名不保证历史文件永久可用。本策略处理已启动页面在部署更新后的请求，不承诺旧标签页实时更新。已缓存旧内容可继续显示，未缓存文件被新版移除时提示更新，不拼入新版正文。

会话站点/目录文件、正文地址 404 或 ID 查找缺失时，静态数据源探测 current.json（浏览器 no-store，独立探测参数）：
- 不同 buildId：DeploymentState 为 changed，产生 deployment-changed，不能普通请求重试，提供显式更新。
- 相同版本：ID 不在清单才是 not-found；清单已包含但文件缺失为 invalid-response，不误称删除；站点与目录文件由每次构建必定生成，同版本缺失为 invalid-response，不能伪造空信息。
- 探测失败：DeploymentState 为 check-failed，返回 unavailable，可显式重试，不断言版本改变或文章不存在。
- 指针无法保证中间缓存绝对最新，无法确认时保留故障，不猜测并加载新版。

resource-load-failed 只接受当前 key、resourceRevision 和 attemptRevision。先将对应图片标为 ResourceLoadState.error/load-failed，保留 SafeBody 和其他正文，再由共享端口探测静态版本。版本改变给出 changed/更新入口，并将失败图片错误改为 deployment-changed；版本相同或无法确认时保持 load-failed，可显式重试，不暗示作者正文非法。HTTP 远程图片失败不探测静态版本。适配器不直接请求指针。

reloadCurrentDeployment 是显式用户动作：宿主重载应用、清空会话请求和版本缓存，保留个人记录、路由及分享参数；新启动重校验主题与内容，失效 ID 不替换。HTTP 来源状态为 not-applicable。

版本探测由每个静态来源运行时的独立 DeploymentProbePort 执行，数据源缺失检查与资源错误检查共用该实例，核心通过事件接收观察结果。sourceInstanceId 是运行时实例标识，区别于持久化 sourceId；换源（包括切回相同 sourceId）创建新实例。sessionBuildId 在实例内固定，probeGeneration 每次新探测递增。

同一实例/会话版本只保留一个在途探测，多个正文和图片调用 check 合并并共享结果。取消某个调用只取消其等待，不因一个内容取消而终止其他调用；换源或 dispose 则取消底层探测、停止通知并使旧结果失效。服务在开始/完成时发送 DeploymentProbeEvent，控制器记录当前 generation，只有匹配当前 sourceInstanceId、sessionBuildId 和 generation 的完成可提交。订阅解除和来源切换后不得提交回调。

状态转换规则：
- 静态实例初始化后，同版本验证成功为 current；开始有效探测为 checking，失败为 check-failed，确认不同版本为 changed。
- changed 对该实例/会话版本保持，后到的失败、same 或较旧 generation 不能降级；已经 changed 的 check 返回确认结果，不再因普通资源错误启动新探测。
- observedBuildId 只是已观察到的不同版本，不比较 ID 大小，不承诺是全局最新。显式重载或来源实例更换才重建状态。
- HTTP 来源为 not-applicable，旧静态实例结果无效。
- 资源绑定和加载尝试也有各自归属；探测可确认全局版本，但不能把旧资源错误提交给新正文。已确认 changed 时当前失败资源同步标为不可重试的 deployment-changed，已成功的旧快照内容不自动替换。

工作流检查指针、清单、正文和资源属于同一 buildId。构建检查、数据源分类、探测状态机和运行时更新分别采用 T13a/T13b/T13c/T13d 验证，不能在早期阶段声称整组通过。

分享包只含 sourceId 和规范化 DisplayConfig，不含正文、凭据、密钥。只有显式 requestShare 生成 URL，不自动改路由或保存。分享来源必须匹配当前来源，否则 source-mismatch。

分享传输采用 `{ "sourceId": "...", "config": { ...DisplayConfig } }`，顶层只允许 sourceId/config；config.version 承担该版本协议校验。sourceId 非空且精确匹配当前来源，不能忽略大小写或推测别名。读取使用共享运行时校验，拒绝未知字段、非法主题/参数和重复内容 ID，不把不受支持的字段静默去掉再宣称合法。

唯一地址格式为 `<站点绝对基础地址>?share=<载荷>#/` 或 `...#/content/<编码ID>`。share 位于 fragment 前的 query，只允许一个值；fragment 仅携带既定路由。生成器由宿主注入当前部署的绝对 http/https 基础地址，禁止 URL 用户名/密码，基础地址不含 query/fragment，不能复制当前地址里的无关参数、凭据或旧分享值。路径保持根/仓库子路径。来源身份/展示配置由 JSON 载荷携带，详情目标由 fragment 携带。

生成先校验与规范化，序列化 JSON，再按 UTF-8 计数，最后对完整 JSON 使用 encodeURIComponent 编码一次。读取从原始 query 分割参数，再严格百分号/UTF-8 解码一次；不使用将坏编码替换成字符后继续的宽松结果。参数名也严格解码后识别 share，重复 share（含不同编码形式）、空值、坏转义、非法 UTF-8、非法 JSON 均为 ShareInputState.invalid/malformed。此协议不采用加号转空格；生成的加号编码为 %2B，读取不二次解码。详情 ID 独立按路径段编码/解码一次并验证 ID，不将正文、内容标题或 share 值当路由。

上限为生成端规范化 JSON 文本的 UTF-8 8192 字节，包含来源与配置，不按编码后的 URL 长度计。读取端对严格解码后的原始 JSON 文本先计数，超过 8192 则 too-large，之后才解析、校验和规范化；规范化结果也须满足同一输出上限，默认值展开后超限同样为 too-large。不能通过去空白/删字段绕过输入限制。边界 8192 允许。此应用上限不保证外部渠道接受链接。

分享修改仅内存，刷新还原原链接。saveSharedConfig 完整成功才保存并退出分享；写入失败保留 explicit 和旧个人记录，写入后地址失败按第 5 节 partial 报告实际记录更新。普通会话调用返回 not-share-session。采用个人/作者或重置也移除分享参数，保留首页/详情路由。无效分享按第 5 节初始化表进入恢复入口，ShareInputState 提供固定错误码；通过已定义恢复事件或合法配置的显式保存退出，不自动换选择。

CI 验证双框架双主题。默认分支发布须显式框架配置，未配置可检查但不能部署。只上传应用和允许公开的内容，不能上传仓库根目录。工作流配置依赖、产物、github-pages 环境与 pages: write/id-token: write；动作版本实施时按官方支持固定，依赖使用锁文件。

参考：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[发布流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vue 安全](https://vuejs.org/guide/best-practices/security.html)、[React HTML](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)、[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)、[JSON 序列化](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)、[popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)、[hashchange](https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event)、[localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)、[replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState)、[Web Storage 规范](https://html.spec.whatwg.org/multipage/webstorage.html)。

## 10. 完成状态

工程初始化完成：模块、两框架两主题实现，契约/核心/适配器/产物验证通过，工作流配置到位，并交付经检查的写作、静态/API 配置、主题及新框架扩展说明。没有真实 API 可用受控 HTTP 服务验证接口，必须标明真实集成未验证。

线上发布完成：实际 Pages 部署成功，真实地址刷新/资源/分享/恢复验证通过；启用真实 API 时额外验证跨域与错误。不能用未验证备注代替通过条件。

测试夹具不进入生产内容，技术细节可在实施阶段确定，行为变更同步规格、计划与测试。T09a/b 和 T13a/b/c/d 按计划各自前置条件验证；全部子项具备证据后才算整组通过。早期阶段不要求后续 UI 已完成，也不能用早期局部证据替代后续验收。

## 11. 首轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| 公开边界 | 3、9 | T02/T13 |
| 双向交互 | 6、7 | T05/T10/T11 |
| 真实性验证 | 3、8 | T01/T09/T10 |
| 统一正文处理 | 8 | T09/T10 |
| 部分失败/竞态 | 6、7 | T06/T07 |
| API 契约 | 4 | T03/T04 |
| 轻量目录 | 3、4 | T03 |
| 主题协议 | 5、6 | T08/T10/T11 |
| 默认/恢复 | 5、9 | T08/T12 |
| 渲染/路由决策 | 1、9 | T12/T14 |
| 计划/完成标准 | 10、计划各阶段 | 阶段门槛/T14 |

## 12. 第二轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| 响应身份校验 | 4：精确 ID、公开状态和筛选范围 | T03/T04 |
| 分页重试闭合 | 6、7：PagingState/失败页事件 | T03/T07 |
| 主题选择输入 | 5、6：单一注册表和 ViewCommon | T10/T11 |
| 分享保存冲突 | 5、9：origin/auto/explicit | T08/T12 |
| 操作输入输出 | 6、7、9：恢复事件和操作结果 | T08/T12 |
| JSON 参数/大小 | 5、9：往返和字节计数 | T08/T12 |
| 正文错误类型 | 6、8：BodyError/诊断/原文 | T09 |
| 未知字段处理 | 3、4：静态严格/API 可见诊断 | T01/T03/T09 |
| 文档依赖部署 | 10、计划 P6/P7 | P6 文档检查 |

对应表表示规格补齐，不表示实现或验证完成。

## 13. 第三轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| 资源上下文缺失 | 3/4/8：ResourceContext、资源引用和 alt 冲突规则 | T03/T09 |
| 详情与分享导航竞争 | 6/7/9：NavigationState、routeRevision 和请求消费者隔离 | T06/T12 |
| 旧版本资源失效 | 4/6/9：会话 buildId、版本探测与显式更新 | T13/T14 |
| 保留目录丢失诊断 | 6/7：CatalogSnapshot 在所有状态中完整保留 | T07 |
| 重置删除失败 | 5/6：原状态不变、ResetState 和独立会话切换 | T08 |
| 首次必填主题参数 | 5/6：未提交草稿与字段级共享校验 | T05/T10 |

对应表表示规格修订，不表示实现、测试或上线已完成。

## 14. 第四轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| 纯转换与运行时修订冲突 | 6/8：ProcessedResource/BodyProcessResult 与控制器分配资源修订 | T09a/T09b |
| 版本探测竞争与状态降级 | 6/9：探测端口、单次在途、实例/代号和 changed 保持规则 | T13b/T13c/T13d |
| 暂时图片故障不可恢复 | 6/7/9：独立 ResourceLoadState、重试与加载尝试代号 | T09b/T13d |
| 阶段前置与整组验收冲突 | 实施计划：早期共享解析、T09/T13 子项和阶段门槛 | 阶段证据表 |

对应表表示文档问题已补齐，不代表实现、测试或上线完成；实施状态以计划的阶段门槛和子项证据为准。

## 15. 第五轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| 站点信息无来源到视图的通道 | 3/4/6/7/9：SiteInfo、getSite、SiteState、独立请求及版本化站点文件 | T01/T03/T06/T10/T13 |
| 无效分享初始化与恢复冲突 | 5/6/9：初始化分支、ShareInputState、内存草稿和显式退出 | T08/T10/T12 |
| 分享地址协议不完整 | 9：唯一 query/fragment 布局、严格一次编解码、输入和输出字节限制 | T12/T14 |

对应表表示文档修订；代码、测试和上线状态仍以计划中的实际证据为准。

## 16. 第六轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| dirty 与无变化提交规则冲突 | 5：规范化配置的语义基线、A→B→A、保存失败与无变化事件 | T05/T08/T12 |
| 查询变化未进入导航接口 | 6/7/9：LocationInput/LocationConsumer、分享身份、外部地址同步与内部提交 | T06/T08/T12/T14 |
| 未展示图片及节点重建缺少生命周期 | 6/7/8：idle、开始/脱离事件、活动消费实例和每处图片唯一 key | T09a/T09b/T10/T13c |

本节只记录文档修订；实现与验证继续按计划门槛交付。

## 17. 第七轮审查对应表

| 问题 | 修订位置 | 验证 |
| --- | --- | --- |
| 首次版本校验失败没有视图/恢复路径 | 4/6/9：来源工厂、BootstrapState、重试/重载、目录地址与迟到初始化隔离 | T04/T06/T10/T13b/c/d |
| 个人记录读取异常未定义 | 5/6：同步存储端口、PersonalReadState、惰性访问、初始化降级与 RecoveryState | T08/T10/T12 |
| 存储与分享地址清理被误称为原子操作 | 5/6/7/9：SessionUrlPort、提交顺序、SaveState/ResetState.partial 及重新执行 | T08/T10/T12/T14 |

文档修订不表示这些恢复路径已实现；各项仍须阶段证据。

## 18. 实施选择与本地证据

实施采用 npm 工作区、Node 24、TypeScript/Vite、严格 JSON frontmatter 及 unified/remark-parse/remark-gfm 唯一正文链。实际版本、文件和验收结果见 [execution.md](../plans/execution.md)。P0–P6 完成不代表真实 Pages 发布或真实 API 集成完成。

SafeBody 的安全标签白名单为 p/h1–h6/em/strong/del/a/pre/code/br/hr/blockquote/ul/ol/li/table/thead/tbody/tr/th/td/input/sup/section；属性限于 href/title/start/checked/disabled/type/align/id。图片是独立资源 key 节点，没有活跃 src。脚注 ID 含文章 ID；文内锚点定位/焦点操作不改哈希路由，非法路由提供错误恢复入口。两个渲染器不使用原始 HTML 注入。

应用配置位于 blog.config.json，内容/配置字段和可运行命令分别见 [writing.md](../writing.md)、[configuration.md](../configuration.md)、[usage.md](../usage.md)。缺失真实内容仍可交付合法空目录/站点，不添加示例事实。开发启动或构建时自动校验/生成内容，编辑内容后重启开发命令；没有承诺内容文件的热更新。

分享协议只校验严格解码后识别出的 share 参数；无法解码成 share 的其他参数不参与协议，地址恢复保留其原始形式。已识别 share 的坏值、重复值、非法配置和超限值仍拒绝。构建 buildId 覆盖公开站点、已发布正文与被引用的资源；应用与清单嵌入同一值。

implementation-02 补充主题描述的强制类型校验、默认值一致性及已提交主题到表单草稿的同步规则。回归用例先复现失败，再验证修复；具体证据见执行记录。

implementation-03 补充 static/http 构建隔离，并验证真实跨域 API 到两个框架页面的完整链。HTTP 资源基址优先级必须为 config/response 字符串，不能转换错误类型；直接构造来源与应用 JSON 配置均校验，空资源基址拒绝。受控 API 的浏览器验证覆盖分页、事实字段缺失、未知字段路径诊断、资源优先级、凭据省略、分享/刷新、站点独立失败、授权/暂不可用、CORS 故障及错误身份/draft 拒绝。不将本机接口验证记作真实后端集成。

implementation-04 补强扩展包语法树边界检查及全注册表身份/版本校验。用户已明确选择 Vue 作为 Pages 发布目标，选择写入工作流；可选有效仓库变量可显式覆盖。构建作业具备 Pages 元数据读取权限，默认分支工作流不取消正在执行的部署，PR/其他分支仍可取消旧验证。actionlint 本地检查与真实 Actions/Pages 执行分别记录。

implementation-05 明确通用主题表单与共享 JSON 描述一致：required 表示字段存在，不要求布尔值为 true 或字符串非空；枚举通过完整 JSON 值匹配，null 与未填写分别表示；首次没有默认值时显示未选择，不自动提交第一项。数字允许有限小数，清空数字或取消可选枚举选择从草稿移除该字段，再由共享规范化执行显式视觉默认或 required 校验，不生成 NaN。字段错误来自共享控制器，合法 false/null/空字符串可以提交。测试专用主题只用于独立浏览器入口，不进入生产注册表或内容。

首次真实发布的 configure-pages GET 返回 404；工作流默认只读取已启用站点，不能将来源下拉框的用户确认当作 API 已创建站点的证据。补充显式 PAGES_SETUP_TOKEN 接口：仅配置该 Actions secret 时，固定版本的官方 action 使用额外凭据尝试 enablement；普通 GITHUB_TOKEN 不承担首次创建。创建凭据需要此仓库的 Pages/write 与 Administration/write，创建完成可删除。失败输出操作摘要并保持作业失败，不猜平台路径、不上传不完整输出，不更改仓库可见性或方案。默认构建/部署权限维持原范围；真实设置、套餐和凭据可用性仍按平台证据核对。
