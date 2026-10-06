# 展示状态与配置边界可靠性审查

日期：2026-10-06。用户要求审查代码的准确性、鲁棒性和可靠性并修复问题。范围包括新增阅读偏好、两套渲染器、控制器配置、迁移和请求地址，以及既有正文/资源/保存/分享契约。实现、定向回归及完整本地验收已完成，真实发布验收进行中。

## 发现与修复

### 1. 快速连续操作覆盖前一次选择

表单事件从当前渲染闭包读取 options 和 contentIds。宿主将事件排入微任务、框架又批量更新视图时，同一任务中的两个事件可能都读取旧值。例如先选 200% 字号再选深色，会只保留后一次参数；连续勾选两篇文章可能只保留后一篇，连续移除也可能恢复前一篇。

两适配器现在每次挂载创建独立 UiStore，同步保存最新只读模型与表单草稿。事件处理时读取该存储的最新状态，而非旧渲染闭包；内容勾选、移除和移动使用独立的待提交 ID 快照，编辑器控件立即反映选择，但正文仍只使用共享控制器验证过的模型。移动按最新顺序确定目标，并保护边界。

控制器提交配置后，适配器同步比较 id/version/options 及内容 ID；只清理对应草稿。提示、资源状态和普通路由更新保留未提交文本/数字参数。React 不再依赖稍后执行的 effect 重置草稿，Vue 使用挂载实例的刷新信号。恢复默认、提交表单及布局切换也读取最新状态，避免快速设置后换布局丢掉参数。旧实例的异步复制回调仅能更新旧存储，不污染重新挂载的实例。

### 2. JSON 枚举校验通过却显示未选

共享校验将对象键顺序视为语义等价，但旧表单直接 JSON.stringify 当前值。例如 choices 中的 `{size:2,tone:"author"}` 与记录中的 `{tone:"author",size:2}` 校验一致，却产生不同的 select value。

表单按 semanticEqual 找到声明的选择项，使用其 JSON 字符串作为控件值；原配置对象和键顺序不改写。注册阶段拒绝语义重复的选择项，包括对象键顺序差异、重复数组/null 和 0/-0，避免多个同值选择项对应不同标签。

### 3. 主题切换默认值共用嵌套引用，且带入不兼容枚举

themeSelectionOptions 原先只浅复制 defaults，嵌套 JSON 值仍共用引用；共同字段仅比较 key/kind，目标枚举限制变化后也会带入不允许的旧值。

现在默认与保留值均独立深拷贝；保留共同字段前匹配目标描述的完整类型/choices，不匹配则使用目标明确默认。新草稿不能修改主题目录或原配置中的嵌套值，额外自定义约束仍由共享验证器决定。

### 4. 外部配置与来源身份污染运行中的控制器

控制器原先保留 ControllerOptions、authorDefault、registry 和 factory.identity 的引用。调用者在创建后修改作者选择、主题默认或来源身份，会改变恢复结果、个人存储键或使模型生成报错。发布通知内的 changeSource 还会延后读取工厂身份，导致提交目标被之后的修改替换。

创建控制器时复制标量选项、作者默认、主题描述/默认/框架列表/迁移映射和工厂身份，只冻结内部拥有的快照。内置主题模板本身也冻结。工厂初始化函数仍保留正确的调用接收者，验证器、迁移与端口回调继续可调用；不冻结调用者对象或回调闭包。来源切换在提交时捕获身份，再按既有 URL 清理、释放与初始化顺序执行。

作者默认先做 JSON 验证再复制，非法默认继续返回 invalid-author-default，不能因 structuredClone 读取访问器而将非法数据变成合法配置。改变配置须创建新的控制器；改变来源使用 changeSource。外部回调内部行为变化不能由数据快照隔离，返回的运行时身份仍须与提交身份一致，否则失败关闭。

### 5. 未显式注册的继承迁移函数被执行

normalizeConfig 使用属性索引查找 migration，可能执行映射原型上的版本项，违反“按旧版本显式注册”的契约。现在只读取自有版本项，并检查是函数；不支持的版本拒绝且不调用继承函数。合法自有迁移仍执行两次确定性检查、必须直接达到当前版本并再次规范化。

### 6. API 端点绕过 HTTP(S) 地址约束

HTTP 来源的 baseUrl 已校验，但绝对端点可替换基础 URL。requestJson 原先直接交给 fetch 或注入传输，允许 data/file/ftp 或 URL 中的账号密码到达传输层。现在传输前统一验证 HTTP(S) URL 并拒绝 URL 凭据，错误为 invalid-response；没有网络调用或定时器残留。合法 HTTP(S) 查询、请求策略、取消优先级及正文超时规则保持。

## 回归证据

- 最初四项逻辑回归在旧实现全部失败；补齐后的七项中六项失败，非法作者访问器保护一项已经通过。请求端点与继承迁移的两个独立回归也在修复前失败。日志分别为 /tmp/blog-presentation-before-unit.log、before-unit-complete.log、before-request.log 和 before-migration.log（后三项具有相同 blog-presentation 前缀）。
- 最初六项浏览器回归均失败。将内容场景拆开后，十项中八项失败、两项 React 快速选项场景通过，说明该处受调度影响，不能将偶尔通过当作可靠。连续内容操作及键顺序恢复在两框架根/子路径复现。日志 /tmp/blog-presentation-before-browser.log 和 before-browser-complete.log。
- 修复后的八项逻辑回归通过；继承迁移补验随后纳入完整检查。第一次来源切换测试仍失败，原因是测试用单槽存储忽略了来源键，修正为按实际键隔离的 Map 后通过，未放宽身份或恢复断言。记录 /tmp/blog-presentation-after-unit.log 和 after-unit-final.log。
- 十项定向浏览器回归全部通过，补验快速设置后直接换布局、同控件双击、连续移除、个人刷新和原 JSON 值不改写。日志 /tmp/blog-presentation-after-browser.log。

新增逻辑测试见 [presentation-reliability.test.ts](../../tests/presentation-reliability.test.ts)，浏览器测试见 [reading-preferences.spec.ts](../../tests/browser/reading-preferences.spec.ts) 与 [theme-form.spec.ts](../../tests/browser/theme-form.spec.ts)。扩展夹具的多键 JSON 枚举只在测试构建出现，不进入生产内容。

CI 标记下 npm run check 完整通过类型/模块边界、167 项逻辑/构建、双框架生产构建和 89 项浏览器，日志 /tmp/blog-presentation-full.log；九项新增逻辑回归全部通过。随后独立生成 Vue/React 的 /Blog/ 发布候选并完成真实 RSI 长文验收，日志 /tmp/blog-presentation-longform.log，结果 local-longform.json。两框架同任务字号+配色操作、恢复默认、实际外观、全部正文/27 标题/30 链接/22 alt/22 图解码、分享/保存/刷新以及 1280/390 像素布局均正确，无页面或非预期请求错误。内容 buildId 保持 9925b008ea691efcbd916dc9530429ff557394c391e5c48b811cf05af835b8db，内容与 CSS 未修改；Vue 脚本变为 index-BzeoEtLB.js、React 为 index-CV6tXdW0.js。真实 Pages 结果完成后追加。审查不能证明不存在任何未知缺陷；真实生产 API/CORS/授权仍未接入，不将本机 HTTP 或模拟响应计为生产后端验收。证据与截图位于本机忽略目录 .generated/presentation-reliability/，既有内容、前轮成功和失败报告保留。
