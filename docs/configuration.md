# 静态与 API 配置

`blog.config.json` 是公开应用配置，会随前端编译；不要加入密钥。`siteId` 标识个人配置空间，`sourceId` 标识内容来源，更换来源身份时使用不同值。存储键不包含框架，所以 Vue/React 使用相同配置协议。

仓库当前配置：

```json
{
  "schemaVersion": 1,
  "siteId": "blog",
  "source": { "kind": "static", "sourceId": "public-content" },
  "basePath": "/"
}
```

`basePath` 必须以 `/` 开头和结尾；根为 `/`，仓库项目为 `/Blog/`。构建环境 `BLOG_BASE_PATH` 可覆盖它，Pages 工作流使用平台输出自动设置。`BLOG_FRAMEWORK` 仅在未显式传入构建参数时决定发布应用，合法值 `vue`/`react`。

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

默认 `credentials: omit`。后端配置 CORS 并负责身份鉴权、公开状态和授权。宿主代码可注入 `requestPolicy` 返回短期请求策略；不要将凭据写入内容、分享载荷、配置或日志。此接口不实现登录或后端部署。

## 内部工具环境

`BLOG_CONFIG` 可指定另一份应用配置；`BLOG_CONTENT_DIR` 可指定内容目录；`BLOG_OUTPUT_DIR` 可指定构建输出。后两者用于隔离测试，发布默认保持 `content/` 和选定的 `dist/<framework>/`。static 来源先校验内容，再替换输出；http 来源忽略 BLOG_CONTENT_DIR，只构建前端，不生成 current.json、静态清单、站点、目录、正文或本地资源。切换到 HTTP 后，输出整体替换，不保留旧静态内容。不把测试变量配置进发布工作流。

本地跨域浏览器证据见 `tests/browser/http.spec.ts`，夹具服务见 `tests/http-browser-fixtures.ts`。受控服务演示接口契约及错误恢复，生产后端需独立提供。
