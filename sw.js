'use strict';

// 一度開いたら、電波がなくても遊べるようにする（ゲームのファイルをスマホに取っておく）
// ファイルを直したら CACHE の番号を上げる
const CACHE = 'pennant-v15';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/util.js', './js/data.js', './js/player.js', './js/sim.js', './js/league.js', './js/ui.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ページから「いまの版は？」と聞かれたら答える
self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: CACHE });
});

// ネットにつながるときは新しいファイルを取りにいき（取っておく分も新しくする）、つながらないときは取っておいた分を使う
// ブラウザの一時保存（GitHub Pages は 10 分）を通すと古いファイルが返るので、毎回サーバーに確かめる（変わっていなければ中身は送られない）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    fetch(sameOrigin ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))),
  );
});
