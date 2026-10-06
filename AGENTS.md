# AGENTS.md

## 项目概览

**ArchReason（建筑推理引擎）**：辅助建筑师创作的 AI 工具。输入设计任务书 → LLM 策略推理 → 策略协同图 → 结构化推理报告（含真实案例）→ 无限画布工作台 → Grsai 真实生图（失败/未配置时程序化 SVG 兜底）。

- **技术栈**：Vite 7 + React 19 + TypeScript 5 + Express（开发态承载 Vite 中间件）
- **状态管理**：Zustand（全部 localStorage 持久化）
- **样式**：Tailwind CSS 4，浅色主界面 + 深色画板
- **图表**：ECharts（力导向策略网络图，按需注册）
- **架构**：纯前端应用，LLM 由浏览器直连 OpenAI 兼容接口；无后端数据库

## 目录结构

```
├── index.html
├── vite.config.ts
├── server/                    # Express（开发态）
│   ├── server.ts              # 服务入口
│   ├── vite.ts                # Vite 中间件 / 生产静态服务
│   └── routes/index.ts        # 健康检查等示例接口
├── src/
│   ├── main.tsx               # 客户端入口 + RouterProvider
│   ├── App.tsx                # 路由表
│   ├── types.ts               # 全局类型（并 re-export Strategy）
│   ├── index.css              # Tailwind + 设计 token + 组件类
│   ├── data/
│   │   ├── strategies.ts      # 32 条策略 + 6 个分组（核心资产）
│   │   └── cases.ts           # 64 个真实建筑案例
│   ├── services/
│   │   ├── llm.ts             # prompt 构建 / JSON 解析 / 推理 / 本地兜底 / 协同边
│   │   ├── strategyPool.ts    # 内置+用户自定义统一策略池解析（定义/案例/维度/建 id）
│   │   ├── grsai.ts           # Grsai 真实生图：MODEL_CATALOG(16 模型) + 异步轮询/同步/编辑
│   │   ├── referenceImage.ts  # 参考图提交前浏览器端下载转 base64（15s 超时/失败剔除/错误识别）
│   │   ├── wikiImageSearch.ts # 自动找图：Wikimedia Commons API（origin=*）搜索 + 选中图下载转 base64
│   │   └── imageGeneration.ts # ImageGenerationService + 8 风格 SVG（降级/演示兜底）
│   ├── stores/                # settings / task / report / board / customStrategy
│   ├── components/
│   │   ├── Layout.tsx         # 侧边栏 + 主区域
│   │   ├── SafeImage.tsx      # 图片加载失败 SVG 兜底
│   │   ├── CaseGallery.tsx    # 可编辑案例图库（上传 + 自动找图，写覆盖层）
│   │   └── ImageSearchPicker.tsx # 自动找图候选弹层（改词重搜/多选/8 张上限/确认下载转 base64）
│   └── pages/                 # Home / Settings / Synergy / Report / Reports / Board
└── tools/                     # 一次性数据抓取/校验脚本（不入 ESLint）
```

## 常用命令

- 安装依赖：`pnpm install`
- 开发启动：`pnpm run dev`（端口取自 `DEPLOY_RUN_PORT`）
- 类型检查：`pnpm run ts-check`
- Lint：`pnpm run lint`
- 生产构建：`pnpm run build`
- 生产启动：`pnpm run start`

仅允许使用 **pnpm**，禁止 npm / yarn。

## 核心模块说明

- **推理链路**（`services/llm.ts`）：`buildSystemPrompt` 注入「内置 32 + 用户自定义 N」完整策略池 → `runInference` 调 chat/completions → `extractJson` 支持 code fence / 前后杂文字 / 字段归一化，并区分 `source=builtin/suggested`：5 条池内匹配 + 最多 3 条库外建议（suggested 带 definition/cases，临时 id 前缀 `suggested::`）→ 失败由 `localFallback` 规则打分兜底（报告标记 `degraded`，只含内置）。
- **库外策略收藏**（`stores/customStrategy.ts` + `services/strategyPool.ts`）：报告页「收藏入库」经 `makeSuggestedId` 去掉临时前缀生成稳定 id，写入独立持久化 `archreason-custom-strategies`（含策略与自带案例），幂等防重复；统一通过 `getPooledStrategies/getStrategyById/resolveCases` 取用。设置页显示「内置 32 + 自定义 N」并支持导出/导入 JSON（导入整体替换）。
- **协同边**（`buildEdges`）：命中策略间的预置 `synergies`（strength=`preset`）+ 模型 `synergyInsights`（strength=`insight`）；库外节点用 `resolveStrategy` 现场解析定义后同样参与，协同图中以虚线描边区分。
- **生图链路**（`pages/BoardPage.tsx`）：默认走 `services/grsai.ts` 真实接口，三模式 `async`（/v1/api/generate + /result 轮询，真实 progress）、`sync`（/v1/images/generations 同步）、`edit`（/v1/images/edits，针对画板选中单图）。参数区按 `MODEL_CATALOG`（16 模型，paramStyle=banana/banana2/gpt-base/gpt-vip）动态渲染；`PIXEL_PRESETS` 为 vip/flare/sunburst 的合规像素网格。
- **降级兜底**：未配置 Key、CORS（`GrsaiError.corsLike`/TypeError）或接口失败时，自动调用 `ImageGenerationService`（`services/imageGeneration.ts`）生成确定性 SVG，入板 meta 标 `grsaiMode=degraded`，流程不中断。
- **Key 与节点**：Grsai 三接口与 LLM 共用同一 API Key；节点 `global=grsaiapi.com` / `cn=grsai.dakka.com.cn` 存于 settings 的 `grsaiNode`。设置页含「Grsai」LLM 预设（baseUrl 随节点、model=gemini-3.1-pro）。
- **图片兜底**：所有外部图片经 `SafeImage`，失败回退建筑线稿 SVG。
- **Vite 中间件模式坑点**（`server/vite.ts`）：`createViteServer` 默认仍会自动加载根目录 `vite.config.ts`（其 plugins 已含 react 插件），若再内联注册 `react()` 会使 react-refresh 前导被注入两次，报 `inWebWorker / prevRefreshReg has already been declared`。故中间件模式必须显式 `configFile: false` 且插件只声明一次；同时不要展开复用 `vite.config.ts` 的实例化 plugins。端口从 `DEPLOY_RUN_PORT` 读取（HMR 固定 6000，path `/hot/vite-hmr`）。

## 编码规范

- TypeScript strict；禁止隐式 `any` / `as any`；函数参数与返回值显式标注类型。
- 优先复用当前作用域已声明标识符；清理未使用的变量与导入。
- 样式使用 Tailwind，遵循 `DESIGN.md` 的设计 token（赭石强调色 + 建筑纸感中性色）。
- React 19 无需 `import React`；动态内容放 `useEffect`/事件中，避免渲染期使用 `Date.now()`/`Math.random()` 造成不一致。
