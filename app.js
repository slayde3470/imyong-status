// 규격 v2.5 기준
// app.js — 스테이터스 화면(탭 4개 + 설정). 계산은 calc.js, 채점은 grade.js. 정본은 드라이브 수신함(규격 §1-10), 이 기기 저장소는 대기·캐시 임시만.
// 정의: 규격 §1-6(날짜 04:00), §4-1(쓴곳·순번·보내기 대기·지점목록·목표진도), §6-2(문제기록), §6-7(복습문제), §6-8(체력), §8·§8-2·§9-3·§9-5,
//       합의안 v3 §2-2·§4, 설계안 v2 §2(탭 4개), 작업 지시문(작업세션2_스테이터스_PWA_프롬프트.md).
"use strict";

const 판 = "2026-10-30";
const 계산 = window.상태계산;
const 채점 = window.채점;
const $ = id => document.getElementById(id);
const 글 = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

// ---------------------------------------------------------------------------
// 기기 저장소(설정·대기·보냄·순번 = localStorage, 파일 캐시 = IndexedDB)
// ---------------------------------------------------------------------------
const 저장 = {
  읽기(k, 기본) { try { const v = localStorage.getItem("스테이터스." + k); return v === null ? 기본 : JSON.parse(v); } catch (e) { return 기본; } },
  쓰기(k, v) { try { localStorage.setItem("스테이터스." + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const 기본설정 = { 중계: "", 비밀: "", 기기: "A", 시험모드: false, 시험하한: "2026-10-30", 가짜시각: "", 화면: "자동" };
let 설정 = Object.assign({}, 기본설정, 저장.읽기("설정", {}));

const 캐시 = (() => {
  let db = null;
  const 열기 = () => new Promise((ok, no) => {
    if (db) return ok(db);
    const r = indexedDB.open("스테이터스", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("파일"); r.result.createObjectStore("목록"); };
    r.onsuccess = () => { db = r.result; ok(db); };
    r.onerror = () => no(r.error);
  });
  const 일 = (가게, 방식, ...a) => 열기().then(d => new Promise((ok, no) => {
    const t = d.transaction(가게, 방식 === "get" || 방식 === "getAllKeys" ? "readonly" : "readwrite");
    const q = t.objectStore(가게)[방식](...a);
    q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error);
  }));
  return {
    파일읽기: k => 일("파일", "get", k).catch(() => undefined),
    파일쓰기: (k, v) => 일("파일", "put", v, k).catch(() => undefined),
    파일키들: () => 일("파일", "getAllKeys").catch(() => []),
    목록읽기: k => 일("목록", "get", k).catch(() => undefined),
    목록쓰기: (k, v) => 일("목록", "put", v, k).catch(() => undefined),
  };
})();

// ---------------------------------------------------------------------------
// 날짜·시각: 한국 시간, 04:00 전은 전날(규격 §1-6)
// ---------------------------------------------------------------------------
function 지금() {
  if (설정.시험모드 && 설정.가짜시각) {
    const t = new Date(설정.가짜시각 + ":00+09:00");
    if (!isNaN(t)) return t;
  }
  return new Date();
}
function 한국시각(t) { return new Date(t.getTime() + 9 * 3600 * 1000); }   // UTC 칸으로 읽는 한국 시각
function 오늘날짜() {
  const k = 한국시각(new Date(지금().getTime() - 4 * 3600 * 1000));
  return k.toISOString().slice(0, 10);
}
function 시각글(t) { const k = 한국시각(t); return k.toISOString().slice(0, 16).replace("T", " "); }
const 날짜하한 = () => (설정.시험모드 ? (설정.시험하한 || 계산.첫기록일) : 계산.첫기록일);
const 쓴곳 = () => "페이지" + (설정.기기 || "A");

// ---------------------------------------------------------------------------
// 중계(Apps Script) — POST 글자(text/plain) JSON
// ---------------------------------------------------------------------------
async function 중계(일, 자료) {
  if (!설정.중계 || !설정.비밀) throw new Error("설정에 중계 주소와 비밀 글자를 넣어 주세요");
  const 멈춤 = new AbortController();
  const 시계 = setTimeout(() => 멈춤.abort(), 45000);
  try {
    const r = await fetch(설정.중계, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ 비밀: 설정.비밀, 일 }, 자료 || {})), signal: 멈춤.signal, redirect: "follow",
    });
    if (!r.ok) throw new Error("중계 응답 " + r.status);
    const d = await r.json();
    if (d.결과 === "거절") throw new Error("중계가 거절함: " + (d.까닭 || ""));
    if (d.결과 === "실패") throw new Error("중계 실패: " + (d.까닭 || ""));
    return d;
  } finally { clearTimeout(시계); }
}

// ---------------------------------------------------------------------------
// 받기: 수신함 목록 → 필요한 내용만 → 발신함(가장 최근 상태·주간문제) → 루트(지점목록·목표진도)
// ---------------------------------------------------------------------------
let 연결상태 = "-";
let 받는중 = false;
const 이름날짜 = n => { const m = n.match(/_(\d{4}-\d{2}-\d{2})_/); return m ? m[1] : null; };
function 내용필요(이름) {
  const m = 이름.match(계산.파일이름_re);
  if (!m) return false;
  return m[2] >= 날짜하한() && ["공부기록", "문제기록", "카드", "복습문제", "체력", "이행", "보고", "질문", "규격요청", "오답메모"].includes(m[3]);
}
function 최신하나(이름들, re, 묶음) {   // 같은 묶음 안에서 판 → 순번 큰 것(규격 §4-1)
  const 고름 = {};
  for (const n of 이름들) {
    const m = n.match(re); if (!m) continue;
    const k = 묶음 ? 묶음(m) : "_";
    if (!고름[k] || 비교(n, 고름[k], re) > 0) 고름[k] = n;
  }
  return Object.values(고름);
}
function 비교(a, b, re) {
  const ma = a.match(re), mb = b.match(re);
  const 판a = ma.length > 3 ? ma[ma.length - 2] : ma[1], 판b = mb.length > 3 ? mb[mb.length - 2] : mb[1];
  const pa = 판a.split(".").map(Number), pb = 판b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return parseInt(ma[ma.length - 1], 10) - parseInt(mb[mb.length - 1], 10);
}
async function 내용채우기(곳, 이름들) {
  const 없는 = [];
  for (const n of 이름들) if ((await 캐시.파일읽기(곳 + "/" + n)) === undefined) 없는.push(n);
  for (let i = 0; i < 없는.length; i += 60) {
    const d = await 중계("읽기", { 곳, 이름들: 없는.slice(i, i + 60) });
    for (const n of Object.keys(d.내용 || {})) await 캐시.파일쓰기(곳 + "/" + n, d.내용[n]);
  }
}
async function 받기() {
  if (받는중) return;
  받는중 = true;
  연결상태 = "받는 중…"; 윗줄그리기();
  try {
    const 수 = await 중계("목록", { 곳: "수신함" });
    const 수이름 = 수.파일.map(f => f.이름);
    await 캐시.목록쓰기("수신함", 수이름);
    윗목록.수신함 = 수이름;
    await 내용채우기("수신함", 수이름.filter(내용필요));
    const 발 = await 중계("목록", { 곳: "발신함" });
    const 발이름 = 발.파일.map(f => f.이름);
    await 캐시.목록쓰기("발신함", 발이름);
    const 상태후보 = 발이름.filter(n => /^전체_\d{4}-\d{2}-\d{2}_상태_\d{2}\.json$/.test(n)).sort();
    const 주간 = 발이름.filter(n => /_주간문제_\d{2}\.json$/.test(n) && (이름날짜(n) || "") >= 계산.날더하기(오늘날짜(), -8));
    await 내용채우기("발신함", 상태후보.slice(-1).concat(주간));
    const 루 = await 중계("목록", { 곳: "루트" });
    const 루이름 = 루.파일.map(f => f.이름);
    await 캐시.목록쓰기("루트", 루이름);
    const 고른 = 최신하나(루이름, 계산.지점목록_re, m => m[1]).concat(최신하나(루이름, 계산.목표진도_re));
    await 내용채우기("루트", 고른);
    await 캐시.목록쓰기("받은때", 시각글(new Date()));
    await 대기보내기(수이름);
    await 내용채우기("수신함", (윗목록.수신함 || []).filter(내용필요));
    연결상태 = "받음 " + 시각글(new Date()).slice(5);
  } catch (e) {
    연결상태 = "연결 안 됨 — " + e.message + " (저장된 것으로 보여 줌)";
  } finally {
    받는중 = false;
  }
  await 다시계산();
}

// ---------------------------------------------------------------------------
// 계산(이 기기 캐시만으로, 망 없이도)
// ---------------------------------------------------------------------------
let 결과 = null;        // {상태, 계산기}
let 최근상태 = null;    // 발신함 가장 최근 상태.json(스크립트가 만든 것)
let 주간문제들 = [];
async function 다시계산() {
  const 수이름 = (await 캐시.목록읽기("수신함")) || [];
  const 발이름 = (await 캐시.목록읽기("발신함")) || [];
  const 루이름 = (await 캐시.목록읽기("루트")) || [];
  const 수신함 = [];
  for (const n of 수이름) 수신함.push({ 이름: n, 내용: 내용필요(n) ? await 캐시.파일읽기("수신함/" + n) : undefined });
  const 본부 = [];
  for (const n of 최신하나(루이름, 계산.지점목록_re, m => m[1]).concat(최신하나(루이름, 계산.목표진도_re))) {
    const v = await 캐시.파일읽기("루트/" + n);
    if (v !== undefined) 본부.push({ 이름: n, 내용: v });
  }
  const 상태이름 = 발이름.filter(n => /^전체_\d{4}-\d{2}-\d{2}_상태_\d{2}\.json$/.test(n)).sort().slice(-1)[0];
  최근상태 = null;
  if (상태이름) { try { 최근상태 = JSON.parse(await 캐시.파일읽기("발신함/" + 상태이름)); 최근상태._파일 = 상태이름; } catch (e) { 최근상태 = null; } }
  주간문제들 = [];
  for (const n of 발이름.filter(n => /_주간문제_\d{2}\.json$/.test(n))) {
    const v = await 캐시.파일읽기("발신함/" + n);
    if (v === undefined) continue;
    try { 주간문제들.push(Object.assign(JSON.parse(v), { _파일: n })); } catch (e) { /* 모양이 틀린 주간문제는 건너뜀 */ }
  }
  try {
    결과 = 계산.상태만들기({ 수신함, 본부, 발신함: [] }, {
      오늘: 오늘날짜(), 시험포함: 설정.시험모드, 날짜하한: 날짜하한(), 기준시각: 시각글(new Date()),
      빠짐: 최근상태 && 최근상태.놓침 ? 최근상태.놓침.빠짐 || [] : [],
    });
  } catch (e) {
    결과 = null;
    연결상태 = "계산 실패 — " + e.message;
  }
  모두그리기();
}

// ---------------------------------------------------------------------------
// 기록 쓰기: 순번·기록ID·보내기 대기(규격 §4-1)
// ---------------------------------------------------------------------------
function 다음순번(날짜) {
  const 줄 = 저장.읽기("순번", {});
  let 큰 = 줄[날짜 + "|" + 쓴곳()] || 0;
  const re = new RegExp("^[A-Z][A-Z0-9-]*_" + 날짜 + "_[^_]+_" + 쓴곳() + "_(\\d{2})\\.(md|json)$");
  for (const n of (윗목록.수신함 || [])) { const m = n.match(re); if (m) 큰 = Math.max(큰, parseInt(m[1], 10)); }
  for (const x of 저장.읽기("대기", []).concat(저장.읽기("보냄", []))) { const m = x.이름.match(re); if (m) 큰 = Math.max(큰, parseInt(m[1], 10)); }
  큰 += 1;
  줄[날짜 + "|" + 쓴곳()] = 큰;
  저장.쓰기("순번", 줄);
  return 큰;
}
const 정리글 = s => 계산.글정리(s);   // 글 값에 `\`·`"` 없음(규격 §9-3)
function 기록만들기(과목, 종류, 몸) {
  const 날짜 = 오늘날짜();
  const n = 다음순번(날짜);
  const nn = String(n).padStart(2, "0"), nnn = String(n).padStart(3, "0");
  const 기록ID = 과목 + "-" + 날짜 + "-" + 쓴곳() + "-" + nnn;
  const 머리 = { "기록ID": 기록ID, "과목": 과목, "날짜": 날짜, "쓴곳": 쓴곳(), "순번": nn };
  const 자료 = Object.assign(머리, 몸(), { "끝표시": 계산.끝표시_json });
  const 이름 = 과목 + "_" + 날짜 + "_" + 종류 + "_" + 쓴곳() + "_" + nn + ".json";
  const 대기 = 저장.읽기("대기", []);
  대기.push({ 이름, 기록ID, 내용: JSON.stringify(자료, null, 1), 만든: new Date().toISOString(), 시도: 0, 오류: "" });
  if (!저장.쓰기("대기", 대기)) alert("기기 저장소에 못 썼습니다. 화면을 닫지 말고 지금 기록을 적어 두세요: " + 이름);
  저장.쓰기("내기록", 저장.읽기("내기록", []).concat([{ 이름, 내용: 대기[대기.length - 1].내용 }]).slice(-300));   // 이 기기에서 푼 것(같은 문제를 다시 내지 않게)
  return { 이름, 기록ID };
}
async function 대기보내기(수이름) {
  let 대기 = 저장.읽기("대기", []);
  const 보냄 = 저장.읽기("보냄", []);
  const 남김 = [];
  for (const x of 대기) {
    try {
      x.시도 = (x.시도 || 0) + 1;
      const d = await 중계("쓰기", { 이름: x.이름, 내용: x.내용 });
      if (d.결과 === "씀" || (d.결과 === "있음" && d.같음)) { await 캐시.파일쓰기("수신함/" + x.이름, x.내용); 보냄.push({ 이름: x.이름, 기록ID: x.기록ID, 보낸: new Date().toISOString(), 확인: false }); continue; }
      x.오류 = d.결과 === "있음" ? "같은 이름에 다른 내용이 있음(본부에 보고 필요)" : (d.까닭 || d.결과);
      남김.push(x);
    } catch (e) { x.오류 = e.message; 남김.push(x); }
  }
  저장.쓰기("대기", 남김);
  // 보낸 뒤 수신함 목록을 다시 읽어 그 이름이 있는지 확인 → ✓
  let 목록 = 수이름;
  if (보냄.some(x => !x.확인)) {
    try { const 수 = await 중계("목록", { 곳: "수신함" }); 목록 = 수.파일.map(f => f.이름); await 캐시.목록쓰기("수신함", 목록); } catch (e) { /* 다음에 확인 */ }
  }
  const 있음 = new Set(목록 || []);
  for (const x of 보냄) if (!x.확인 && 있음.has(x.이름)) { x.확인 = true; x.확인때 = new Date().toISOString(); }
  저장.쓰기("보냄", 보냄.slice(-300));
  if (목록) 윗목록.수신함 = 목록;
}
const 윗목록 = { 수신함: [] };

// ---------------------------------------------------------------------------
// 그리기 — 맨 위 한 줄
// ---------------------------------------------------------------------------
function 수비율(d) { if (!d) return "-"; const a = d["맞음"] !== undefined ? d["맞음"] : d["틀림"]; return a + "/" + d["전체"] + (d["전체"] ? " (" + Math.round(a / d["전체"] * 100) + "%)" : ""); }
function 어제계산표() { return 최근상태 && 최근상태["날짜"] !== 오늘날짜() ? " (어제 계산)" : ""; }
function 윗줄그리기() {
  $("시험띠").hidden = !설정.시험모드;
  const 대기 = 저장.읽기("대기", []);
  const s = 결과 && 결과.상태;
  const 빠짐 = 최근상태 && 최근상태.놓침 ? (최근상태.놓침.빠짐 || []).length + 어제계산표() : "-";
  const 되돌림 = s ? s.놓침.되돌림.length : "-";
  const 어제 = s ? s.숫자.어제기록 : "-";
  $("맨위").textContent = "빠짐 " + 빠짐 + " · 되돌림 " + 되돌림 + " · 대기 " + 대기.length + " · 어제 기록 " + 어제 + "건";
  const 긴급 = s ? s.경보.긴급 : [];
  $("긴급").hidden = !긴급.length;
  $("긴급").innerHTML = 긴급.map(e => "🔴 " + 글(e["규칙"]) + (e["과목"] !== "-" ? " · " + 글(e["과목"]) : "") + (e["지점ID"] !== "-" ? " " + 글(e["지점ID"]) : "") + " — " + 글(e["글"])).join("<br>");
  const 오래 = 대기.filter(x => 지금().getTime() - new Date(x.만든).getTime() > 48 * 3600 * 1000);
  $("대기경고").hidden = !오래.length;
  $("대기경고").textContent = "⚠ 보내기 대기 " + 오래.length + "건이 48시간을 넘었습니다. 기록 탭에서 다시 보내기를 누르세요.";
  $("연결").textContent = 연결상태;
}

// ---------------------------------------------------------------------------
// 상태창
// ---------------------------------------------------------------------------
const 막대상한 = { "지력": 1000, "메타인지": 1000, "기억력": 100, "근성": 1000, "체력": 1000 };
function 막대(이름, 값, 상한, 덧) {
  const 비 = Math.max(0, Math.min(1, 값 / 상한));
  const 넘 = 값 > 상한;
  return `<div class="막대줄"><div class="막대이름"><span>${글(이름)}</span><span>${글(값)}${넘 ? ` <span class="주의">초과 +${값 - 상한}</span>` : ""} <span class="흐림 작게">/ ${상한}</span></span></div>
    <div class="막대틀"><div class="막대속${넘 ? " 넘음" : ""}" style="width:${(비 * 100).toFixed(1)}%"></div></div>${덧 || ""}</div>`;
}
function 상태창그리기() {
  const 곳 = $("상태본문");
  if (!결과) { 곳.innerHTML = `<div class="카드상자">아직 받은 자료가 없습니다. 설정에 중계 주소·비밀 글자를 넣고 <b>새로 받기</b>를 누르세요.</div>`; return; }
  const s = 결과.상태, c = 결과.계산기;
  const 고름 = $("과목");
  const 과목들 = Array.from(new Set(Object.keys(s.진도).filter(k => k !== "전체").concat(c.과목들)));   // 지점목록이 없는 과목도 숫자는 고를 수 있게
  const 지금고름 = 고름.value || "전체";
  고름.innerHTML = ["전체"].concat(과목들).map(k => `<option value="${글(k)}"${k === 지금고름 ? " selected" : ""}>${글(k)}</option>`).join("");
  const k = 과목들.includes(지금고름) ? 지금고름 : "전체";
  const 진 = s.진도[k] || { "본": "-", "분모": "-", "목표": "-", "차이p": "-", "차이일": "-" };
  const 율 = v => (typeof 진["분모"] === "number" && 진["분모"] && typeof v === "number" ? (v / 진["분모"] * 100).toFixed(1) + "%" : "-");
  const 숫 = k === "전체" ? s.숫자 : 계산.과목숫자(c, k);
  const 합 = o => Object.values(o || {}).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
  const 칸값 = (o, x) => (x in (o || {}) ? o[x] : "-");
  const 미룸 = k === "전체" ? 합(s.미룸) : 칸값(s.미룸, k);
  const 확인남음 = k === "전체" ? 합(s.확인남음블록) : 칸값(s.확인남음블록, k);
  const 카드대기 = k === "전체" ? 합(s.숫자.카드대기) : 칸값(s.숫자.카드대기, k);
  const 오늘 = s.오늘;
  const 함정4 = Object.entries(숫["함정4주"]).filter(([, v]) => v["전체"]).map(([n, v]) => n + " " + v["틀림"] + "/" + v["전체"]).join(" · ") || "-";
  const 메모별 = Object.entries(숫["메모별정답률"]).filter(([, v]) => v["전체"]).map(([n, v]) => 글(n) + " " + v["맞음"] + "/" + v["전체"]).join(" · ") || "-";
  const 상스 = 최근상태 && 최근상태["스탯"];
  const anki있음 = 최근상태 && 최근상태["숫자"] && 최근상태["숫자"]["Anki유지율"] !== "-" && 최근상태["숫자"]["Anki유지율"] !== undefined;
  const 기억 = anki있음 && 상스 ? 상스["기억력"] : s.스탯["기억력"];
  const 기억덧 = `<div class="흐림 작게">${anki있음 ? "상태.json 값(Anki 포함)" + 어제계산표() + " · 다시 내기 부분(지금 계산) " + s.스탯["기억력"] + " · Anki 유지율 " + 글(최근상태["숫자"]["Anki유지율"]) : "다시 내기 부분(지금 계산). Anki 부분은 상태.json에 값이 오면 보임"}</div>`;
  const 작은 = o => `<div class="작은막대">${Object.entries(o).map(([n, v]) => `<span>${글(n)} ${v}${v > 100 ? " (초과)" : ""}</span>`).join("")}</div>`;
  곳.innerHTML = `
  <div class="카드상자"><div class="흐림">시험까지</div><div class="큰수">D-${s["시험까지"]}</div><div class="흐림 작게">2027-11-27 추정(공고 전, 미검증)</div></div>
  <div class="카드상자">
    <h3>진도 (1회독 범위) — ${글(k)}</h3>
    <table class="줄표">
      <tr><td>본 지점 / 분모</td><td>${진["본"]} / ${진["분모"]} (${율(진["본"])})</td></tr>
      <tr><td>오늘 목표</td><td>${진["목표"]}${typeof 진["목표"] === "number" ? " (" + 율(진["목표"]) + ")" : ""}</td></tr>
      <tr><td>차이</td><td>${글(진["차이p"])}%p · ${글(진["차이일"])}일</td></tr>
      <tr><td>미룸 · 확인 남은 블록</td><td>${미룸} · ${확인남음}</td></tr>
    </table>
  </div>
  <div class="카드상자">
    <h3>오늘 예정 진도</h3>
    <div><b>${글(오늘["과목"])}</b> ${글(오늘["교재"])} <span class="흐림">(${글(오늘["지점처음"])} ~ ${글(오늘["지점끝"])})</span></div>
    <div>첫 일: ${글(오늘["첫일"]["글"])}</div>
  </div>
  <div class="카드상자">
    <h3>숫자 — ${글(k)}</h3>
    <table class="줄표">
      <tr><td>기출방향 통과율</td><td>${수비율(숫["기출방향통과율"])}</td></tr>
      <tr><td>확신 정답률</td><td>${수비율(숫["확신정답률"])}</td></tr>
      <tr><td>과신률(확신인데 틀림)</td><td>${수비율(숫["과신률"])}</td></tr>
      <tr><td>찍음 정답률</td><td>${수비율(숫["찍음정답률"])}</td></tr>
      <tr><td>다시 내기 통과율</td><td>${수비율(숫["다시내기통과율"])}</td></tr>
      <tr><td>예측 오차</td><td>${글(숫["예측오차"]["평균"])} (${숫["예측오차"]["횟수"]}회)</td></tr>
      <tr><td>함정 4주 (틀림/전체)</td><td>${함정4}</td></tr>
      <tr><td>메모 종류별 정답률</td><td>${메모별}</td></tr>
      <tr><td>카드 대기</td><td>${카드대기}</td></tr>
      <tr><td>연속 공부일</td><td>${s.숫자["연속공부일"]}</td></tr>
      <tr><td>어제 기록</td><td>${s.숫자["어제기록"]}건</td></tr>
    </table>
  </div>
  <div class="카드상자">
    <h3>스탯</h3>
    ${막대("지력", s.스탯["지력"], 1000)}
    ${막대("메타인지", s.스탯["메타인지"], 1000)}
    ${막대("기억력", 기억, 100, 기억덧)}
    ${막대("근성", s.스탯["근성"], 1000)}
    ${막대("체력", s.스탯["체력"], 1000)}
    ${막대("함정 내성", s.스탯["함정내성"]["전체"], 100, 작은(Object.fromEntries(Object.entries(s.스탯["함정내성"]).filter(([n]) => n !== "전체"))))}
    ${막대("정확도", s.스탯["정확도"]["전체"], 100, 작은(Object.fromEntries(Object.entries(s.스탯["정확도"]).filter(([n]) => n !== "전체"))))}
  </div>
  <div class="카드상자 흐림 작게">
    계산: 이 기기(수신함 기록 ${s["포함기록수"]}개, 날짜 하한 ${글(날짜하한())}${설정.시험모드 ? ", 시험 기록 포함" : ""}) · 상태.json: ${최근상태 ? 글(최근상태._파일) + 어제계산표() : "없음"}
    ${s.경보.경보.length ? "<br>🟠 경보(세기만): " + s.경보.경보.map(e => 글(e["규칙"]) + " " + 글(e["글"])).join(" / ") : ""}
    ${s.경보.주의.length ? "<br>🟡 주의: " + s.경보.주의.map(e => 글(e["규칙"]) + " " + 글(e["글"])).join(" / ") : ""}
  </div>`;
}

// ---------------------------------------------------------------------------
// 공부 — 기한이 된 문제 풀기
// ---------------------------------------------------------------------------
const 종류순서 = { "다시 내기 24시간": 0, "다시 내기 1주": 1, "확인": 2, "주간복습": 3, "변형": 3 };
let 풀이 = null;   // {목록, i, 첫문제뜻보임, 단계, 확신도, 채점, 초안}
const 푼열쇠 = (원기록ID, 문항ID, 메모) => 원기록ID + "|" + 문항ID + "|" + 메모;
function 이기기에서푼것() {
  const s = new Set();
  for (const x of 저장.읽기("내기록", [])) {
    try { const d = JSON.parse(x.내용); for (const z of d["줄"] || []) s.add(푼열쇠(z["원기록ID"], z["문항ID"], z["메모"])); } catch (e) { /* 건너뜀 */ }
  }
  return s;
}
function 낼문제들() {
  if (!결과) return [];
  const c = 결과.계산기, 오늘 = 오늘날짜();
  const 기기푼 = 이기기에서푼것();
  const 수신푼 = new Set(c.줄들.map(x => 푼열쇠(x.원기록ID, x.문항ID, x.메모)));
  const out = [];
  for (const q of c.복습대기()) {
    if (q.낼날짜 > 오늘) continue;
    if (기기푼.has(푼열쇠(q.기록ID, q.문항ID, q.종류))) continue;
    out.push({ 과목: q.과목, 원기록ID: q.기록ID, 파일: q.파일, 낼날짜: q.낼날짜, ...q.문제 });
  }
  for (const 묶 of 주간문제들) {
    const 과목 = 묶["과목"] || (묶._파일.split("_")[0]);
    for (const z of 묶["문제"] || []) {
      if (z["낼날짜"] !== 오늘) continue;
      const k = 푼열쇠(묶["기록ID"], z["문항ID"], z["종류"]);
      if (수신푼.has(k) || 기기푼.has(k)) continue;
      out.push({ 과목, 원기록ID: 묶["기록ID"], 파일: 묶._파일, 낼날짜: z["낼날짜"], ...z });
    }
  }
  out.sort((a, b) => ((종류순서[a["종류"]] ?? 9) - (종류순서[b["종류"]] ?? 9)) || (a.낼날짜 < b.낼날짜 ? -1 : a.낼날짜 > b.낼날짜 ? 1 : 0) || (a.파일 < b.파일 ? -1 : 1));
  return out;
}
function 공부그리기() {
  const 곳 = $("공부본문");
  if (!풀이 || 풀이.끝남) {
    const 목록 = 낼문제들();
    if (!결과) { 곳.innerHTML = `<div class="카드상자">자료를 아직 받지 못했습니다.</div>`; return; }
    if (풀이 && 풀이.끝남) {
      곳.innerHTML = `<div class="카드상자"><div class="판정">오늘 문제 ${풀이.목록.length}개 끝</div><p>맞음 ${풀이.맞음} · 틀림 ${풀이.목록.length - 풀이.맞음}</p><p class="흐림">기록 ${풀이.목록.length}개를 보냈거나 보내는 중입니다(기록 탭).</p></div>` +
        (목록.length ? `<button class="큰단추" type="button" id="풀이시작">남은 문제 ${목록.length}개 풀기</button>` : "");
    } else {
      곳.innerHTML = 목록.length ? `<div class="카드상자"><div class="큰수">${목록.length}개</div><div class="흐림">오늘 풀 문제</div></div><button class="큰단추" type="button" id="풀이시작">시작</button>`
        : `<div class="카드상자">지금 낼 문제가 없습니다.</div>`;
    }
    const b = $("풀이시작");
    if (b) b.onclick = () => { 풀이 = { 목록: 낼문제들(), i: 0, 단계: "답", 확신도: null, 맞음: 0, 뜻보임: !!(풀이 && 풀이.뜻보임) }; 공부그리기(); };
    return;
  }
  const q = 풀이.목록[풀이.i];
  const 머리 = `<div class="문제글"><span class="번호">[${풀이.i + 1}/${풀이.목록.length}]</span> ${글(q["문제글"])}</div>`;
  if (풀이.단계 === "답") {
    곳.innerHTML = `<div class="카드상자">${머리}
      ${풀이.뜻보임 ? "" : `<p class="뜻">확신 = 답과 근거(쪽·그림·왜)가 함께 떠오름 / 애매 = 답은 떠오르는데 근거는 안 떠오름 / 찍음 = 후보 중 고름·모름</p>`}
      <input id="답칸" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="답">
      <div class="단추줄">${["확신", "애매", "찍음"].map(v => `<button type="button" class="고름${풀이.확신도 === v ? " 켜짐" : ""}" data-확신도="${v}">${v}</button>`).join("")}</div>
      <button id="제출" class="큰단추" type="button" disabled>제출</button></div>`;
    const 칸 = $("답칸"), 제출 = $("제출");
    const 맞추기 = () => {
      const 뗌 = 채점.확신도떼기(칸.value);
      if (뗌.확신도 && !풀이.확신도손) { 풀이.확신도 = 뗌.확신도; 곳.querySelectorAll("[data-확신도]").forEach(b => b.classList.toggle("켜짐", b.dataset.확신도 === 풀이.확신도)); }
      제출.disabled = !(뗌.답 && 풀이.확신도);
    };
    칸.oninput = 맞추기;
    곳.querySelectorAll("[data-확신도]").forEach(b => b.onclick = () => { 풀이.확신도 = b.dataset.확신도; 풀이.확신도손 = true; 곳.querySelectorAll("[data-확신도]").forEach(x => x.classList.toggle("켜짐", x === b)); 맞추기(); });
    칸.onkeydown = e => { if (e.key === "Enter" && !제출.disabled) 제출.click(); };
    제출.onclick = () => 제출하기(칸.value);
    칸.focus();
    return;
  }
  // 해설
  const r = 풀이.채점, 맞 = r.결과 === "O";
  const 함정 = String(q["함정"] || "-");
  let 함정줄 = "";
  if (!맞 && 함정 !== "-") {
    const 번호 = Array.from(함정).find(ch => 계산.함정기호.includes(ch));
    const v = 번호 && 최근상태 && 최근상태["숫자"] && 최근상태["숫자"]["함정4주"] ? 최근상태["숫자"]["함정4주"][번호] : null;
    const 기록 = v && v["전체"] ? (v["전체"] < 10 ? ` — 4주 동안 ${v["전체"]}번 중 ${v["틀림"]}번 틀림` : ` — 4주 동안 ${v["전체"]}번 중 ${v["틀림"]}번 틀림, ${Math.round(v["틀림"] / v["전체"] * 100)}%`) : " — 4주 기록 아직 없음";
    함정줄 = `<p>함정 ${글(함정)}${글(기록)}${어제계산표()}</p>`;
  }
  let 원인칸 = "";
  if (!맞) {
    if (풀이.확신도 === "찍음") 원인칸 = `<p>원인: 기억없음</p>`;
    else 원인칸 = `<p>원인 — 어디서 넘어졌나요?</p><div class="단추줄">${["기억없음", "부분기억", "혼동", "조건빠뜨림", "계산실수", "문제잘못읽음", "근거착각", "표기"].map(v => `<button type="button" class="고름${풀이.원인 === v ? " 켜짐" : ""}" data-원인="${v}">${v}</button>`).join("")}</div>
      <input id="원인구절" type="text" autocomplete="off" placeholder="한 구절(비워도 됨)">`;
  }
  const 판정 = 맞 ? (풀이.확신도 === "찍음" ? "맞음, 찍음 → 통과 아님" : "맞음") : (풀이.확신도 === "애매" ? "틀림 — '애매'라고 한 판단은 맞았어요" : 풀이.확신도 === "찍음" ? "틀림 — 모르는 걸 모른다고 했어요" : "틀림");
  곳.innerHTML = `<div class="카드상자">${머리}<div class="해설">
    <div class="판정 ${맞 ? "맞음" : "틀림"}">${글(판정)}</div>
    ${맞 ? "" : `<p>내 답: ${글(r.답)}</p>`}
    <p>정답: ${글(q["정답"])}</p>
    <p>근거: ${글(q["근거"])}</p>
    ${함정줄}${원인칸}</div>
    ${!맞 && 풀이.확신도 !== "찍음" ? `<div class="단추줄 넷"><button id="건너뜀" class="큰단추 둘째단추" type="button">건너뜀</button><button id="다음" class="큰단추" type="button"${풀이.원인 ? "" : " disabled"}>기록하고 다음</button></div>` : `<button id="다음" class="큰단추" type="button">다음</button>`}
  </div>`;
  곳.querySelectorAll("[data-원인]").forEach(b => b.onclick = () => { 풀이.원인 = b.dataset.원인; 곳.querySelectorAll("[data-원인]").forEach(x => x.classList.toggle("켜짐", x === b)); $("다음").disabled = false; });
  if ($("건너뜀")) $("건너뜀").onclick = () => { 초안마무리("-"); 다음문제(); };
  $("다음").onclick = () => {
    if (!맞 && 풀이.확신도 !== "찍음") {
      const 구절 = ($("원인구절").value || "").trim();
      초안마무리(원인글(q, 풀이.원인, 구절));
    }
    다음문제();
  };
}
function 원인글(q, 종류, 구절) {
  const 첫 = Array.from(String(q["함정"] || "-"))[0];
  const 번호 = 계산.함정기호.includes(첫) ? 첫 : "-";
  return 번호 + " " + 종류 + " — " + (구절 ? 정리글(구절) : "-");
}
function 제출하기(입력) {
  const q = 풀이.목록[풀이.i];
  const r = 채점.채점하기(입력, q["정답"]);
  풀이.채점 = r; 풀이.단계 = "해설"; 풀이.뜻보임 = true; 풀이.원인 = null;
  if (r.결과 === "O") { 풀이.맞음++; 문제기록쓰기(q, r, "-"); }
  else if (풀이.확신도 === "찍음") 문제기록쓰기(q, r, 원인글(q, "기억없음", ""));
  else 저장.쓰기("초안", { 문제: q, 채점: r, 확신도: 풀이.확신도, 메모: 설정.시험모드 ? "시험" : "-" });   // 원인을 고르기 전 화면이 닫혀도 잃지 않게
  공부그리기();
}
function 초안마무리(원인) {
  const 초안 = 저장.읽기("초안", null);
  if (!초안) return;
  문제기록쓰기(초안.문제, 초안.채점, 원인, 초안.확신도, 초안.메모);
  저장.쓰기("초안", null);
}
function 다음문제() {
  풀이.i++; 풀이.단계 = "답"; 풀이.확신도 = null; 풀이.확신도손 = false; 풀이.원인 = null;
  if (풀이.i >= 풀이.목록.length) 풀이.끝남 = true;
  모두그리기();
}
// 규격 §6-2 "스테이터스가 쓰는 문제기록": 예측·블록기록ID·형식ID·힌트는 `-`, 원기록ID = 그 문제가 실린 파일의 기록ID, 줄 메모 = 문제 종류
function 문제기록쓰기(q, r, 원인, 확신도, 메모) {
  확신도 = 확신도 || 풀이.확신도;
  메모 = 메모 || (설정.시험모드 ? "시험" : "-");
  const 과목 = q.과목;
  const w = 기록만들기(과목, "문제기록", () => ({
    "예측": "-", "블록기록ID": "-", "메모": 메모,
    "줄": [{ "지점ID": 정리글(q["지점ID"]), "문항ID": 정리글(q["문항ID"]), "문제방향": 정리글(q["문제방향"]), "형식ID": "-",
      "결과": r.결과, "확신도": 확신도, "힌트": "-", "함정": 정리글(q["함정"]), "원인": 원인, "원기록ID": 정리글(q.원기록ID), "메모": 정리글(q["종류"]) }],
  }));
  보내기예약();
  return w;
}

// ---------------------------------------------------------------------------
// 카드 — 오늘·이번 주 카드 기록(보기만)
// ---------------------------------------------------------------------------
function 카드그리기() {
  const 곳 = $("카드본문");
  if (!결과) { 곳.innerHTML = `<div class="카드상자">자료를 아직 받지 못했습니다.</div>`; return; }
  const c = 결과.계산기, 오늘 = 오늘날짜();
  const 월 = 계산.날더하기(오늘, -계산.요일(오늘));
  const 셈 = (a, b) => { const 과목 = {}; const 본 = new Set();
    for (const r of c.카드기록) { if (!(r.날짜 >= a && r.날짜 <= b)) continue; const k = c.기록과목(r);
      for (const z of r.줄) { const id = String(z["카드ID"]); if (본.has(id)) continue; 본.add(id); 과목[k] = (과목[k] || 0) + 1; } }
    return 과목; };
  const 표 = (o, 단위) => Object.keys(o).length ? Object.entries(o).map(([k, n]) => `<tr><td>${글(k)}</td><td>${n}${단위 || "장"}</td></tr>`).join("") : `<tr><td colspan="2" class="흐림">없음</td></tr>`;
  const 대기 = 결과.상태.숫자.카드대기;
  곳.innerHTML = `<div class="카드상자"><h3>오늘 (${오늘})</h3><table class="줄표">${표(셈(오늘, 오늘))}</table></div>
    <div class="카드상자"><h3>이번 주 (${월} ~)</h3><table class="줄표">${표(셈(월, 오늘))}</table></div>
    <div class="카드상자"><h3>카드 대기(본 지점 중 카드 없는 지점)</h3><table class="줄표">${표(대기, "개")}</table></div>`;
}

// ---------------------------------------------------------------------------
// 기록 — 보낸 기록·대기·되돌림, 체력 입력
// ---------------------------------------------------------------------------
function 기록그리기() {
  const 대기 = 저장.읽기("대기", []), 보냄 = 저장.읽기("보냄", []);
  const 되돌림 = 최근상태 && 최근상태.놓침 ? 최근상태.놓침.되돌림 || [] : [];
  const 내되돌림 = 결과 ? 결과.상태.놓침.되돌림 : [];
  const 나이 = t => { const h = (지금().getTime() - new Date(t).getTime()) / 3600000; return h < 1 ? Math.max(0, Math.round(h * 60)) + "분" : Math.round(h) + "시간"; };
  $("기록본문").innerHTML = `
  <h2>보내기 대기 ${대기.length}</h2>
  ${대기.length ? 대기.map(x => `<div class="목록줄"><span class="이름">${글(x.이름)}<br><span class="흐림 작게">${나이(x.만든)} 전 · 시도 ${x.시도 || 0}${x.오류 ? " · " + 글(x.오류) : ""}</span></span><span class="주의">대기</span></div>`).join("") : `<p class="흐림">없음</p>`}
  <button id="다시보내기" class="큰단추" type="button"${대기.length ? "" : " disabled"}>다시 보내기</button>
  <h2>보낸 기록</h2>
  ${보냄.length ? 보냄.slice(-30).reverse().map(x => `<div class="목록줄"><span class="이름">${글(x.이름)}</span><span class="${x.확인 ? "좋음" : "흐림"}">${x.확인 ? "받음 ✓" : "확인 중"}</span></div>`).join("") : `<p class="흐림">없음</p>`}
  <h2>되돌림 안내</h2>
  <p class="흐림 작게">상태.json${최근상태 ? " " + 글(최근상태._파일) + 어제계산표() : " 없음"} 기준. 본부가 지시로 다시 쓰게 합니다.</p>
  ${되돌림.length ? 되돌림.map(x => `<div class="목록줄"><span class="이름">${글(x["파일"])}</span><span class="나쁨">${글(x["까닭"])}</span></div>`).join("") : `<p class="흐림">없음</p>`}
  ${내되돌림.length ? `<p class="흐림 작게">지금 계산한 되돌림 ${내되돌림.length}건: ${내되돌림.map(x => 글(x["파일"])).join(", ")}</p>` : ""}`;
  $("다시보내기").onclick = () => 보내기예약(true);
}
function 체력폼만들기() {
  const 폼 = $("체력폼");
  폼.innerHTML = 계산.체력항목.map((n, i) => `<label>${글(n)}<input type="number" inputmode="decimal" step="any" data-항목="${글(n)}" id="체력-${i}"></label>`).join("");
}
function 체력저장() {
  const 측정 = [];
  let 틀림 = "";
  $("체력폼").querySelectorAll("input").forEach(el => {
    const v = el.value.trim();
    if (v === "") return;
    const n = Number(v);
    if (!isFinite(n)) { 틀림 = el.dataset.항목; return; }
    측정.push({ "항목": el.dataset.항목, "값": n });
  });
  const 알림 = $("체력알림"); 알림.hidden = false;
  if (틀림) { 알림.textContent = "숫자가 아님: " + 틀림; return; }
  if (!측정.length) { 알림.textContent = "잰 항목을 하나 이상 적어 주세요."; return; }
  const w = 기록만들기("FIT", "체력", () => ({ "블록기록ID": "-", "메모": 설정.시험모드 ? "시험" : "-", "측정": 측정 }));
  $("체력폼").reset();
  알림.textContent = "저장함: " + w.이름 + " (보내는 중)";
  보내기예약();
}

// ---------------------------------------------------------------------------
// 보내기 예약: 대기를 보내고 다시 계산
// ---------------------------------------------------------------------------
let 보내는중 = false;
async function 보내기예약(전부받기) {
  모두그리기();
  if (보내는중) return;
  보내는중 = true;
  try {
    if (전부받기) await 받기();
    else {
      try { await 대기보내기(윗목록.수신함); 연결상태 = "보냄 " + 시각글(new Date()).slice(5); }
      catch (e) { 연결상태 = "연결 안 됨 — " + e.message; }
      if (navigator.onLine !== false) await 받기();
    }
  } finally { 보내는중 = false; 모두그리기(); }
}

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------
function 설정그리기() {
  $("설정-중계").value = 설정.중계; $("설정-비밀").value = 설정.비밀;
  $("설정-기기").innerHTML = "ABCDEFGH".split("").map(x => `<option${x === 설정.기기 ? " selected" : ""}>${x}</option>`).join("");
  $("설정-시험").checked = !!설정.시험모드; $("시험설정").hidden = !설정.시험모드;
  $("설정-하한").value = 설정.시험하한 || ""; $("설정-가짜").value = 설정.가짜시각 || "";
  $("설정-화면").value = 설정.화면 || "자동";
  $("판").textContent = "스테이터스 " + 판 + " · 규격 v2.5 기준 · 쓴곳 " + 쓴곳() + " · 오늘(04:00 기준) " + 오늘날짜();
}
function 화면맞추기() { if (설정.화면 === "자동") document.documentElement.removeAttribute("data-화면"); else document.documentElement.setAttribute("data-화면", 설정.화면); }
function 설정저장() {
  설정 = Object.assign({}, 설정, {
    중계: $("설정-중계").value.trim(), 비밀: $("설정-비밀").value, 기기: $("설정-기기").value,
    시험모드: $("설정-시험").checked, 시험하한: $("설정-하한").value || "2026-10-30", 가짜시각: $("설정-가짜").value, 화면: $("설정-화면").value,
  });
  저장.쓰기("설정", 설정);
  화면맞추기(); 설정그리기();
  $("설정알림").hidden = false; $("설정알림").textContent = "저장했습니다. 자료를 다시 받습니다.";
  풀이 = null;
  받기();
}

// ---------------------------------------------------------------------------
// 탭·시작
// ---------------------------------------------------------------------------
let 지금탭 = "상태";
function 모두그리기() {
  윗줄그리기();
  if (지금탭 === "상태") 상태창그리기();
  if (지금탭 === "공부") 공부그리기();
  if (지금탭 === "카드") 카드그리기();
  if (지금탭 === "기록") 기록그리기();
  if (지금탭 === "설정") 설정그리기();
}
function 탭열기(t) {
  지금탭 = t;
  document.querySelectorAll(".탭줄 button").forEach(b => b.classList.toggle("켜짐", b.dataset.탭 === t));
  document.querySelectorAll("main > .탭").forEach(s => { s.hidden = s.id !== "탭-" + t; });
  모두그리기();
  window.scrollTo(0, 0);
}
async function 시작() {
  화면맞추기();
  document.querySelectorAll(".탭줄 button").forEach(b => b.onclick = () => 탭열기(b.dataset.탭));
  $("새로고침").onclick = () => 받기();
  $("과목").onchange = () => 상태창그리기();
  $("설정저장").onclick = 설정저장;
  $("설정-시험").onchange = () => { $("시험설정").hidden = !$("설정-시험").checked; };
  $("체력저장").onclick = 체력저장;
  체력폼만들기();
  // 원인을 고르기 전에 화면이 닫혔던 초안은 원인 `-`로 마무리(잃지 않기)
  if (저장.읽기("초안", null)) 초안마무리("-");
  윗목록.수신함 = (await 캐시.목록읽기("수신함")) || [];
  await 다시계산();
  if (!설정.중계) { 탭열기("설정"); return; }
  받기();
  window.addEventListener("online", () => 보내기예약(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !받는중) 받기(); });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* 화면 저장 없이도 돎 */ });
시작();
