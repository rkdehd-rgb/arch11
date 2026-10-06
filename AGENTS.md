# AGENTS.md

## 项目概览

**ArchReason（建筑推理引擎）**：辅助建筑师创作的 AI 工具。输入设计任务书 → LLM 策略推理 → 策略协同图 → 结构化推理报告（含真实案例）→ 无限画布工作台 → 程序化生成概念方案图。

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
│   │   └── imageGeneration.ts # ImageGenerationService 接口 + 8 风格 SVG 生成器
│   ├── stores/                # settings / task / report / board
│   ├── components/
│   │   ├── Layout.tsx         # 侧边栏 + 主区域
│   │   └── SafeImage.tsx      # 图片加载失败 SVG 兜底
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

- **推理链路**（`services/llm.ts`）：`buildSystemPrompt` 注入 32 条策略 → `runInference` 调 chat/completions → `extractJson` 支持 code fence / 前后杂文字 / 字段归一化 → 失败由 `localFallback` 规则打分兜底（报告标记 `degraded`）。
- **协同边**（`buildEdges`）：命中策略间的预置 `synergies`（strength=`preset`）+ 模型 `synergyInsights`（strength=`insight`）。
- **生图服务**：`ImageGenerationService.generate(prompt, styleId, options)` 返回 data URI；演示版为确定性 SVG（同 prompt+style 画面稳定），真实 API 实现位见文件尾部注释，可无缝替换。
- **图片兜底**：所有外部图片经 `SafeImage`，失败回退建筑线稿 SVG。

## 编码规范

- TypeScript strict；禁止隐式 `any` / `as any`；函数参数与返回值显式标注类型。
- 优先复用当前作用域已声明标识符；清理未使用的变量与导入。
- 样式使用 Tailwind，遵循 `DESIGN.md` 的设计 token（赭石强调色 + 建筑纸感中性色）。
- React 19 无需 `import React`；动态内容放 `useEffect`/事件中，避免渲染期使用 `Date.now()`/`Math.random()` 造成不一致。
