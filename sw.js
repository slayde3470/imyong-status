// 규격 v2.5 기준
// sw.js — 화면 파일을 저장해 망 없이도 열리게 한다. 자료(중계 응답)는 저장하지 않는다(정본은 수신함, 계산 캐시는 IndexedDB).
const 판 = "스테이터스-2026-10-30-3";
const 화면파일 = ["./", "index.html", "style.css", "calc.js", "grade.js", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(판).then(c => c.addAll(화면파일)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== 판).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 같은 주소의 화면 파일: 망이 되면 새것을 받아 저장하고, 안 되면 저장한 것을 준다
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const 복사 = r.clone(); caches.open(판).then(c => c.put(e.request, 복사)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
