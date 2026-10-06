# 扩展主题与框架

共享契约在 `packages/contracts/`，数据源在 `content-source/`，配置/请求状态与唯一正文处理链在 `render-core/`。Vue/React 适配器只接收只读 ViewModel 和标准 RendererContext，事件交给控制器；不能直接请求 API、写 localStorage、解析分享参数或另建 Markdown 解析链。

## 主题

注册源为 `packages/theme-contracts/src/index.ts`。每项明确 id、version、frameworkIds、选项描述、默认视觉值与验证器。现有 minimal-list/card-grid 共用 26 个展示参数，分八组、24 个枚举和两个布尔开关，见 [当前参数目录](specs/expanded-reading-controls.md) 与 [首轮依据](specs/reading-preferences.md)；主题不生成摘要、图片或其他事实。新字段可选，themeVersion 保持 1，旧配置仍有效。

选项描述的可选 group 提供非空分组名，choiceLabels 提供与 choices 等长的非空显示名称，且只用于枚举；两项在注册阶段校验。标签不改变 JSON 值。旧描述没有 group 时进入“风格参数”，没有 choiceLabels 时按原 JSON 显示。两内置主题之间切换保留共同阅读偏好；扩展主题仍按新描述初始化，不能带入不匹配参数。

注册表中的主题 ID 必须唯一，包括分别声明给不同框架的同名项；跨框架支持放在同一个 frameworkIds 数组中，共用版本和描述。ID/标签、正安全整数版本、非空且无重复的框架数组、选项 kind/required 和默认值均在生成主题目录、规范化配置和核对适配器时检查。非法注册不能靠列表顺序或当前框架被隐藏。

增加主题时先定义选项描述与校验，再在支持的适配器中实现相同字段/全文/事件语义，并更新 `supportedThemeIds`。宿主检查缺失/多余实现；不支持的框架会得到不可用主题，不能静默回退。初期表单自动根据描述生成 string/number/boolean/enum 控件。

主题、枚举和布尔选择项变化立即提交共享主题事件；默认参数完整的主题首次选择即可建立空内容选择。缺少必填参数或存在无效值时保留原配置和记录，显示共享校验错误，完成后的合法事件即时生效。文本/数字输入仍可保留草稿并手动提交。清除自动选择项时采用明确默认，否则保留字段缺失并校验；不猜测事实字段。

required 表示 JSON 字段必须存在：false、枚举中的 null 和空字符串均可以是合法已填写值，不能用 HTML required 强迫勾选或非空。控件使用 aria-required 描述要求，提交后由共享校验器显示字段错误。缺失的必填枚举显示“请选择”，可选枚举显示“使用默认”，不代选第一项；选项按完整 JSON 往返，null 不当作缺失。数字支持有限小数；清空数字会移除草稿字段；清空自动提交的枚举选择时，有明确默认立即恢复，没有默认则移除字段并校验，保持合法缺失或返回 required 错误。

共享层始终按选项描述严格检查类型和 enum choices，自定义 validate 只增加约束，不能用隐式转换放宽字段类型。描述的 defaultValue 与注册项 defaults 使用同一合并规则；同字段两处声明必须语义相等。未知默认字段、无效类型、重复选项键或没有 choices 的 enum 会报注册错误，不能让表单和规范化配置各用一套默认值。

validate 接收独立且深度冻结的选项快照，只能读取并返回错误，不能修改值作为隐式转换。规范化结果不共享输入或 defaults 的嵌套对象；choices 返回的描述、枚举与默认值也不共享注册对象。显式迁移仍使用声明的 migration，之后重新校验，不能借验证器绕过。

选项键按合法 ID 校验，constructor、toString、__proto__ 等名称仍可作为普通 JSON 字段。表单只读取选项对象的自有字段，缺失键不能从 Object.prototype 取得值；未声明默认、用户也未填写时保持未填写。草稿写入创建可枚举的自有数据属性，不能通过 __proto__ 的继承 setter 改变对象原型；删除可选字段后重新按缺失处理。对象、字符串和 null 枚举按同一 JSON 规则提交、保存及刷新恢复，不因字段名被忽略或改写。

适配器应比较已提交主题的 id/version/options：语义变化或配置清除时重置本地表单草稿，同主题仅改参数也要同步；普通内容选择、详情导航及提示更新保留未提交参数。比较忽略对象键顺序，保留数组顺序。重置表单不派发 set-theme，也不写个人配置。

每个挂载实例同步保存最新模型、主题草稿与待提交内容 ID；事件读取最新状态，不能依赖上一次渲染闭包或延后的 effect。连续设置、勾选、移除和排序应按发生顺序合并，正文仍只展示控制器验证后的模型。提交后的主题与内容分别清理对应草稿，旧实例回调不能修改新实例。切换主题时默认值和保留值独立深拷贝，共同字段须匹配目标描述的类型和枚举选择。

enum choices 不允许语义重复，包括键顺序不同的等值对象。恢复枚举按 JSON 语义匹配声明的选择项作为控件值，不能因对象键顺序不同显示未选，也不能重写原配置。

选项必须是有限、可无损往返的 JSON。迁移按旧 themeVersion 显式注册，只执行映射的自有函数项，不读取原型上的版本。一次迁移必须达到当前版本；输入独立克隆，结果再次校验，重复结果应相同。没有迁移的旧记录保留，要求重新配置。

控制器创建时保存作者默认、注册描述/默认/框架列表/迁移映射和来源身份的独立快照；仅冻结内部数据，不冻结调用者对象。作者默认先检查 JSON 再复制，非法访问器不执行。内置注册模板只读；验证器、迁移及端口回调仍可调用，闭包内部状态不属于数据快照。来源切换在调用时捕获身份，包括通知期间排队的切换。修改作者默认或注册须创建新控制器；具体证据见 [展示状态与配置审查](specs/presentation-reliability-audit.md)。

## 新框架

新增独立 `packages/renderer-<name>/`，只依赖 contracts/theme-contracts 与自身框架。实现 `RendererAdapter` 的 `frameworkId`、`supportedThemeIds`、`mount`、`update`、`unmount`。在主题注册表声明该框架支持的实现，再添加应用入口与构建工具的允许列表。内容、数据源和控制器无需改变。

通过宿主 `mountBlog` 注入路由、存储、来源工厂与事件能力。新框架须按同一语义通过内容事实、排序、主题参数、配置恢复、卸载与资源事件测试；不要求 DOM 或像素与现有框架相同。`check:boundaries` 自动发现 renderer-<name> 包并应用只允许 contracts/theme-contracts 的共享包依赖规则；其他新增共享包须明确声明依赖政策。

边界检查使用已锁定的 @babel/parser 解析 TypeScript/JSX，遍历实际导入、再导出、动态导入、require、类型导入与 import-equals；计算出的动态模块名拒绝。覆盖 TS/TSX/MTS/CTS、JS/JSX/MJS/CJS，以及 Vue/Svelte 文件的脚本块；检查运行时、peer 和 optional 依赖，禁止相对/绝对路径逃离包源码目录。注释及字符串中的框架名或浏览器对象名不会被当成依赖或全局访问。语法支持见 [Babel parser 官方文档](https://babeljs.io/docs/babel-parser)。新增框架的编译器、组件语法和应用入口仍须单独接入，不因源码边界检查通过就算渲染实现完成。

安全正文 `SafeBody.nodes` 是只读树。节点仅有 text、element、image；element 的标签及属性白名单见 SafeTag/SafeNode，禁止字符串 HTML 注入。image 仅含 resourceKey、作者 alt/title，不带可绕过加载协议的 src。

SafeBody.structure 提供共享解析链生成的原文章节、源位置和标签依据。适配器派发 set-reader，从 ViewModel.reader 展示统一标签/计数/状态，从 ready 条目的 reading.nodeIndexes 选择原节点；matched 显示片段及原文上下文，full 显示全部节点。保留作者文字、图片加载协议和脚注 ID，匹配说明放在正文之外。新框架不得另建解析或匹配规则，详见 [阅读标签契约](specs/reader-profile-matching.md)。

图片首次展示先发 start-resource，收到 loading 模型后才按 RenderedResource.url 建立图片节点；加载/失败带 resourceRevision 和 attemptRevision，缓存完成也要报告。仅保存提示变化保留节点，主动退出发 detach；失败占位保留槽位。重试同一个 URL，不能添加签名破坏参数。旧修订/尝试的事件会被忽略。

图片可能作为作者链接的子节点。重试控件须阻止默认链接导航及点击冒泡，再派发 retry-resource，不能因恢复图片而打开父链接、退出详情或移动锚点；恢复后的图片和链接仍保留作者目标。

脚注和普通文内锚点由适配器在当前正文内定位、移动焦点，不改哈希路由；`#/content/...` 继续交给宿主导航。脚注 ID 的文章身份和脚注名分别编码，内部连字符使用 %2D，避免组成部分与分隔符碰撞。适配器使用 SafeBody 提供的完整 ID/href，不自行重建。非法路由使用固定错误入口，不伪装成首页。

## 数据源与测试

自定义来源实现 ContentSource 和 SourceRuntimeFactory，明确 sourceId/运行时实例身份。请求结果须已验证公开状态、精确 ID 和 ResourceContext。静态来源另外实现 DeploymentProbePort，共用探测、独立等待取消和 sticky changed 行为。来源工厂在应用壳之后初始化；取消/卸载后迟到运行时释放。

内容标签/资源、请求 ID、目录条目及 frameworkIds 都须逐个位置校验，稀疏数组缺项不能被 map/forEach 跳过而当成成功。静态目录的 ID 集合须与本次清单一致，不缓存缺项目录；HTTP 页仍遵循分页契约。静态工厂与独立探测器的目录基址规则见 [配置文档](configuration.md)。

宿主调用 BlogController.changeSource 时先校验新 sourceId；若处于分享输入中，须先由 SessionUrlPort 成功移除分享参数，才释放旧运行时。失败同步抛 UrlUpdateError，原模型与请求保留，新工厂不启动。成功后保留路由目标及无关查询，清空旧来源的配置、校验、目录及探测状态，按新来源存储键初始化；不写入或删除个人记录。start 前切换只准备来源，不提前初始化。

控制器发布模型期间，订阅者调用 dispatch、setLocation/setNavigation、changeSource、requestShare 或 saveSharedConfig 会按调用顺序排入微任务，在当前通知完成后执行；setLocation 和排队的 dispatch 保存输入快照。常规调用仍立即执行，来源切换的地址提交失败仍同步报错。destroy 始终立即生效：取消请求、清空订阅，并使尚未启动的初始化、站点、目录及正文读取停止。所有请求使用本次捕获的运行时与 AbortController，在通知之后、传输之前再次复核有效性；订阅者不会因嵌套导航看到新模型后又看到旧模型。订阅回调应及时返回；自定义来源仍须尊重取消信号。

静态扩展的指针、清单及本地资源地址必须遵守相同版本目录，具体规则见 [设计规格](specs/design.md)。对 malformed 指针的探测只报告失败，不将错配地址当作已确认部署更新；修正后的显式探测仍能成功。

公共 requestJson 在传输前检查最终 URL，只允许不含账号密码的绝对 HTTP(S) 地址；非法地址返回 invalid-response，不能到达 fetch 或注入传输。会释放非成功状态或取消后迟到响应的未读正文；保留原请求错误，不等待自定义清理。可注入传输仍须遵守 AbortSignal，不能保证强制终止忽略取消且永不完成的实现。API baseUrl 的目录规则与部署 basePath 的编码规则见 [配置文档](configuration.md)。

requestJson 从 Response.arrayBuffer() 读取原始字节，严格 UTF-8 解码后由共享 parseJson 检查语法和重复字段；不依赖 Response.text/json 的替换或覆盖行为。注入 FetchPort 应返回可读取原始字节的 Response，超时/取消覆盖正文读取全过程。合法网络 JSON 的单个前导 BOM 兼容，字符串内部 BOM 及作者明确的 U+FFFD 保持；非法字节为 invalid-response。仅覆写 text/json 返回预处理值的桩不代表原始传输；序列化稀疏数组的 null 条目仍拒绝。无歧义未知字段继续生成独立诊断，任意重复字段使原响应失败。

目录端点可含固定查询参数；ids/cursor/limit 保留给本次 ContentQuery，旧值在每次请求清除，其他参数保留。返回页不能超过本次 limit，也不能通过截断响应假装成功。两个来源的空 ids 快路径仍须遵守已经取消的 AbortSignal。

当前测试中的 custom 框架主题注册、宿主桩与来源桩示范扩展边界，未将新框架耦合到核心。受控 HTTP 与 Chromium 场景位于 `tests/`，测试夹具由测试生成，不提交到生产内容。

`tests/theme-form-fixture/` 通过真实 Vue/React 适配器和共享控制器验证扩展选项的表单、提交、存储与刷新；`tests/browser/theme-form.spec.ts` 验证 false/null/空字符串、小数、必填缺失、可选清除及与对象原型同名的合法字段，合计十二项浏览器场景（含两项即时必填参数保护和两项对象键顺序恢复）。共享契约另验证自有值、显式默认及 JSON 往返。该入口由浏览器测试服务单独构建，与 `apps/` 的生产入口和主题注册表隔离。

内置 HTTP 来源、HTTP/static 工厂及探测器保存创建时选项快照；HTTP 端点对象独立复制，工厂 identity 冻结。修改调用者原对象不能改变已有来源的 sourceId、版本、端点、资源基址、超时或传输配置。新配置需创建新工厂并通过 changeSource 切换。回调函数仍按声明调用，其外部闭包状态不在快照范围内；调用者对象不被深度冻结。

通知内排队的 dispatch 若含不可克隆输入，捕获快照失败并按顺序反馈现有主题/选择校验错误，保留配置；不能让 DataCloneError 打断初始化。合法事件仍保存提交快照。公共请求、HTTP 来源及独立探测器使用同一超时规则，仅 undefined 默认 15000ms，null 和范围外值在传输前拒绝。
