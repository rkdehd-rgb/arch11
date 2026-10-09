import { Router } from 'express';
import { goooodRouter } from './gooood';
import { caseImageRouter } from './case-image';

const router = Router();

// gooood（谷德设计网）站内搜索与文章正文图抓取
router.use('/api', goooodRouter);

// 案例参考图多源代理：gooood / 有方 / 建筑学院 / divisare / ArchDaily / dezeen
router.use('/api', caseImageRouter);

// API 路由示例
router.get('/api/hello', (_req, res) => {
  res.json({
    message: 'Hello from Express + Vite!',
    timestamp: new Date().toISOString(),
  });
});

router.post('/api/data', (req, res) => {
  const requestData = req.body;
  res.json({
    success: true,
    data: requestData,
    receivedAt: new Date().toISOString(),
  });
});

// 健康检查接口
router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    env: process.env.COZE_PROJECT_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default router;
