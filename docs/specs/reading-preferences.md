# 多维度展示与阅读偏好

日期：2026-10-06。用户要求通过搜索决定展示设置的更多自由选择维度。实现、完整本地回归、真实双框架长文、Pages 发布及真实线上验收均已通过。

## 搜索依据与选择

检索并阅读官方资料，区分已有产品提供的选项与本项目的设计判断，不将功能文档当作用户偏好比例或真实用户调研：

- [Mozilla Firefox 阅读模式](https://support.mozilla.org/en-US/kb/firefox-reader-view-clutter-free-web-pages)：字号、字体、宽度、行距、配色，以及字间距、词间距和对齐。
- [Apple Books](https://support.apple.com/guide/iphone/read-books-iphc1af7c57/ios)：字号、背景、字体、行距、字间距、词间距、页边距和对齐。
- [Microsoft 沉浸式阅读](https://support.microsoft.com/en-us/accessibility/word/use-immersive-reader-in-word?ad=us&rs=en-us&ui=en-us)：文字大小、字体、页面颜色、列宽和文字间距。
- [W3C 视觉呈现说明](https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation)：允许调整颜色、宽度和文字大小，提供取消两端对齐的方式。
- [W3C 文字间距说明](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)：用户改变行距、段间距、字间距和词间距后不能丢失内容或功能；其中的数值是兼容性验收条件，不是要求全部用户默认采用这些值。

据此新增九个阅读外观维度，另外新增隐藏已有作者/日期的开关，配合原有标签开关控制内容信息。隐藏信息是本项目的界面选择，不归因于上述产品的功能。词间距用于包含空格的文本，不自动在中文字符间插入空格。朗读、翻译、AI 摘要、拼读标记及动画翻页不纳入本轮；本轮只变更视觉与已有元信息的可见性，不添加或改写内容。

## 维度与默认行为

| 分组 | 字段／名称 | 可选值 | 字段缺失时 |
| --- | --- | --- | --- |
| 外观 | colorScheme／配色 | auto 跟随系统、light 浅色、dark 深色、sepia 暖纸色 | 原有浅色 |
| 文字 | fontSize／字号 | normal 100%、large 125%、larger 150%、largest 200% | 原有字号 |
| 文字 | fontFamily／字体 | sans 无衬线、serif 衬线、mono 等宽 | 原有系统无衬线 |
| 排版 | contentWidth／阅读宽度 | full 可用宽度、comfortable 40rem、narrow 28rem | 原有可用宽度 |
| 排版 | lineHeight／正文行距 | normal 1.5、relaxed 1.9、wide 2 倍字号 | 跟随 density：宽松 1.7、紧凑正文 1.5 |
| 排版 | paragraphSpacing／段落间距 | normal 1、relaxed 1.5、wide 2 倍字号 | 原有段落样式与 density |
| 排版 | letterSpacing／字间距 | normal 常规、wide 0.12 倍字号 | 常规 |
| 排版 | wordSpacing／词间距 | normal 常规、wide 0.16 倍字号 | 常规 |
| 排版 | textAlign／正文对齐 | start 起始侧、justify 两端 | 起始侧 |
| 内容信息 | hideMetadata／隐藏作者和日期 | boolean | false，只显示来源确实提供的值 |

原有网页风格、density 和 showTags 继续使用。密度控制容器留白与默认正文间距；明确选择的正文行距和段间距优先于 density。字体使用本地字体族和系统回退，不请求外部字体，不保证所有系统安装同一字体。字号缩放文章正文、标题和元信息，编辑器不随文章字号放大。

阅读宽度作用于主内容区域，最大不超过屏幕可用空间；窄栏网格改为单列。字号与间距增加时，文字自然换行，表格保留内部滚动；代码继续使用等宽字体和原有空白策略，不应用正文的字/词间距或两端对齐。配色同时覆盖整页背景、文字、链接、元信息、输入控件和状态反馈，auto 响应系统配色的动态变化，显式选择不受系统切换影响。

窄屏的设置面板在自身内部滚动，高度上限为 60vh 与 32rem 的较小值，避免新增控件形成过长的前置面板；键盘与原生表单控件仍可访问所有参数。

## 契约与交互

两个内置主题保持 themeVersion/1，新增字段可选且不写入隐式新默认值，旧 personal/share/author 配置保持有效；未选的新枚举显示“使用默认”。清除选择移除相应字段，渲染回到上表默认，不改作者默认配置。非法值、非布尔隐藏值及未知字段由共享校验拒绝。

描述新增可选 group 和 choiceLabels：group 是非空组名；choiceLabels 只能用于枚举，长度与 choices 一致，每项非空。标签只影响界面，提交的 JSON 值不变；旧扩展主题没有分组时进入“风格参数”，没有标签时仍显示原 JSON 值。渲染适配器不自行规范化配置，继续由共享控制器提交。

所有新增选择即时生效，普通会话沿用自动保存，分享会话只更新内存直到显式保存；分享链接携带完整已选偏好。两内置主题之间切换布局时保留共同阅读参数，包括 density 和 showTags；扩展主题仍使用其声明的默认值，不携带不匹配字段。“恢复默认外观”清除偏好并恢复当前主题注册默认，但保留内容选择、顺序、主题和详情目标；分享会话内恢复也不自动写个人记录或更改原链接。

正文、标题、链接、图片、alt 和原始元数据不改写。隐藏作者和日期只影响渲染，不改变内容对象；缺失值不会补写、推断或用站点作者代替。

## 验收

逻辑回归验证旧配置兼容、所有新增字段的合法与非法类型、两框架 JSON 往返、共同参数保留以及描述的分组/标签约束。[浏览器回归](../../tests/browser/reading-preferences.spec.ts) 覆盖两框架根路径及 /Blog/，逐项检查实际计算样式、系统配色动态变化、显式配色覆盖、作者日期隐藏、全文保真、首页/详情、个人刷新、分享隔离与恢复、默认恢复以及 1440/390/320 像素重排。

CI 标记下 npm run check 通过类型/边界、158 项逻辑/构建、双框架生产构建和 79 项浏览器，日志 /tmp/blog-reading-full.log。随后增加手机面板高度限制，重新执行全部 79 项浏览器通过，日志 /tmp/blog-reading-browser-final.log；更新两框架发布候选并重复真实长文验收通过，日志 /tmp/blog-reading-longform-final.log。浅色/深色/暖纸色的正文、元信息、标签、链接、控件及代码等九类元素抽样文字对比度均不低于 4.5:1；这是本次抽样结果，不表示完整 WCAG 认证。

真实 RSI 两框架在九项外观参数组合后，全量 DOM 文字、27 个标题、30 个链接、22 个 alt 和图片解码仍与作者内容一致，分享/保存/刷新和 1280/390 像素布局通过，无页面或非预期网络错误。实际 200% 字号为 32px，2 倍行距/段间距为 64px，字/词间距分别 3.84/5.12px，窄栏为 448px，深色背景为 rgb(20, 32, 28)。local-longform.json 保存完整结果；原文与配图未修改，内容 buildId 保持原版本。

发布提交 721bfdfb169d9f362f65eb726d7738d9ff5b15ca 的 [Actions 运行 37444744447](https://github.com/JingInAI/Blog/actions/runs/37444744447) 中 verify/build-pages/deploy 全部成功。09:45 UTC 的真实 [Vue 站点](https://jinginai.github.io/Blog/) 验收通过，新增外观参数的实际计算值与最终本地候选一致，全部正文、标题、链接、22 张图片及分享/保存/刷新、桌面/手机布局正确，无页面或非预期网络错误。证据 online-longform.json。

30 个线上公开文件均 HTTP 200、SHA-256 与最终 Vue 候选一致，源码/配置/文档的核对路径均为 404；online-artifacts.json 和 actions-status.json 保存文件及运行状态。原有即时响应和必填保护场景继续执行，不仅检查配置对象。证据保存在本机忽略目录 .generated/reading-preferences/，不加入博客内容。已打开的旧页面刷新一次加载新前端后可使用新增设置。
