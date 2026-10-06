# 静态与 API 配置

`blog.config.json` 是公开应用配置，会随前端编译；不要加入密钥。`siteId` 标识个人配置空间，`sourceId` 标识内容来源，更换来源身份时使用不同值。存储键为 `blog:<编码siteId>:<编码sourceId>:display:v1`，两个身份分别 encodeURIComponent，避免冒号造成命名空间碰撞；不包含框架，所以 Vue/React 使用相同配置协议。常见 ASCII 身份的键不变；需要编码的身份使用新键，旧记录保留，不自动读取有歧义的旧键，需重新选择或显式保存。

仓库当前配置：

```json
{
  "schemaVersion": 1,
  "siteId": "blog",
  "source": { "kind": "static", "sourceId": "public-content" },
  "basePath": "/"
}
```

`basePath` 必须以 `/` 开头和结尾；根为 `/`，仓库项目为 `/Blog/`。非 ASCII 和空格使用 UTF-8 百分号编码，例如 `/%E5%8D%9A%E5%AE%A2/`；编码后的斜杠、反斜杠、控制字符、点段、空段和会被 URL 重写的路径拒绝。构建环境 `BLOG_BASE_PATH` 可覆盖它，Pages 工作流使用平台输出自动设置。`BLOG_FRAMEWORK` 仅在未显式传入构建参数时决定发布应用，合法值 `vue`/`react`。

GitHub Pages 工作流已记录本项目明确选择的 Vue；未设置仓库变量时按此选择构建。可选 Actions 变量 BLOG_FRAMEWORK 可覆盖它，非空无效值令构建失败。本地裸 `npm run build` 仍需提供参数或 BLOG_FRAMEWORK，不从工作流文件猜测选择。

可选 `authorDefault` 是完整 DisplayConfig，不能省略版本或编造文章 ID：

```json
{
  "version": 1,
  "contentIds": [],
  "themeId": "minimal-list",
  "themeVersion": 1,
  "themeOptions": { "density": "comfortable", "showTags": true }
}
```

只有作者明确填写时才采用默认。初始配置不自动保存成个人记录。空 `contentIds` 表示明确空选择，未知 ID 保留错误位置，不替换为其他文章。

程序化控制器在创建时复制作者默认、主题注册、来源身份及标量选项，后续修改调用者对象不改变该实例的恢复结果或存储键。作者默认先验证 JSON，非法访问器不执行，非法默认仍报告 invalid-author-default；不冻结调用者数据。更改作者默认/注册应创建新控制器，更改来源通过 changeSource，并在调用时捕获新身份。回调及端口内部行为仍由宿主负责，详见 [扩展约束](extensions.md)。

两内置主题的 themeOptions 还接受配色、字体、字号、阅读宽度、文字间距、对齐及隐藏元信息，完整字段见 [阅读设置](specs/reading-preferences.md)。新字段可选，旧配置不需要迁移；选择“使用默认”删除新枚举字段，显示恢复其默认外观。新增选项即时更新，普通会话自动保存，分享会话保持显式保存规则；分享携带已选视觉参数，不改变内容数据。

## 接入独立后端

将 source 改为以下结构；地址是配置格式示例，不代表存在真实 API：

```json
{
  "kind": "http",
  "sourceId": "my-backend",
  "baseUrl": "https://api.example.com/blog/",
  "resourceBaseUrl": "https://api.example.com/assets/",
  "resourceBasePriority": "config",
  "timeoutMs": 15000
}
```

请求默认为 `GET site`、`GET contents?limit=20&cursor=...`、`GET contents/:编码ID`，以 baseUrl 为基址。筛选使用重复 `ids` 参数，与分页参数互斥。末页省略 nextCursor。端点映射通过 `HttpSourceOptions.endpoints` 注入，可适配既有服务。

端点解析后的最终地址必须是绝对 HTTP(S) URL，且不含 URL 账号密码。公共 requestJson 在传输前校验，data/file/ftp 等地址或 URL 凭据返回 invalid-response，不发起请求；绝对端点替换基址也遵守此约束。请求授权继续通过 requestPolicy 注入。

API baseUrl 是绝对 HTTP/HTTPS 目录地址，不接受 query/fragment，包括单独的 `?` 或 `#`；缺少末尾 `/` 时按 URL 的路径补齐，不对原始字符串拼接。具体端点的参数通过 endpoints 提供，授权通过 requestPolicy 提供，不能依赖基础地址中会被相对 URL 解析丢弃的参数。分页 limit 仅缺省/undefined 时使用 20，显式 null 不是有效数字。

程序化静态工厂及独立 DeploymentProbe 使用相同的 directoryUrl 规则；缺少尾斜杠不会误访问域名根目录。静态工厂在发出请求前拒绝非法基址并返回 request/invalid-response；独立探测器构造时拒绝非法配置。

```json
{ "schemaVersion": 1, "site": { "schemaVersion": 1 } }
```

```json
{ "schemaVersion": 1, "items": [], "nextCursor": "opaque-next-cursor" }
```

无下一页时省略游标，不能用空字符串。详情为 `{ "schemaVersion": 1, "item": ContentRecord }`，ContentRecord 包含显式 ID、发布状态、标题和 `{ "format": "markdown", "value": "作者原文" }` 正文。返回请求 A 以外的 ID 或 draft 会失败；404 不被当作合法空站点。

详情包络可带 `resourceBaseUrl`。如果配置和响应同时提供不同基址，必须声明 `resourceBasePriority: "config"` 或 `"response"`。没有基址时只允许绝对资源，不由详情端点或页面地址猜测。

resourceBasePriority 必须是上述字符串本身，数组或其他类型不会转换成有效优先级；应用 JSON 配置和直接构造 HttpContentSource 使用同样的规则。明确提供的 resourceBaseUrl 不能是空字符串。

已知字段严格校验；额外 API 字段不进入模型，诊断只展示字段路径。401/403 表示授权错误，429/5xx 表示暂不可用，网络/CORS 统一 network，默认超时 15 秒，允许 1–120 秒。不会自动换数据源、重试或用旧响应伪装成功。

请求超时覆盖响应头和 JSON 正文读取阶段；已收到 200 响应头、正文仍未传完时，计时器继续生效。调用者取消返回 AbortError，不作为内容错误展示；超时返回可重试的 timeout，重试由用户显式发起。公共请求层在收到响应和解析完成后复核取消/超时状态，避免可注入适配器在收到取消信号后仍完成解析、把迟到响应返回为成功。适配器仍应遵守传入的 AbortSignal，及时中断网络和正文读取；成功边界校验不替代适配器对永不结束的请求进行取消。

非成功 HTTP 状态，以及取消后才到达的响应，如果正文尚未读取，会在请求结束时取消正文流，释放持续响应占用的连接。清理不改变 not-found/unauthorized 等固定错误，也不等待自定义传输的清理完成；适配器仍负责遵守取消契约。

默认 `credentials: omit`。后端配置 CORS 并负责身份鉴权、公开状态和授权。宿主代码可注入 `requestPolicy` 返回短期请求策略；不要将凭据写入内容、分享载荷、配置或日志。此接口不实现登录或后端部署。

## 内部工具环境

`BLOG_CONFIG` 可指定另一份应用配置；`BLOG_CONTENT_DIR` 可指定内容目录；`BLOG_OUTPUT_DIR` 可指定构建输出。后两者用于隔离测试，发布默认保持 `content/` 和选定的 `dist/<framework>/`。static 来源先校验内容，再替换输出；http 来源忽略 BLOG_CONTENT_DIR，只构建前端，不生成 current.json、静态清单、站点、目录、正文或本地资源。切换到 HTTP 后，输出整体替换，不保留旧静态内容。不把测试变量配置进发布工作流。

static 内容根目录必须存在且为目录，不存在报 invalid-content-directory，不能把拼错的路径当成空博客；存在的空目录仍合法，site.json/posts 保持可选。内容/输出目录不能相同或互为祖先、后代；按真实路径检查，包括符号链接别名。CLI 的最终输出也不能覆盖应用、包、脚本、测试、文档、默认内容、版本库、依赖或配置文件，失败报 source-output-overlap。HTTP 不解析本地文章，但同样保护项目输入。正常 dist 或独立临时/外部输出仍受支持。

内容暂存的创建、写入和提交都在 finally 清理范围内；写入失败保留原有效产物，不遗留半份 stage。输出保护和失败注入证据见 [完整性审查](specs/integrity-audit.md)。

`BLOG_DEV_PORT` 仅用于 dev，必须是 1–65535 的十进制整数，默认 Vue/React 为 5173/5174，端口冲突直接失败。每次启动分别创建 `.generated/dev-<框架>-<端口>-<UUID>/`，其中 public 为该进程的内容，vite-cache 为其依赖优化缓存。即使同一框架再次占用同一端口，失败的新进程也不会覆盖正在运行实例的目录。启动失败时关闭已创建的 Vite 服务并清理自己的目录；正常 SIGINT/SIGTERM 退出先关闭服务再清理，重复信号等待同一关闭任务。依赖缓存不跨启动复用；dev 的 `--force` 只作用于当前实例的优化器。浏览器回归使用 4312/4313/4314，不占用手动开发入口。上述缓存不进入生产产物，构建忽略未使用的开发端口设置。

生产构建为每次调用生成独立 `.generated/build-<框架>-<UUID>/`，其中 public 为已校验内容快照，vite-cache 为该次构建缓存。构建成功或失败后清理该目录；Vite 输出暂存目录也在退出时清理，替换失败仍按既有规则恢复原输出。并发构建不同内容时，为每次调用设置不同的 `BLOG_OUTPUT_DIR`，各自产物的指针、目录、正文与应用内嵌 buildId 必须一致；写入同一个最终输出目录的构建应串行执行。开发中的内容与缓存不参与生产快照，也不会被生产构建覆盖。

开发目录清理也注册到锁定版本 Vite 的 closeServer 挂钩，仅在 reason/close 时执行，reason/restart 时保留当前实例。挂钩在服务停止后被等待，避免 Vite 内置 SIGTERM 或 stdin 关闭直接退出、抢先中断外层清理。四项进程测试接受正常退出码或对应信号惯用退出码，验收依据是端口关闭、目录删除，不把惯用退出码当作应用错误。

SIGINT/SIGTERM 处理器在关闭期间仍保持注册，重复信号等待同一关闭任务，不能让第二次信号转成默认进程终止。两个额外进程回归覆盖重复 SIGTERM。浏览器开发夹具在关闭时等待子进程的 close 事件后才退出，避免退出回调重复杀进程，或测试运行器终止进程组时中断子进程目录清理。

Playwright webServer 显式配置 gracefulShutdown/SIGTERM、10000 毫秒宽限时间；本机与 Linux CI 按该流程先关闭服务及子进程，再完成目录清理。默认未配置时测试运行器直接 SIGKILL 进程组，无法执行关闭挂钩；宽限超时仍可强制结束，因此最终验收另核对实例目录和端口，不能只依据浏览器用例通过。

本地跨域浏览器证据见 `tests/browser/http.spec.ts`，夹具服务见 `tests/http-browser-fixtures.ts`。受控服务演示接口契约及错误恢复，生产后端需独立提供。

静态来源中，current.json 的 manifestUrl、清单中的站点/目录/正文与本地资源映射都必须属于对应的 `content/<encodeURIComponent(buildId)>/`。生产构建已经采用此格式；手工生成的清单需要遵守相同约束，不再允许无版本目录或跨版本引用。buildId 须为合法单段 ID，生产仍使用 SHA-256；非法工厂配置在任何网络请求前拒绝。目录是校验边界，实际文件名继续取自显式清单。地址拒绝查询/片段（含空分隔符）、反斜杠、控制字符、坏 URI 编码及编码分隔符；合法 URI 文件名可使用。HTTP 作者远程图片和显式 API 资源基址不套用这个静态版本规则。

应用配置、个人记录、分享载荷和内容响应都不接受重复 JSON 字段，即使值相同；转义后同名键按重复处理。应用配置失败直接报错，个人记录不被重写或删除，分享标为 malformed，网络响应标为 invalid-response。作者输入由共享 parseJson 校验；输出继续使用标准 JSON 序列化。

分享绝对基址不能含查询或片段分隔符，包括空的 ?/#；不能生成第二个查询开始符或在片段之后追加 share。API 自定义目录端点中的 ids/cursor/limit 属于协议参数，由每次 ContentQuery 完整替换；其他固定参数保持。返回超过本次 limit 的响应失败，不截断或忽略超出条目。

已有输出目标必须是目录；普通文件或其他非目录节点报 invalid-output-directory，不通过原子替换删除该文件。buildContent 与 CLI 都在任何暂存写入前检查；源/输出重叠仍优先报 source-output-overlap。不存在的目标目录和已有合法目录继续支持，外部并发修改路径不在此检查保证内。

本地文本配置采用严格 UTF-8，非法字节直接失败。HTTP 正文读取原始字节后也严格解码，非法响应不生成替换字符；合法网络 JSON 前导 BOM 保持兼容。来源配置在对象创建时固定，编辑原对象不会改变既有来源；需要切换时新建工厂。请求超时仅 undefined 采用默认 15000ms，其他值必须是 1000–120000 的整数，null 不表示默认。
