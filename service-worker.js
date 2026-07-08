// service-worker.js - 萌車日記的離線防護心臟 (Day 5 數據分析完整定案版)
const CACHE_NAME = 'moecar-journal-v1';

// 🪐 需要在本地快取的靜態核心資源清單
const ASSETS = [
  './',
  './index.html',
  './database.js',
  './app.js',
  './manifest.json'
];

// 1. 安裝階段 (Install)：將所有核心代碼檔案塞入手機本地快取空間
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('🐾 萌車日記：正在幫你把美麗的畫面與數據大腦打包存入手機中...');
      return cache.addAll(ASSETS);
    }).then(() => {
      return self.skipWaiting(); // 讓新版 Service Worker 立即生效
    })
  );
});

// 2. 活化階段 (Activate)：清理舊版本的快取，確保換版時不會抓到舊資料
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 萌車日記：正在幫你清理舊版的快取碎片唷！');
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // 立即取得網頁控制權
    })
  );
});

// 3. 攔截請求階段 (Fetch)：當沒網路或秒開 App 時，優先從手機本地快取拿檔案
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // 如果本地快取有檔案就直接秒開（離線模式支援）；沒有的話才發送網路請求
      return cachedResponse || fetch(e.request).catch(() => {
        // 防呆：如果完全沒網又抓不到資源，可以在這裡做進一步的離線提示
        console.log('📴 目前是離線狀態，不過別擔心，核心記帳功能依然有本地資料庫守護著！');
      });
    })
  );
});