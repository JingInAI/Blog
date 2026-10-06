# 展示维度与选项扩展

日期：2026-10-06。用户要求增加可选择维度，并为每个维度提供更多选项。本轮新增 14 个维度，并扩展十个已有枚举维度；展示参数由 12 个增至 26 个，分为八组。24 个枚举共 116 个声明值，加上两个显示开关的四个状态，共 120 个可选值；不包含“使用默认”、网页风格或内容勾选。实现、完整本地、真实双框架长文和 Pages 发布及线上验收均已完成。

## 依据与取舍

延续 [第一轮阅读设置](reading-preferences.md) 的搜索依据。本轮重新检索 Mozilla 与 W3C 官方资料，字号、字体、宽度、配色及文字间距是已有阅读产品提供的调节维度，参见 [Firefox 阅读模式](https://support.mozilla.org/en-US/kb/firefox-reader-view-clutter-free-web-pages)。[W3C 文字间距](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) 的值用于检验用户调整后内容和功能是否保持，不作为统一推荐默认值。

新增字重、标题比例、首行缩进、链接、代码、图片、表格、列表和标签样式是本项目针对博客正文的设计选择，不表示这些资料都提供了同名产品功能。缩进只影响普通段落首行，依据 [MDN text-indent](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-indent)；代码换行保留原始字符、空白和行分隔，通过 [MDN white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space) 所述样式控制展示。

## 参数目录

| 分组 | 字段／名称 | 可选值／显示名称 | 值数 |
| --- | --- | --- | --- |
| 外观 | colorScheme／配色 | auto：跟随系统；light：浅色；dark：深色；sepia：暖纸色；slate：冷灰色；night：午夜蓝；contrast：高对比黑色 | 7 |
| 文字 | fontSize／字号 | small：较小（87.5%）；normal：常规（100%）；medium：稍大（112.5%）；large：较大（125%）；larger：大号（150%）；extra：加大（175%）；largest：超大（200%）；huge：特大（250%） | 8 |
| 文字 | fontFamily／字体 | sans：无衬线；serif：衬线；mono：等宽；system：系统界面字体；rounded：圆体；kai：楷体 | 6 |
| 文字 | fontWeight／正文字重 | regular：常规（400）；medium：中等（500）；semibold：半粗（600）；bold：粗体（700） | 4 |
| 文字 | headingScale／标题大小 | compact：缩小（90%）；normal：常规（100%）；large：较大（115%）；larger：大号（130%）；largest：超大（150%） | 5 |
| 排版 | density／间距 | compact：紧凑；normal：适中；comfortable：宽松；loose：疏朗；airy：开阔 | 5 |
| 排版 | contentWidth／阅读宽度 | full：铺满可用空间；wide：宽栏（52rem）；comfortable：适中（40rem）；medium：中窄（34rem）；narrow：窄栏（28rem）；slim：极窄（22rem） | 6 |
| 排版 | lineHeight／正文行距 | tight：紧凑（1.3 倍）；normal：1.5 倍；comfortable：1.7 倍；relaxed：1.9 倍；wide：2 倍；extra：加宽（2.4 倍） | 6 |
| 排版 | paragraphSpacing／段落间距 | compact：紧凑（0.5 倍字号）；normal：常规（1 倍字号）；relaxed：宽松（1.5 倍字号）；wide：加宽（2 倍字号）；extra：更宽（2.5 倍字号）；spacious：开阔（3 倍字号） | 6 |
| 排版 | letterSpacing／字间距 | normal：常规；fine：微宽（0.03 倍字号）；relaxed：稍宽（0.06 倍字号）；wide：加宽（0.12 倍字号）；extra：更宽（0.18 倍字号） | 5 |
| 排版 | wordSpacing／词间距 | normal：常规；fine：微宽（0.04 倍字号）；relaxed：稍宽（0.08 倍字号）；wide：加宽（0.16 倍字号）；extra：更宽（0.24 倍字号） | 5 |
| 排版 | textAlign／正文对齐 | start：起始侧对齐；justify：两端对齐；center：居中；end：末尾侧对齐 | 4 |
| 排版 | paragraphIndent／首行缩进 | none：不缩进；small：1 倍字号；normal：2 倍字号；large：3 倍字号 | 4 |
| 链接 | linkStyle／正文链接样式 | underline：实线下划线；dotted：点状下划线；thick：加粗下划线；highlight：底色突出 | 4 |
| 代码 | codeFontSize／代码字号 | small：较小（80%）；compact：稍小（90%）；normal：常规（100%）；large：较大（110%）；larger：大号（125%） | 5 |
| 代码 | codeWrap／代码换行 | wrap：保留空白并换行；scroll：保留原行并横向滚动；break：长词也换行 | 3 |
| 图片 | imageWidth／图片宽度 | natural：原始尺寸，限制为可用宽度；full：铺满可用宽度；large：75% 可用宽度；medium：50% 可用宽度；small：35% 可用宽度 | 5 |
| 图片 | imageAlign／图片对齐 | inline：随原文行内排列；start：单独一行，起始侧；center：单独一行，居中；end：单独一行，末尾侧 | 4 |
| 图片 | imageCorners／图片圆角 | square：直角；normal：小圆角（4px）；soft：柔和（12px）；round：大圆角（24px） | 4 |
| 图片 | imageBorder／图片边框 | none：无边框；thin：细线（1px）；medium：中线（2px）；thick：粗线（4px） | 4 |
| 表格与列表 | tableDensity／表格间距 | compact：紧凑；normal：常规；relaxed：宽松；roomy：开阔 | 4 |
| 表格与列表 | tableStripes／表格行底色 | none：无交替底色；soft：轻柔交替；strong：明显交替 | 3 |
| 表格与列表 | listSpacing／列表项间距 | none：无额外间距；compact：紧凑（0.2 倍字号）；normal：常规（0.4 倍字号）；relaxed：宽松（0.75 倍字号）；wide：加宽（1 倍字号） | 5 |
| 内容信息 | tagStyle／标签样式 | plain：纯文字；soft：柔和底色；outline：描边；pill：胶囊 | 4 |
| 内容信息 | showTags／显示标签 | 显示／隐藏（布尔开关） | 2 |
| 内容信息 | hideMetadata／隐藏作者和日期 | 显示／隐藏（布尔开关） | 2 |

两个原有布尔维度继续保留显示/隐藏的含义和 JSON 类型，不为了增加数量引入含义不清的第三种布尔值。其他维度均提供三个以上枚举值；原先的所有值仍合法，含义及数值不改变。

## 渲染与保存契约

- 内置主题和配置继续使用 version/1。新增 14 个字段可选，注册默认仍仅为 density/comfortable 与 showTags/true。字段缺失保持原有外观；hideMetadata 缺失仍显示来源确实提供的作者和日期。旧个人/分享/作者配置不需要迁移，未知值和错误类型仍拒绝。
- 选择后直接进入共享校验，普通会话自动保存，分享会话只在内存修改直到显式保存。两内置布局之间保留全部共同参数；单项“使用默认”移除新参数，density 有明确默认则恢复 comfortable。“恢复默认外观”保留内容、顺序、主题和路由。
- 字号为文章正文基准；标题比例作用于原有标题层级，代码字号相对于代码的父容器，不重复缩放嵌套 code。强调、列表编号、任务状态及作者表格对齐保持；不添加内容或重建 Markdown。字重、字体的实际字形取决于本机字体，圆体和楷体均有系统回退，不请求外部字体。
- 正文行距和段间距的明确值优先于密度；首行缩进只应用于正文顶层 p，不加入空格字符，也不改变列表/引用。正文对齐不覆盖代码或作者声明的表格列对齐。
- 代码提供保留空白并换行、保留原行并内部横向滚动、长词换行三种策略。原始代码文字、缩进和换行不改，代码仍使用等宽字体，不应用正文的字/词间距。
- 图片宽度、对齐、圆角和边框只作用于已加载的作者图片，始终保留 src、alt、title、资源状态和重试协议；宽度受容器限制，高度自动保持比例，不通过 object-fit 裁剪。行内或单行排列是显式视觉选择，不删除周围文字或作者链接。
- 表格间距控制单元格留白；交替底色从 tbody 的第一行开始，表头与作者数据不改。表格保留内部滚动，列表间距不修改编号或缩进结构。标签样式仅改变已有标签外观，显示开关继续独立控制是否显示。
- 八个分组均使用原生可访问控件，桌面设置面板内部滚动，窄屏高度继续限制为 min(60vh, 32rem)。最大字号/间距与极窄阅读宽度组合不能形成页面横向溢出，代码/表格可内部滚动。

## 验收设计

[逻辑回归](../../tests/expanded-reading.test.ts) 遍历两框架全部声明值，验证拒绝非法值/类型、旧默认不扩张、跨布局保留及跨框架分享。两项新增逻辑回归通过，日志 /tmp/blog-expanded-unit.log。

[浏览器回归](../../tests/browser/expanded-reading.spec.ts) 在 Vue/React 的根路径与 /Blog/ 下逐项核对所有枚举档位的实际样式；另外在同一任务中组合 24 个枚举值，核对个人/分享恢复、默认恢复、原正文/代码/图片以及 1440/390/320 像素布局。新配色继续抽样检查九类文字对比度，不将抽样测试称为完整 WCAG 认证。

首次八项浏览器中四项组合测试通过，四项逐档测试因常规词间距的计算值断言失败。Chromium 将 normal 词间距计算为 0px；改为按属性核对计算值，保留全部档位、代码保护和内容断言，未改变产品样式。首次日志 /tmp/blog-expanded-targeted.log 保留，后续结果取得后追加。证据保存在 .generated/expanded-reading/，原文章及前轮记录保留。

修正计算值断言后，八项新增浏览器场景全部通过，日志 /tmp/blog-expanded-targeted-final.log。实际遍历 24 个枚举的全部 116 个声明值，全部配色九类文字对比度抽样均不低于 4.5:1；两布尔开关另由既有显示/隐藏回归覆盖。最大字号 40px 与最大文字间距组合下 320/390 像素无页面横向溢出，代码内部横向滚动、原始代码与全部正文不改。

独立生成 Vue/React 的 /Blog/ 候选，真实 RSI 两框架长文验收通过（/tmp/blog-expanded-longform.log、local-longform.json）。24 个枚举参数组合即时生效：250% 字号为 40px、2.4 倍行距为 96px、3 倍段间距为 120px、极窄栏为 352px，标题 90px、首行缩进 120px、字重 700、图片 24px 圆角与 4px 边框、标签 999px 圆角均符合选择。全部正文/27 标题/30 链接/22 alt/22 图解码、默认恢复、双布局与间距、分享/保存/刷新、桌面/手机均正确，错误数组为空。文章不含代码块/表格时，相应样式不制造内容；这些维度的实际单元格/代码效果由富正文浏览器夹具验证。内容 buildId 和原文/原图保持；前端 CSS/JavaScript 改变，旧页面需刷新一次。

CI 标记下 npm run check 全部通过类型/模块边界、169 项逻辑/构建、双框架生产构建及 97 项浏览器，日志 /tmp/blog-expanded-full.log。既有来源、并发、非法输入、资源重试、正文、即时设置和恢复回归均继续执行。文档链接和 Git 空白检查通过。真实 Pages 验收见下文。

测试清理复核通过：25 个固定测试端口关闭，临时 dev/build 实例目录为空，Playwright 最后状态 passed；完整日志匹配 169/169、零失败和 97 passed，结果 local-checks.json。发布提交 b9b1cf699fe49c4013c581f73be60e32bd480fe0 已推送，对应运行 37455168640；最终部署与真实线上结论见下文；验收在实际部署完成后执行。

## 真实发布与线上验收

发布提交 b9b1cf699fe49c4013c581f73be60e32bd480fe0 的 [Actions 运行 37455168640](https://github.com/JingInAI/Blog/actions/runs/37455168640) 中 verify/build-pages/deploy 全部成功，状态见 actions-status.json。2026-10-06 11:19 UTC 实际 [Vue 页面](https://jinginai.github.io/Blog/) 验收通过：24 个枚举组合、字号/间距/字重/标题/缩进/图片/标签的实际计算值与本地候选一致，全量正文/27 标题/30 链接/22 alt/22 图解码、双风格及间距、分享刷新/显式保存/个人刷新、桌面/手机布局均正确。pageErrors/badResponses/failedRequests 均为空；结果 online-longform.json 与截图保存于本轮证据目录。

30 个线上公开文件均 HTTP 200，SHA-256 与 dist/expanded-reading-vue 候选逐一一致，结果 online-artifacts.json；README、package.json、blog.config.json、原始 Markdown 和导入审查的核对路径均 404。内容 buildId 仍为 9925b008ea691efcbd916dc9530429ff557394c391e5c48b811cf05af835b8db，原文/原图不变；CSS 为 index-B1QxpJrl.css、Vue 脚本为 index-gLNW-02a.js。已打开的旧页面刷新一次加载新前端，文档收尾普通提交不重复部署。
