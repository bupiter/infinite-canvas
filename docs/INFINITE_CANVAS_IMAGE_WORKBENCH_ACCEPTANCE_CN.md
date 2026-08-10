# Vote 无限画布首版验收证据

更新时间：2026-08-10

对应设计：`INFINITE_CANVAS_IMAGE_WORKBENCH_DESIGN_CN.md`

## 1. 当前结论

当前版本通过本地发布前检查，但尚未满足设计文档第 24 节“首版完成”定义。

- Canvas 类型检查、安全守卫、生产构建、桌面/移动响应式检查通过。
- Sub2API 图片任务、审核、存储、计费隔离和 Redis 冲突重试相关测试通过。
- 本地 mock 端到端覆盖文生图、单图编辑、多图编辑、刷新恢复、导入、内嵌/新窗口和清理本地数据。
- 12 和 20 总并发均完成三批压测，无 429/5xx；同 Key 活动任务限制和终态释放通过。
- 仍需生产灰度证明真实 Pro 中文出图、两个 Pro 同时故障时不跨组、签名 URL 实际过期后的离线恢复、生产对象生命周期，以及不少于 100 张真实生成。

因此当前状态为：**本地发布门槛通过，生产首版验收待完成**。

## 2. 验收基线

### 2.1 Canvas

- 仓库：`D:\GitHub\bupiter\infinite-canvas`
- 分支：`codex/vote-canvas-security-branding`
- PR：`bupiter/infinite-canvas#2`
- PR #2 预合并分支已包含 Key 验证竞态修复、移动端布局修复、安全守卫和本验收文档。

### 2.2 Sub2API

- 工作树：`D:\AI_project\.worktrees\infinite-canvas-pr-a`
- 分支：`codex/infinite-canvas-pr-a`
- PR：`zhoucheng0508/sub2api#13`
- PR #13 预合并 Head：`be4124ae`，已包含审核故障关闭、Redis WATCH 冲突重试、任务终态加固、异步单图约束，以及参考图不进入 DeepSeek 预审的守卫测试。

### 2.3 本地运行环境

- Sub2API：`127.0.0.1:18081`
- 图片网关：`127.0.0.1:18082`
- Canvas：`127.0.0.1:3000`
- MinIO API：`127.0.0.1:19000`
- Redis：本地 Compose 内部服务
- Sub2API 镜像：`sub2api:canvas-pr13-retry-local`
- Canvas 验收镜像：`vote-infinite-canvas:prebuilt-mobilefix-local`

所有源码、构建产物、截图和测试数据均位于 D 盘。Canvas 验收容器内存限制为 128 MiB，实测约 3.5 MiB。

## 3. 第 21 节测试矩阵

状态定义：

- `通过`：当前证据直接覆盖验收标准。
- `部分通过`：实现或自动测试成立，但缺少真实生产条件下的直接证据。
- `待生产`：必须在生产灰度中完成。

### 3.1 功能

| 场景 | 状态 | 证据 |
|---|---|---|
| 文生图 | 通过（本地 mock） | 浏览器提交成功，结果写入历史并插入画布；响应实际尺寸记录为 mock 的 `1x1`。 |
| 中文文字 | 待生产 | 本地 mock 不包含真实图像语义，不能证明中文文字质量、下载内容和实际效果。 |
| 普通图生图 | 通过（本地 mock） | 单张参考图成功提交到 `/v1/images/edits/async` 并返回结果。 |
| 多图参考 | 通过（本地 mock） | 三张参考图独立显示并提交到编辑异步端点，无串图。 |
| 构图方向 | 通过 | UI 将宽高比作为偏好；结果面板记录服务端实际尺寸。 |
| 项目导出导入 | 通过 | UI 导入 `canvas-import-fixture.zip` 后项目数增加；安全守卫要求项目导出只能读取项目与本地 Blob，禁止读取配置 Store 或 `apiKey`。 |
| 页面关闭恢复 | 通过 | 30 秒延迟任务在刷新后恢复轮询，历史从 4 条增加到 5 条并保留结果。 |
| 内嵌/新窗口 | 通过 | `ui_mode=embedded` 隐藏横幅；两种模式共享同源本地项目和已验证 Key。 |

### 3.2 路由与隔离

| 场景 | 状态 | 证据 |
|---|---|---|
| 生图 Key | 部分通过 | 本地 18 枚并发测试 Key 均只暴露 `gpt-image-2` 并成功调用；临时 Key 已全部软删除。生产分组仍需灰度复核。 |
| 普通混合 Key | 通过（实现守卫） | `validateVoteImageConnection` 只接受模型集合严格等于 `{gpt-image-2}`；安全守卫已固定该不变量。 |
| 两个 Pro 账号故障 | 待生产 | 本地只有 mock 上游，不能证明两个指定 Pro 同时故障后的生产调度行为。 |
| 文本接口 | 通过 | 图片网关 `/v1/chat/completions` 和 `/v1/responses` 返回 404。 |
| 管理接口 | 通过 | 图片网关 `/api/v1/admin/settings` 返回 404。 |
| 模型限制 | 部分通过 | 连接守卫和此前认证 `/v1/models` 验证只允许 `gpt-image-2`；本轮清理 Key 后的网关复测跳过了认证模型检查。 |

### 3.3 安全审核

| 场景 | 状态 | 证据 |
|---|---|---|
| 正常提示词 | 通过 | `TestAsyncImageSuccessfulPrecheckIsNotRepeatedByDetachedExecution` 证明只审核一次；本地日志为 `pre_block/allow/success`。 |
| 高风险提示词 | 通过 | `TestAsyncImagePromptGuardRunsBeforeTaskCreation` 证明任务创建与上游执行前阻断。 |
| 不确定提示词 | 通过（自动测试） | 内容审核服务的快审升级与完整审核测试通过。 |
| 参考图片 | 通过 | `TestBatchImagePromptGuardRunsBeforePersistenceOrBilling` 用二进制 canary 证明图片 Base64 不进入审核请求；Redis 任务扫描 Base64 命中数为 0。 |
| 审核端点全故障 | 通过 | `TestAsyncImageAuditUnavailableFailsClosedBeforeTaskCreation` 返回 503，任务、Key 活动槽和上游执行均为 0。 |
| 管理员渠道测试 | 通过（自动测试） | 管理员测试请求绕过无效内容审核的既有守卫测试通过。 |

当前容器启动后审核日志：105 条、105 个不同请求 ID、0 审核错误、0 flagged；其中 102 条生成、3 条编辑，均为 `pre_block/allow/success`。

### 3.4 计费与任务

| 场景 | 状态 | 证据 |
|---|---|---|
| 成功任务 | 通过 | 当前容器启动后 `gpt-image-2` 有 103 条使用记录、103 个不同请求 ID、103 张计费图片，重复请求记录为 0。 |
| 审核拒绝 | 通过 | 阻断和审核不可用测试均证明计费、任务和上游副作用发生前返回。 |
| 上游失败 | 通过（自动测试） | 图片任务失败与现有退款/不扣费路径测试通过。 |
| 对象上传失败 | 通过 | `TestImageTaskServiceCompleteOffloadFailureMarksFailed` 证明任务失败、不保存 Base64并释放活动槽。 |
| 使用其他 Key 轮询 | 通过 | `TestAsyncImageHandlerPollHidesOtherAPIKeyAndIsIdempotent` 返回 404。 |
| 重复轮询 | 通过 | 同一测试及 103 条唯一使用记录证明不会重复扣费或重复形成使用记录。 |

Redis 当前有 192 条图片任务记录，`b64_json`/`data:image` 命中数为 0，`image_task_active:*` 残留数为 0。MinIO 图片桶当前有 190 个 `imgtask_*` 对象目录。

### 3.5 并发与稳定性

2、4、8、12、20 总并发均完成三批。2、4、8 档已重新执行并归档到 `D:\\AI_project\\.deploy-artifacts\\canvas-concurrency-acceptance-20260810-094729.json`。

2 总并发：

| 批次 | 完成 | 429/5xx | P50 | P95 |
|---|---:|---:|---:|---:|
| 1 | 2/2 | 0 | 952.691ms | 963.119ms |
| 2 | 2/2 | 0 | 1057.893ms | 1058.167ms |
| 3 | 2/2 | 0 | 1250.176ms | 1250.333ms |

4 总并发：

| 批次 | 完成 | 429/5xx | P50 | P95 |
|---|---:|---:|---:|---:|
| 1 | 4/4 | 0 | 1003.188ms | 1004.485ms |
| 2 | 4/4 | 0 | 1136.552ms | 1136.594ms |
| 3 | 4/4 | 0 | 1175.482ms | 1175.567ms |

8 总并发：

| 批次 | 完成 | 429/5xx | P50 | P95 |
|---|---:|---:|---:|---:|
| 1 | 8/8 | 0 | 1122.448ms | 1124.209ms |
| 2 | 8/8 | 0 | 1197.202ms | 1197.772ms |
| 3 | 8/8 | 0 | 1068.075ms | 1069.998ms |

12/20 档重新执行并归档到 `D:\\AI_project\\.deploy-artifacts\\canvas-concurrency-acceptance-20260810-095354.json`。

12 总并发：

| 批次 | 完成 | 429/5xx | P50 | P95 |
|---|---:|---:|---:|---:|
| 1 | 12/12 | 0 | 1371.722ms | 1383.439ms |
| 2 | 12/12 | 0 | 1156.051ms | 1158.286ms |
| 3 | 12/12 | 0 | 1070.508ms | 1072.378ms |

20 总并发：

| 批次 | 完成 | 429/5xx | P50 | P95 |
|---|---:|---:|---:|---:|
| 1 | 20/20 | 0 | 1308.957ms | 1310.947ms |
| 2 | 20/20 | 0 | 1172.229ms | 1179.002ms |
| 3 | 20/20 | 0 | 1154.287ms | 1155.403ms |

补充结果：

- 2/4/8 档共提交 42 个任务，成功 42、429 为 0、5xx 为 0；形成 42 条使用记录、42 个不同请求 ID、42 张计费图片和 42 个新增 MinIO 对象。
- 2/4/8 档实际成本合计 5.628；结束后活动任务锁为 0，账号 ID 2 保持 `active`，测试用户余额已精确恢复。
- 2/4/8 档压测前后：Sub2API 44.18 MiB -> 52.86 MiB、MinIO 80.28 MiB -> 80.39 MiB、图片网关 7.094 MiB -> 7.207 MiB、Redis 13.61 MiB -> 13.61 MiB、Canvas 3.012 MiB -> 3.012 MiB。
- 2/4/8 档使用的 14 个临时 Key 已全部软删除，有效数为 0。
- 12/20 档共提交 96 个任务，成功 96、429 为 0、5xx 为 0；形成 96 条使用记录、96 个不同请求 ID、96 张计费图片和 96 个新增 MinIO 对象，实际成本合计 12.864。
- 12/20 档压测前后：Sub2API 44.7 MiB -> 89.23 MiB、MinIO 80.27 MiB -> 84.46 MiB、图片网关 7.207 MiB -> 7.023 MiB、Redis 13.77 MiB -> 13.95 MiB、Canvas 3.012 MiB -> 3.012 MiB。
- 12/20 档结束后活动任务锁为 0，账号 ID 2 保持 `active`；32 个临时 Key 均已软删除，有效数为 0；测试用户余额恢复为原值 4.10694385。
- 五档本地结果支持首版按单账号 10、总并发 20 配置；生产灰度仍需持续观察真实 Pro 的成功率、429/5xx 和 P95。
- 同一个 Key 同时提交返回 `[202, 429]`。
- 被接受的任务完成后，同一 Key 再次提交返回 202 并完成。
- 不同 Key 在 12/20 总并发下均成功占用执行槽。
- Redis WATCH 冲突重试测试连续执行 10 次通过。
- 压测账号 ID 2 保持 `active`。
- 18 个 `canvas-load-*` 临时 Key 已全部软删除；数据库核验总数 18、有效数 0。

### 3.6 浏览器与安全

| 场景 | 状态 | 证据 |
|---|---|---|
| Key 不进入 URL/导出/日志 | 通过 | URL 参数白名单只有 `theme`、`lang`；配置导出调用 `configWithoutApiKey`；项目导出不读取配置 Store；Key 仅用于 Authorization。 |
| 主站 Token 不进入 Canvas | 通过（实现守卫） | Sub2API 只传递受限嵌入参数，不传登录 Token；图片网关 Nginx 日志不记录 Authorization。 |
| 只能调用图片域名 | 通过 | Canvas 固定 API Origin 为 `https://image.vote520.com`，CSP 不使用宽泛 `https:`。 |
| 非允许 Origin | 通过 | 本地网关预检：`https://canvas.vote520.com` 获得精确 ACAO；非允许 Origin 不获得 ACAO。 |
| 签名 URL 过期后本地可读 | 部分通过 | 生成结果先存为 IndexedDB Blob，`resolveImageUrl` 从 `storageKey` 恢复；尚未做真实签名 URL 到期后的浏览器断网复测。 |
| 清理本地数据 | 通过 | UI 清理后 Key 为空、连接验证按钮禁用、画布库为空、生图历史显示“还没有生成图片”。 |
| 桌面/移动无重叠 | 通过 | 1440x900：30 控件、0 越界、0 重叠；390x844：21 控件、0 越界、0 重叠。 |

截图：

- `D:\AI_project\.deploy-artifacts\canvas-acceptance-desktop-1440x900.png`
- `D:\AI_project\.deploy-artifacts\canvas-acceptance-mobile-390x844.png`

## 4. 自动化检查结果

### 4.1 Canvas

- `tsc --noEmit`：通过。
- `scripts/vote-workbench-security-guard.mjs`：通过。
- `vite build`：通过，转换 10663 个模块，耗时 12.30 秒。
- 不安全 `VOTE_IMAGE_ASSET_ORIGIN=http://...`：容器按预期拒绝启动并返回退出码 1。

### 4.2 Sub2API

- `go test -count=1 -p 1 ./internal/handler`：通过，35.103 秒。
- `go test -count=1 -p 1 ./internal/repository`：通过，2.185 秒。
- 与图片任务、对象存储和审核范围直接相关的 service 定向测试：通过。
- service 全包唯一失败：`TestEstimateOpenAIInputTokens_CompareWithOpenAIAPI` 的三个外部 OpenAI API 对比子用例，每个约 21 秒超时；与本 PR 无关。
- Redis 冲突重试测试 `-count=10`：通过。
- Sub2API 前端 `embedded-url.spec.ts` 与 `SettingsView.spec.ts`：2 个文件、38 项测试通过。
- Sub2API 前端 `vue-tsc --noEmit`：通过。
- 图片网关无凭据预检：路由、CORS、`no-store` 和匿名认证拒绝通过；认证模型检查因临时 Key 已清理而跳过。
- `gofmt -d`：无输出。
- `git diff --check`：通过。

## 5. 第 24 节首版验收

| 条件 | 状态 | 说明 |
|---|---|---|
| 主站内嵌或新窗口打开 | 部分通过 | 本地两种模式通过；待生产菜单与域名灰度。 |
| image 分组 Key 可生成 | 部分通过 | 本地 mock 与此前测试 Key 通过；待生产 Key 复核。 |
| 文生图、图生图、多图参考 | 部分通过 | 本地 mock 全通过；真实 Pro 图像质量待生产。 |
| 异步接口与页面恢复 | 通过 | 浏览器刷新恢复和任务持久化通过。 |
| 只用两个指定 Pro、不跨组 | 待生产 | 本地 mock 无法证明。 |
| 审核一次、故障关闭 | 通过 | handler 单测和运行日志直接覆盖。 |
| 对象存储私有、临时、自动清理 | 部分通过 | 本地私有 MinIO 与 Base64 脱离 Redis 通过；生产生命周期待验证。 |
| Key 和主站 Token 不泄露 | 通过（守卫） | 静态守卫、CSP、URL 白名单和清理测试覆盖。 |
| 计费保持一致 | 通过（本地） | 103 次唯一请求对应 103 张计费图片，无重复请求记录。 |
| 并发生产值经过压测 | 通过（本地） | 2/4/8/12/20 均完成三批且无 429/5xx，完整指标已归档；支持首版单账号 10、总并发 20，生产灰度继续监控真实 Pro。 |
| 回滚不影响主站与文本 | 部分通过 | 图片网关严格 404 文本/管理路由，组件可独立停用；尚未执行生产回滚演练。 |

## 6. 进入生产灰度前必须完成

1. 审阅并合并两个 PR，构建不可变生产镜像。
2. 依据生产升级文档备份、部署，并核对 `canvas.vote520.com`、`image.vote520.com`、私有对象存储和生命周期。
3. 使用真实 Pro 完成中文文字、文生图、单图和多图参考测试。
4. 模拟两个指定 Pro 同时故障，确认直接失败且不跨组。
5. 设置短签名 URL 做实际到期测试，确认刷新后仍从 IndexedDB 读取。
6. 完成不少于 100 张真实生产灰度，无错误扣费、跨组调度、Token 泄露或 Pro 账号异常后，再将第 24 节状态改为完成。
