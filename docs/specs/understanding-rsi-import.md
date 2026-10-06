# Understanding RSI 授权内容导入与验收

日期：2026-10-06。当前状态：最终全文/配图发布、双框架本地及 Vue 线上验收已完成；跨发布核心恢复断言通过，恢复配置另行复核通过，整段跨发布脚本最后的定位错误保留。

## 来源与授权

- 原文：[Awesome RSI · understanding-rsi](https://prism-shadow.github.io/awesome-rsi/#blog/understanding-rsi)。
- 源仓库：[Prism-Shadow/awesome-rsi](https://github.com/Prism-Shadow/awesome-rsi)，快照 `36e91f8fed67e2cd0c761126f91042513df5d6ae`。
- 中文源文件：[site/src/data/blog/rsi-guide.zh.md](https://github.com/Prism-Shadow/awesome-rsi/blob/36e91f8fed67e2cd0c761126f91042513df5d6ae/site/src/data/blog/rsi-guide.zh.md)。
- 用户在本轮明确确认拥有文章及配图的公开使用权/授权，随后执行全文和配图导入。
- 导入文章：[content/posts/understanding-rsi.md](../../content/posts/understanding-rsi.md)，稳定 ID `understanding-rsi`，状态 `published`。

## 信息保留规则

标题、摘要、四个标签直接取原站中文元数据，不自行摘要、翻译或添加作者。原站文章没有 author 字段，因此本地也不填 author。原页发布日期为 `2026-09-03`，只精确到日；此值保留在正文来源附记，不将其转换为带推测时间/时区的 publishedAt。站点资料继续仅含 schemaVersion。

网页实际部署脚本中的中文 Markdown 与上述源仓库快照逐字相同。导入前正文为 38168 字节、413 行，SHA-256 为 `22666c24e9b06beeb3c14c8d084aaab86a8fe74131b498c830503b1638294391`。只将 22 处实际图片目标从 `图片和附件/文件名.png` 改为内容根目录下的 `assets/understanding-rsi/文件名.png`，追加明确的原文链接、原页日期和已核验的来源快照编号；反向恢复这 22 处路径后，原文部分与源文件逐字相同，其他原文字符/空白/段落均保留。导入正文（含来源附记）的 SHA-256 为 `72f422af1216306303dc3e6364794cf3c1682f649414e546364d4c19c3ef2dad`。

配图共 22 张、7464415 字节。每张图的 PNG 签名、长度、Git blob SHA-1 均与源快照匹配，并记录 SHA-256；保持作者提供的原始 alt，不根据文件名重写解释性描述。生产构建只发布哈希资源和规范化正文，不发布抓取脚本、缓存或审查文档。

原文公式保持原始 LaTeX 文本。本项目当前 CommonMark/GFM 引擎没有 KaTeX 数学排版；本次不修改公式、不推导新公式、不安装新渲染依赖，实际 DOM 文本已验证包含全部原式。原站的目录导航和页面 UI 不作为文章正文转载；原始 Markdown 内的标题、列表、链接与配图完整保留。

## 本地真实浏览器证据

Vue 与 React 均以 `/Blog/` 构建，内容 buildId 相同：`9925b008ea691efcbd916dc9530429ff557394c391e5c48b811cf05af835b8db`。每个候选有一篇公开文章、22 张资源和 30 个公开文件。真实 Chromium 对两框架各自验证：

- 静态 JSON 的正文和元数据与导入文件完全一致；站点不补作者和日期。
- 由 Markdown 语法树独立生成文本基准，DOM 全文文本逐字一致：27 个标题、30 个链接（包含追加的来源链接）、22 个 alt，所有图片解码成功。
- 卡片摘要没有建立图片请求，进入详情或列表全文后才加载图片；回到卡片及刷新保持摘要行为。
- 两风格、详情刷新、分享会话修改后刷新恢复、显式保存清理分享地址、个人配置刷新均通过。
- 1280/390 像素宽度没有横向溢出；无页面异常、HTTP 错误或非预期请求失败。

报告与桌面/手机截图保存于忽略目录 `.generated/source-import/`；`local-longform.json` 为本地结果，`import-provenance.json` 为导入核对，`asset-provenance.json` 为资源核对。这些本机证据不进入博客产物。工程既有 155 项逻辑与 65 项浏览器测试仍由发布工作流运行；实际作者内容验收是独立浏览器检查，不虚增既有测试计数。

## 最终线上发布与验收边界

最终源码为 `794c410c392c670ce13d6d00e0b76a1861c5480c`，[Actions 运行 37433960384](https://github.com/JingInAI/Blog/actions/runs/37433960384) 的 verify/build-pages/deploy 均成功。线上使用 Vue，地址为 [GitHub Pages 博客](https://jinginai.github.io/Blog/)；在首页选择风格并勾选该文章即可阅读，详情页可生成分享链接。最终线上 buildId 与上述双框架候选一致。

2026-10-06 08:14 UTC 实际线上重复上述 12 类长文检查全部通过；`online-longform.json` 记录完整正文、27 标题/30 链接/22 alt 与 22 图解码、两风格、分享保存、详情刷新、手机正文及无异常结果。`online-artifacts.json` 确认 30 个文件均 HTTP 200、SHA-256 与候选一致；源码、配置和审查文档的 Pages 地址均为 404。

真实旧会话在新版本上线前已打开且未请求正文。新版本上线后，旧正文实际返回 404，更新按钮出现；显式重载后新正文和 22 图成功显示、更新按钮消失、风格保留。脚本随后在详情页查找仅首页提供的选择框，超时退出 1，整段运行不计成功；已完成断言的审查记录为 `old-session-core-results.json`。检查位置已修正，此修正不冒充再次跨发布运行。恢复 URL 的详情、分享查询、风格和空选择另行在真实线上复核通过，见 `recovered-config-results.json`。首次旧目录刷新使用会话内缓存而未显示更新提示的预期错误也保留，不把缓存行为误判为产品缺陷。

真实 API 与线上异常注入未执行；数学公式保留原始 LaTeX 文本。本次导入未改变渲染引擎、后端接口或授权内容的科学论述。

## 资源 SHA-256

| 文件名 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 01-seal-fig1.png | 106516 | `43196259460f0710a57f68c40e81fe1d2a024fd2fbeaa3d1560175bc06ba6ce5` |
| 02-prime-agent-fig1.png | 75353 | `499692bdbbbcf740635a115aa433d498e81cda939f2e0f5da8f58ddc2e992bb4` |
| 03-reasoningbank-fig2.png | 74122 | `eda0220b1b9c470797c140305c903647a0cd0fd24acd28cbd656b3accdd67e7b` |
| 04-trace-fig2.png | 224806 | `9731f5cc54fb9b0415881ce4cd61a5f69cb9d8d9c9131b7cda8514e2ab782bbc` |
| 05-skillsmith-fig2.png | 3203017 | `26cddc1ab1d1071f0ddc1b088b1a51aa0060143fabb6275e5817a51d304d86c7` |
| 06-gdpevo-fig1.png | 308373 | `e7c4cf626ecf1e466f135156991d903761fae8b51f449305ac33b8afe4cbbbb2` |
| 08-mem2evolve-fig2.png | 405602 | `1b9b66f198f6f24ff0f6677003b2fc6af5258b7b6a06518471c21f25c4c4c709` |
| 09-finevo-bench-fig2.png | 248275 | `a9d19d010a50b74693c046240ff7dc7ebdea226d43cfee2106f2852c8b2fbf9d` |
| 10-dgm-fig3.png | 143381 | `4a6c9206de3c725ee9b6adc0d3df8f05323c4c8e76864f2abb481a2d0933be33` |
| 10-skillflow-fig1.png | 185475 | `eee7137f9e671b159868c052dcc69294ab37354254596c12805aba6dfbeac6ba` |
| 11-mgm-fig1.png | 369955 | `9074858f1b68ff920ad55a8500628a9f5e51245734f2fdafd255f90bacadcd97` |
| 13-recuris-fig3.png | 316467 | `8488345b7526f7ea0f32c59d442e665ba2e82f3fd77346a0673eb79ee50798cb` |
| 14-evo-harness-fig3.png | 102898 | `2e471679c1d871eb623e8d74de8e8e56e88055405cb6ee7ee2d10178b9f37867` |
| codex-agent-anatomy-v3.png | 31675 | `9352e46bdb56732353757117a3d0427fa002e8a33d353edd97aeadbd59341ab0` |
| codex-evolution-topologies-v1.png | 29058 | `8be8e7fa407f65db1611944289d3e74b7b23ce369dba6381cef2a3c8e40fee6c` |
| codex-joint-update-v1.png | 30626 | `5536e5c6180a521b219324f66e53fb066660b7aad1860e8a9cd82cb5b729e92a` |
| codex-rsi-artifact-mode-matrix-v1.png | 161886 | `adfccb6c6390b1d61b0c1ed64ea724a4fa406650ae344610cfe61723ede8e9d4` |
| codex-rsi-loop-v5.png | 47569 | `dbace2d5a18d85a1ef8435752aacb67faa9a1557768ca5720bb83f025ad0b203` |
| codex-rsi-taxonomy-overview-gpt-preview-v1.png | 1285398 | `cee6880ca966584496c8adbdb6d62070149072386c69666b6afa2793c798b2d6` |
| codex-rsi-update-timing-v1.png | 53716 | `3505f357362f5747e4cbdc3f66c3704f318f10f08aab1e2610c09a6204105110` |
| codex-self-update-v1.png | 30031 | `50540f3a85e46c03fb50ce50b9c9df4976fdf0a3ba90f739e2e6213a933ad8b2` |
| codex-teacher-update-v1.png | 30216 | `25e8faa5d8325bf2729bffda0902adadb4a058a02a581737437edeb42dda64e4` |
