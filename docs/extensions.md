# 扩展主题与框架

共享契约在 `packages/contracts/`，数据源在 `content-source/`，配置/请求状态与唯一正文处理链在 `render-core/`。Vue/React 适配器只接收只读 ViewModel 和标准 RendererContext，事件交给控制器；不能直接请求 API、写 localStorage、解析分享参数或另建 Markdown 解析链。

## 主题

注册源为 `packages/theme-contracts/src/index.ts`。每项明确 id、version、frameworkIds、选项描述、默认视觉值与验证器。现有 minimal-list/card-grid 均支持 `density`（comfortable/compact）和 `showTags`（boolean）；主题不生成摘要、图片或其他事实。

注册表中的主题 ID 必须唯一，包括分别声明给不同框架的同名项；跨框架支持放在同一个 frameworkIds 数组中，共用版本和描述。ID/标签、正安全整数版本、非空且无重复的框架数组、选项 kind/required 和默认值均在生成主题目录、规范化配置和核对适配器时检查。非法注册不能靠列表顺序或当前框架被隐藏。

增加主题时先定义选项描述与校验，再在支持的适配器中实现相同字段/全文/事件语义，并更新 `supportedThemeIds`。宿主检查缺失/多余实现；不支持的框架会得到不可用主题，不能静默回退。初期表单自动根据描述生成 string/number/boolean/enum 控件。

必填且没有默认的选项在草稿表单中填写，提交完整主题事件后才建立配置或读取正文。未知选项和无效值保持原配置，字段错误由共享校验器返回。视觉默认可由规范化过程补全，事实字段不可补全。

required 表示 JSON 字段必须存在：false、枚举中的 null 和空字符串均可以是合法已填写值，不能用 HTML required 强迫勾选或非空。控件使用 aria-required 描述要求，提交后由共享校验器显示字段错误。缺失的枚举显示“请选择”，不代选第一项；选项按完整 JSON 往返，null 不当作缺失。数字支持有限小数；清空数字或可选枚举会移除草稿字段，规范化后使用明确声明的视觉默认，没有默认则保持缺失或返回 required 错误。

共享层始终按选项描述严格检查类型和 enum choices，自定义 validate 只增加约束，不能用隐式转换放宽字段类型。描述的 defaultValue 与注册项 defaults 使用同一合并规则；同字段两处声明必须语义相等。未知默认字段、无效类型、重复选项键或没有 choices 的 enum 会报注册错误，不能让表单和规范化配置各用一套默认值。

适配器应比较已提交主题的 id/version/options：语义变化或配置清除时重置本地表单草稿，同主题仅改参数也要同步；普通内容选择、详情导航及提示更新保留未提交参数。比较忽略对象键顺序，保留数组顺序。重置表单不派发 set-theme，也不写个人配置。

选项必须是有限、可无损往返的 JSON。迁移按旧 themeVersion 显式注册，一次迁移必须达到当前版本；输入独立克隆，结果再次校验，重复结果应相同。没有迁移的旧记录保留，要求重新配置。

## 新框架

新增独立 `packages/renderer-<name>/`，只依赖 contracts/theme-contracts 与自身框架。实现 `RendererAdapter` 的 `frameworkId`、`supportedThemeIds`、`mount`、`update`、`unmount`。在主题注册表声明该框架支持的实现，再添加应用入口与构建工具的允许列表。内容、数据源和控制器无需改变。

通过宿主 `mountBlog` 注入路由、存储、来源工厂与事件能力。新框架须按同一语义通过内容事实、排序、主题参数、配置恢复、卸载与资源事件测试；不要求 DOM 或像素与现有框架相同。`check:boundaries` 自动发现 renderer-<name> 包并应用只允许 contracts/theme-contracts 的共享包依赖规则；其他新增共享包须明确声明依赖政策。

边界检查使用已锁定的 @babel/parser 解析 TypeScript/JSX，遍历实际导入、再导出、动态导入、require、类型导入与 import-equals；计算出的动态模块名拒绝。覆盖 TS/TSX/MTS/CTS、JS/JSX/MJS/CJS，以及 Vue/Svelte 文件的脚本块；检查运行时、peer 和 optional 依赖，禁止相对/绝对路径逃离包源码目录。注释及字符串中的框架名或浏览器对象名不会被当成依赖或全局访问。语法支持见 [Babel parser 官方文档](https://babeljs.io/docs/babel-parser)。新增框架的编译器、组件语法和应用入口仍须单独接入，不因源码边界检查通过就算渲染实现完成。

安全正文 `SafeBody.nodes` 是只读树。节点仅有 text、element、image；element 的标签及属性白名单见 SafeTag/SafeNode，禁止字符串 HTML 注入。image 仅含 resourceKey、作者 alt/title，不带可绕过加载协议的 src。

图片首次展示先发 start-resource，收到 loading 模型后才按 RenderedResource.url 建立图片节点；加载/失败带 resourceRevision 和 attemptRevision，缓存完成也要报告。仅保存提示变化保留节点，主动退出发 detach；失败占位保留槽位。重试同一个 URL，不能添加签名破坏参数。旧修订/尝试的事件会被忽略。

脚注和普通文内锚点由适配器在当前正文内定位、移动焦点，不改哈希路由；`#/content/...` 继续交给宿主导航。文内脚注 ID 包含文章 ID，避免列表中多篇脚注冲突。非法路由使用固定错误入口，不伪装成首页。

## 数据源与测试

自定义来源实现 ContentSource 和 SourceRuntimeFactory，明确 sourceId/运行时实例身份。请求结果须已验证公开状态、精确 ID 和 ResourceContext。静态来源另外实现 DeploymentProbePort，共用探测、独立等待取消和 sticky changed 行为。来源工厂在应用壳之后初始化；取消/卸载后迟到运行时释放。

当前测试中的 custom 框架主题注册、宿主桩与来源桩示范扩展边界，未将新框架耦合到核心。受控 HTTP 与 Chromium 场景位于 `tests/`，测试夹具由测试生成，不提交到生产内容。

`tests/theme-form-fixture/` 通过真实 Vue/React 适配器和共享控制器验证扩展选项的表单、提交、存储与刷新；`tests/browser/theme-form.spec.ts` 验证 false/null/空字符串、小数、必填缺失与可选清除。该入口由浏览器测试服务单独构建，与 `apps/` 的生产入口和主题注册表隔离。
