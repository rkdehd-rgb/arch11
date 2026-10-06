// ABOUTME: Vite integration for Express server
// ABOUTME: Handles dev middleware and production static file serving

import type { Application, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

const isDev = process.env.COZE_PROJECT_ENV !== 'PROD';

/**
 * 集成 Vite 开发服务器（中间件模式）
 *
 * 注意：不要在此处展开复用 vite.config.ts（其中 plugins 已是实例化的对象，
 * 再次传入会导致 react-refresh 前导被重复注入）。中间件模式需要独立、干净地
 * 声明配置，插件只注册一次。
 */
export async function setupViteMiddleware(app: Application): Promise<void> {
  const port = parseInt(process.env.DEPLOY_RUN_PORT || process.env.PORT || '5000', 10);

  const vite = await createViteServer({
    // 禁止自动加载 vite.config.ts（其内部也注册了 react 插件），
    // 避免与下方内联插件叠加导致 react-refresh 前导重复注入。
    configFile: false,
    root: process.cwd(),
    base: '/',
    appType: 'spa',
    plugins: [react()],
    server: {
      middlewareMode: true,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: {
        overlay: true,
        path: '/hot/vite-hmr',
        port: 6000,
        clientPort: 443,
        timeout: 30000,
      },
      watch: {
        usePolling: true,
        interval: 100,
      },
    },
  });

  // 使用 Vite middleware
  app.use(vite.middlewares);

  console.log(`🚀 Vite dev server initialized (port ${port}, HMR on 6000)`);
}

/**
 * 设置生产环境静态文件服务
 */
export function setupStaticServer(app: Application): void {
  const distPath = path.resolve(process.cwd(), 'dist');

  if (!fs.existsSync(distPath)) {
    console.error('❌ dist folder not found. Please run "pnpm build" first.');
    process.exit(1);
  }

  // 1. 服务静态文件（如果存在对应文件则直接返回）
  app.use(express.static(distPath));

  // 2. SPA fallback - 所有未处理的请求返回 index.html
  // 到达这里的请求说明：
  //   - 不是 API 请求（已被前面注册的路由处理）
  //   - 不是静态文件（express.static 未找到对应文件）
  //   - 需要返回 index.html 让前端路由处理
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log('📦 Serving static files from dist/');
}

/**
 * 根据环境设置 Vite
 */
export async function setupVite(app: Application): Promise<void> {
  if (isDev) {
    await setupViteMiddleware(app);
  } else {
    setupStaticServer(app);
  }
}
