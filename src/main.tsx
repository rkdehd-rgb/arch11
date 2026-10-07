import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { bootstrapAuth } from './services/authBootstrap';
import './index.css';

// 必须在渲染路由之前启动：微信网页授权回调会回落到站点根地址，
// code 是一次性的，晚一步就可能被路由切换丢掉。
void bootstrapAuth();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
