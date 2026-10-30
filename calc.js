// 규격 v2.5 기준
// calc.js — 스테이터스 계산 모듈(화면과 떨어진 순수 함수). `_도구\스테이터스\상태_만들기.py`(규격 v2.5, 본부 검수 끝)를 그대로 옮겼다.
// 정의: 00_본부규격_v2.md(v2.5) §1-6·1-8·1-9, §4-1, §6 머리·§6-1~6-8, §7-3·7-7, §8·8-2·8-3, §9-3.
// 입력 = 기록 파일 목록·지점목록·목표진도·날짜·옵션(시험포함, 날짜하한) → 출력 = §9-3 상태.json과 같은 칸 이름의 객체.
// 예외 둘(규격 §1-8): `놓침.빠짐`과 기억력의 Anki 부분은 스크립트만 센다 → 옵션 `빠짐`으로 받은 값을 그대로 넣고, Anki 부분은 넣지 않는다.
// 브라우저(window.상태계산)와 node(require) 모두에서 돈다.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.상태계산 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const 규격판 = "v2.5";
  const 첫기록일 = "2026-11-02";          // §6 머리 '옛 파일'
  const 시험예정일 = "2027-11-27";        // §8 시험까지(공고 전 추정, 미검증)
  const 끝표시_md = "[끝] 칸 확인: 빠진 칸 없음";
  const 끝표시_json = "칸 확인: 빠진 칸 없음";

  const 칸검사종류 = ["공부기록", "문제기록", "카드", "복습문제", "체력", "이행"];
  const 원문종류 = ["보고", "질문", "규격요청", "오답메모"];
  const 모든종류 = 칸검사종류.concat(원문종류);

  const 문제방향값 = ["이름→특징", "특징→이름", "오류고치기", "조건", "계산", "배열"];
  const 정확도방향 = ["특징→이름", "오류고치기", "조건", "계산", "배열"];
  const 결과값 = ["O", "X", "부분"];
  const 확신도값 = ["확신", "애매", "찍음", "-"];
  const 메모정값 = ["맛보기", "다시", "블록끝", "다시 내기 24시간", "다시 내기 1주", "확인", "주간복습", "변형", "시험", "연습", "-", ""];
  const 진단제외메모 = ["시험", "연습", "맛보기", "다시"];
  const 복습메모 = ["확인", "다시 내기 24시간", "다시 내기 1주", "주간복습", "변형", "블록끝"];
  const 다시내기메모 = ["다시 내기 24시간", "다시 내기 1주"];
  const 함정기호 = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];
  const 복습문제종류 = ["다시 내기 24시간", "다시 내기 1주", "확인", "주간복습", "변형"];

  const 체력항목 = ["체중kg", "체지방kg", "근육kg", "축구리프팅개", "축구드리블자신감(1~5)", "축구슈팅자신감(1~5)",
    "배구토스연속", "농구자유투%", "농구드리블자신감합(10~50)", "체조핸드스프링(1~4)", "체조물구나무(1~4)",
    "체조앞구르기(1~4)", "체조뒤물구나무(1~4)", "체조백플립(1~4)", "수영IM초", "스쿼트kg", "데드리프트kg",
    "턱걸이개", "벤치kg"];

  const 공부기록_머리칸 = ["과목", "날짜", "순번", "기록ID", "메모"];
  const 공부기록_본문칸 = ["시작", "끝", "장소", "한 일", "지점", "미룸", "교재", "막힌 곳", "다음에 이어서"];
  const 문제기록_머리칸 = ["과목", "날짜", "순번", "기록ID", "예측", "블록기록ID", "메모"];
  const 문제기록_줄칸 = ["지점ID", "문항ID", "문제방향", "형식ID", "결과", "확신도", "힌트", "함정", "원인", "원기록ID", "메모"];
  const 이행_머리칸 = ["과목", "날짜", "순번", "기록ID", "메모"];
  const 이행_줄칸 = ["지시ID", "한 일", "결과"];
  const json공통칸 = ["기록ID", "과목", "날짜", "쓴곳", "순번", "블록기록ID", "메모"];
  const json칸 = {
    "문제기록": json공통칸.concat(["예측", "줄", "끝표시"]),
    "카드": json공통칸.concat(["내보냄묶음", "카드", "끝표시"]),
    "복습문제": json공통칸.concat(["문제", "끝표시"]),
    "체력": json공통칸.concat(["측정", "끝표시"]),
  };
  const 카드_항목칸 = ["카드ID", "지점ID", "층", "앞", "뒤", "근거"];
  const 복습문제_항목칸 = ["문항ID", "지점ID", "종류", "낼날짜", "문제글", "정답", "근거", "문제방향", "함정"];
  const 체력_항목칸 = ["항목", "값"];

  const 파일이름_re = /^([A-Z][A-Z0-9]*(?:-[A-Z]+)*)_(\d{4}-\d{2}-\d{2})_([^_]+)_([^_]+)_(\d{2})\.(md|json)$/;
  const 날짜_re = /^\d{4}-\d{2}-\d{2}$/;
  const 지점목록_re = /^00_지점목록_([A-Z][A-Z0-9]*(?:-[A-Z]+)*)_([\d.]+)_(\d{2})\.json$/;
  const 목표진도_re = /^00_목표진도_v?([\d.]+)_(\d{2})\.json$/;
  const 지시사본_re = /^([A-Z][A-Z0-9]*(?:-[A-Z]+)*)_(\d{4}-\d{2}-\d{2})_지시사본_(\d{2})\.md$/;

  // ---------------------------------------------------------------------------
  // 파이썬과 같게 맞추는 작은 도구
  // ---------------------------------------------------------------------------

  // 날짜는 'YYYY-MM-DD' 글자로 다룬다(글자 비교 = 날짜 비교)
  function 날짜로(s) {
    s = String(s == null ? "" : s);
    if (!날짜_re.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return s;
  }
  function 날더하기(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }
  function 날차이(a, b) {   // a - b (일)
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
  }
  function 요일(s) {         // 파이썬 weekday(): 월 0 … 일 6
    const [y, m, d] = s.split("-").map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  }
  const 최소날 = "0001-01-01";

  function 파이썬글(v) {      // str(v)
    if (v === null || v === undefined) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "object") return 파이썬json(v);
    return String(v);
  }
  function 파이썬json(v) {    // json.dumps(v, ensure_ascii=False) 의 구분자 모양
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "[" + v.map(파이썬json).join(", ") + "]";
    if (typeof v === "object") return "{" + Object.keys(v).map(k => JSON.stringify(k) + ": " + 파이썬json(v[k])).join(", ") + "}";
    return JSON.stringify(v);
  }
  function 정렬json(v) {      // sort_keys=True (같음 비교용)
    if (Array.isArray(v)) return "[" + v.map(정렬json).join(", ") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ": " + 정렬json(v[k])).join(", ") + "}";
    return v === undefined ? "null" : JSON.stringify(v);
  }
  function 앞자르기(s, n) { return Array.from(s).slice(0, n).join(""); }
  function 파이썬반올림(x, n) {   // round(x, n): .5는 짝수 쪽
    const f = Math.pow(10, n || 0);
    const m = x * f;
    let r = Math.round(m);
    if (Math.abs(m % 1) === 0.5) r = 2 * Math.round(m / 2);
    return r / f;
  }
  function 판비교(a, b) {         // 판비교키 튜플 비교
    const pa = String(a).split(".").map(p => (/^-?\d+$/.test(p) ? parseInt(p, 10) : 0));
    const pb = String(b).split(".").map(p => (/^-?\d+$/.test(p) ? parseInt(p, 10) : 0));
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return pa.length - pb.length;
  }
  function 글정리(s) {           // §9-3 글 값에 `\`와 `"`를 쓰지 않는다
    if (s === null || s === undefined) return "-";
    return 파이썬글(s).replace(/\\/g, "").replace(/"/g, "'");
  }
  function 글값정리(o) {
    if (typeof o === "string") return 글정리(o);
    if (Array.isArray(o)) return o.map(글값정리);
    if (o && typeof o === "object") { const out = {}; for (const k of Object.keys(o)) out[k] = 글값정리(o[k]); return out; }
    return o;
  }
  function 비율(맞음, 전체) { return { "맞음": 맞음, "전체": 전체 }; }
  function 줄나누기(text) {      // str.splitlines()
    const parts = text.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
    if (parts.length && parts[parts.length - 1] === "") parts.pop();
    return parts;
  }
  const 띄어 = s => String(s).trim();
  function 쪼개기1(s, sep) { const i = s.indexOf(sep); return i < 0 ? [s] : [s.slice(0, i), s.slice(i + sep.length)]; }
  function 키(...a) { return JSON.stringify(a); }
  function 지점문자열(v) {
    let items;
    if (Array.isArray(v)) items = v.map(x => 띄어(파이썬글(x)));
    else items = 파이썬글(v).replace(/,/g, ";").split(";").map(x => x.trim());
    return items.filter(x => x && x !== "-");
  }
  function 함정글자(s) { return Array.from(파이썬글(s)).filter(ch => 함정기호.includes(ch)); }

  // ---------------------------------------------------------------------------
  // 1. 기록 읽기
  // ---------------------------------------------------------------------------

  function 새기록(파일, 코드, 파일날짜, 종류, 쓴곳, 순번, 확장) {
    return { 파일, 코드, 파일날짜, 종류, 쓴곳, 순번, 확장, 머리: {}, 본문: {}, 줄: [], 원문: "", 끝표시: false,
      되돌림: [], 규격밖: [], 제외: false, 대체됨: false, 중복: false, 기록ID: "", 날짜: null, 메모: "" };
  }
  const 유효함 = r => !(r.되돌림.length || r.제외 || r.대체됨 || r.중복);
  function 정렬키비교(a, b) {
    const da = a.날짜 || a.파일날짜 || 최소날, db = b.날짜 || b.파일날짜 || 최소날;
    if (da !== db) return da < db ? -1 : 1;
    if (a.순번 !== b.순번) return a.순번 - b.순번;
    return a.파일 < b.파일 ? -1 : a.파일 > b.파일 ? 1 : 0;
  }
  const 정렬 = (arr, cmp) => arr.slice().sort(cmp);   // 안정 정렬

  function 머리줄파싱(line) {
    const m = line.trim().match(/^\\?\[(.+?)\\?\]\s*(.*)$/);
    if (!m) return [null, {}];
    const 칸 = {};
    for (const 조각 of m[2].split(" / ")) {
      if (조각.includes(":")) { const [k, v] = 쪼개기1(조각, ":"); 칸[k.trim()] = v.trim(); }
      else if (조각.trim()) 칸[조각.trim()] = "";
    }
    return [m[1], 칸];
  }
  function 끝표시있음_md(lines) {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) return lines[i].trim().replace(/\\/g, "") === 끝표시_md;
    return false;
  }
  const 표줄파싱 = line => line.trim().replace(/^\|+|\|+$/g, "").split("|").map(c => c.trim());
  const 끝줄 = ln => ln.trim().replace(/\\/g, "") === 끝표시_md;

  function md읽기(r, text) {
    const lines = 줄나누기(text);
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) { r.되돌림.push("빈 파일"); return; }
    const [머리종류, 머리] = 머리줄파싱(lines[0]);
    r.머리 = 머리;
    r.끝표시 = 끝표시있음_md(lines);
    if (머리종류 === null) { r.되돌림.push("머리 줄 모양 아님"); return; }
    if (머리종류 !== r.종류) {
      if (칸검사종류.includes(r.종류)) r.되돌림.push("머리 줄 종류가 파일 이름과 다름: " + 머리종류);
      else r.규격밖.push(["머리 줄 종류", 머리종류]);
    }
    const 본문줄 = lines.slice(1).filter(ln => ln.trim() && !끝줄(ln));
    r.원문 = lines.slice(1).filter(ln => !끝줄(ln)).join("\n").trim();
    if (r.종류 === "공부기록") {
      for (const ln of 본문줄) {
        const 조각들 = ln.trim().startsWith("시작:") ? ln.split(" / ") : [ln];
        for (const 조각 of 조각들) {
          if (조각.includes(":")) { const [k, v] = 쪼개기1(조각, ":"); r.본문[k.trim()] = v.trim(); }
          else r.규격밖.push(["본문 줄", 조각.trim()]);
        }
      }
    } else if (r.종류 === "문제기록" || r.종류 === "이행") {
      const 표 = 본문줄.filter(ln => ln.includes("|")).map(표줄파싱);
      for (const ln of 본문줄.filter(ln => !ln.includes("|"))) r.규격밖.push(["본문 줄", ln.trim()]);
      const 기대칸 = r.종류 === "문제기록" ? 문제기록_줄칸 : 이행_줄칸;
      if (!표.length) { r.되돌림.push("표가 없음"); return; }
      if (표[0].join("\u0000") !== 기대칸.join("\u0000")) { r.되돌림.push("표 머리 칸이 다름: " + 표[0].join(" | ")); return; }
      표.slice(1).forEach((값들, idx) => {
        const i = idx + 1;
        if (값들.length !== 기대칸.length) { r.되돌림.push(i + "번째 줄 칸 개수 " + 값들.length + "(규격 " + 기대칸.length + ")"); return; }
        const o = {}; 기대칸.forEach((k, j) => { o[k] = 값들[j]; }); r.줄.push(o);
      });
    }
  }

  function json읽기(r, text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { r.되돌림.push("JSON 읽기 실패: " + 앞자르기(글정리(String(e.message)), 60)); return; }
    if (!d || typeof d !== "object" || Array.isArray(d)) { r.되돌림.push("JSON이 객체가 아님"); return; }
    r.끝표시 = d["끝표시"] === 끝표시_json;
    r.머리 = {};
    for (const k of Object.keys(d)) { const v = d[k]; if (!(Array.isArray(v) || (v && typeof v === "object"))) r.머리[k] = v; }
    if (json칸[r.종류]) {
      const 기대 = json칸[r.종류];
      const 빠진 = 기대.filter(k => !(k in d) && k !== "끝표시");
      if (빠진.length) r.되돌림.push("칸 빠짐: " + 빠진.join(", "));
      for (const k of Object.keys(d)) if (!기대.includes(k)) r.규격밖.push([k, 앞자르기(파이썬json(d[k]), 120)]);
      const 배열이름 = { "문제기록": "줄", "카드": "카드", "복습문제": "문제", "체력": "측정" }[r.종류];
      const 항목칸 = { "문제기록": 문제기록_줄칸, "카드": 카드_항목칸, "복습문제": 복습문제_항목칸, "체력": 체력_항목칸 }[r.종류];
      const 배열 = d[배열이름];
      if (배열 === undefined || 배열 === null) { /* 칸 빠짐으로 이미 셈 */ }
      else if (!Array.isArray(배열)) r.되돌림.push(배열이름 + " 칸이 배열이 아님");
      else {
        배열.forEach((it, idx) => {
          const i = idx + 1;
          if (!it || typeof it !== "object" || Array.isArray(it)) { r.되돌림.push(배열이름 + " " + i + "번째가 객체가 아님"); return; }
          const 빠진2 = 항목칸.filter(k => !(k in it));
          if (빠진2.length) { r.되돌림.push(배열이름 + " " + i + "번째 칸 빠짐: " + 빠진2.join(", ")); return; }
          for (const k of Object.keys(it)) if (!항목칸.includes(k)) r.규격밖.push([배열이름 + " " + i + "번째 " + k, 앞자르기(글정리(it[k]), 120)]);
          const o = {}; 항목칸.forEach(k => { o[k] = it[k]; }); r.줄.push(o);
        });
      }
    } else {
      r.원문 = text;
    }
  }

  // 파일 목록 [{이름, 내용}] → 기록 목록. 날짜하한(기본 2026-11-02) 이전 파일 이름은 읽지 않는다.
  function 기록읽기(파일들, 날짜하한, 시험포함, 규격밖전체) {
    const 기록들 = [];
    let 읽은파일 = 0, 옛파일 = 0;
    const 정렬된 = 파일들.slice().sort((a, b) => (a.이름 < b.이름 ? -1 : a.이름 > b.이름 ? 1 : 0));
    for (const f of 정렬된) {
      const 이름 = f.이름;
      const m = 이름.match(파일이름_re);
      if (!m) {
        const dm = 이름.match(/(\d{4})-?(\d{2})-?(\d{2})/);
        const d = dm ? 날짜로(dm[1] + "-" + dm[2] + "-" + dm[3]) : null;
        if (d !== null && d < 날짜하한) { 옛파일++; continue; }
        규격밖전체.push({ "파일": 이름, "칸": "파일 이름", "값": "규격 이름 모양 아님(읽지 않음)" });
        continue;
      }
      const 파일날짜 = 날짜로(m[2]);
      if (파일날짜 === null || 파일날짜 < 날짜하한) { 옛파일++; continue; }
      const r = 새기록(이름, m[1], 파일날짜, m[3], m[4], parseInt(m[5], 10), m[6]);
      읽은파일++;
      if (!모든종류.includes(r.종류)) { 규격밖전체.push({ "파일": 이름, "칸": "종류", "값": r.종류 + "(규격에 없는 종류, 읽지 않음)" }); continue; }
      if (typeof f.내용 !== "string") { r.되돌림.push("파일 읽기 실패: " + 글정리(f.오류 || "내용 없음")); 기록들.push(r); continue; }
      const text = f.내용.replace(/^﻿/, "");
      if (r.확장 === "md") md읽기(r, text); else json읽기(r, text);
      r.기록ID = 띄어(파이썬글(r.머리["기록ID"] === undefined ? "" : r.머리["기록ID"]));
      r.메모 = 띄어(파이썬글(r.머리["메모"] === undefined ? "" : r.머리["메모"]));
      r.날짜 = 날짜로(띄어(파이썬글(r.머리["날짜"] === undefined ? "" : r.머리["날짜"])));
      if (r.메모 === "연습" || (r.메모 === "시험" && !시험포함)) r.제외 = true;
      if (!r.끝표시) r.되돌림.push("끝표시 없음");
      if (칸검사종류.includes(r.종류)) 칸검사(r);
      else if (!r.기록ID) r.규격밖.push(["기록ID", "머리 줄에 없음"]);
      기록들.push(r);
    }
    return { 기록들, 읽은파일, 옛파일 };
  }

  function 칸검사(r) {
    if (r.확장 === "md") {
      const 기대머리 = { "공부기록": 공부기록_머리칸, "문제기록": 문제기록_머리칸, "이행": 이행_머리칸 }[r.종류];
      if (!기대머리) { r.되돌림.push("이 종류는 .json으로만 보낸다"); return; }
      const 빠진 = 기대머리.filter(k => !(k in r.머리));
      if (빠진.length) r.되돌림.push("머리 줄 칸 빠짐: " + 빠진.join(", "));
      for (const k of Object.keys(r.머리)) if (!기대머리.includes(k)) r.규격밖.push(["머리 줄 " + k, r.머리[k]]);
      if (r.종류 === "공부기록") {
        const 빠진2 = 공부기록_본문칸.filter(k => !(k in r.본문));
        if (빠진2.length) r.되돌림.push("본문 칸 빠짐: " + 빠진2.join(", "));
        for (const k of Object.keys(r.본문)) if (!공부기록_본문칸.includes(k)) r.규격밖.push(["본문 " + k, r.본문[k]]);
      }
    } else if (!json칸[r.종류]) { r.되돌림.push("이 종류는 .md로만 보낸다"); return; }
    if (Object.keys(r.머리).length) {
      if (!r.기록ID) r.되돌림.push("기록ID 없음");
      const d = 띄어(파이썬글(r.머리["날짜"] === undefined ? "" : r.머리["날짜"]));
      if (d && (!날짜_re.test(d) || 날짜로(d) === null)) r.되돌림.push("날짜 형식 아님: " + 글정리(d));
    }
    if (r.종류 === "문제기록") {
      r.줄.forEach((줄, idx) => {
        const i = idx + 1;
        if (!문제방향값.includes(줄["문제방향"])) r.규격밖.push([i + "번째 줄 문제방향", 줄["문제방향"]]);
        if (!결과값.includes(줄["결과"])) r.규격밖.push([i + "번째 줄 결과", 줄["결과"]]);
        if (!확신도값.includes(줄["확신도"])) r.규격밖.push([i + "번째 줄 확신도", 줄["확신도"]]);
        const 함정 = 파이썬글(줄["함정"]);
        if (함정 !== "-" && Array.from(함정.replace(/ /g, "").replace(/,/g, "").replace(/·/g, "")).some(ch => !함정기호.includes(ch)))
          r.규격밖.push([i + "번째 줄 함정", 함정]);
      });
    }
    if (r.종류 === "복습문제") {
      r.줄.forEach((줄, idx) => {
        const i = idx + 1;
        if (!복습문제종류.includes(줄["종류"])) r.규격밖.push([i + "번째 문제 종류", 글정리(줄["종류"])]);
        if (날짜로(파이썬글(줄["낼날짜"])) === null) r.되돌림.push(i + "번째 문제 낼날짜 형식 아님");
      });
    }
    if (r.종류 === "체력") {
      r.줄.forEach((줄, idx) => { if (!체력항목.includes(줄["항목"])) r.규격밖.push([(idx + 1) + "번째 측정 항목", 글정리(줄["항목"])]); });
    }
    if (r.종류 === "이행") {
      r.줄.forEach((줄, idx) => {
        const res = 파이썬글(줄["결과"]);
        if (!(res === "끝" || res.startsWith("못함"))) r.규격밖.push([(idx + 1) + "번째 줄 결과", res]);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. 지점목록·목표진도·지시사본
  // ---------------------------------------------------------------------------

  // 본부 폴더 파일 [{이름, 내용}] → 과목코드마다 지도판 큰 것 → 순번 큰 것(§4-1)
  function 지점목록읽기(본부파일들) {
    const 후보 = {};
    for (const f of 본부파일들) {
      const m = f.이름.match(지점목록_re);
      if (m) (후보[m[1]] = 후보[m[1]] || []).push({ ver: m[2], seq: parseInt(m[3], 10), f });
    }
    const 결과 = {};
    for (const code of Object.keys(후보)) {
      const lst = 후보[code].sort((a, b) => 판비교(a.ver, b.ver) || a.seq - b.seq || (a.f.이름 < b.f.이름 ? -1 : 1));
      const top = lst[lst.length - 1];
      const d = typeof top.f.내용 === "string" ? JSON.parse(top.f.내용.replace(/^﻿/, "")) : top.f.내용;
      const 칸 = d["칸"] || ["지점ID", "층", "종류", "표시", "장", "주제", "교재쪽"];
      const 지점 = {}, 순서 = [];
      for (const row of d["지점"] || []) {
        const it = {}; 칸.forEach((k, i) => { it[k] = row[i]; });
        const pid = it["지점ID"];
        if (!pid) continue;
        it["제외"] = 파이썬글(it["표시"] === undefined ? "" : it["표시"]).includes("제외(사용자)");
        it["교재범위"] = 파이썬글(it["종류"] === undefined ? "" : it["종류"]).includes("교재") && !it["제외"];
        if (!(pid in 지점)) 순서.push(pid);
        지점[pid] = it;
      }
      결과[code] = { 파일: top.f.이름, 지도판: top.ver, 지점, 순서, 분모: 순서.filter(p => 지점[p]["교재범위"]).length };
    }
    return 결과;
  }

  function 목표진도읽기(본부파일들) {
    const 후보 = [];
    for (const f of 본부파일들) { const m = f.이름.match(목표진도_re); if (m) 후보.push({ ver: m[1], seq: parseInt(m[2], 10), f }); }
    if (!후보.length) return { 파일: null, 쉬는날: new Set(), 과목: {} };
    후보.sort((a, b) => 판비교(a.ver, b.ver) || a.seq - b.seq || (a.f.이름 < b.f.이름 ? -1 : 1));
    const top = 후보[후보.length - 1];
    const d = typeof top.f.내용 === "string" ? JSON.parse(top.f.내용.replace(/^﻿/, "")) : top.f.내용;
    const 과목 = {};
    for (const code of Object.keys(d["과목"] || {})) {
      const it = d["과목"][code];
      과목[code] = { 시작: 날짜로(it["시작"] || ""), 끝: 날짜로(it["끝"] || ""), 분모: it["분모"] === undefined ? null : it["분모"],
        쉬는날: new Set((it["쉬는날"] || []).map(날짜로).filter(Boolean)) };
    }
    return { 파일: top.f.이름, 쉬는날: new Set((d["쉬는날"] || []).map(날짜로).filter(Boolean)), 과목 };
  }

  function 공부일수(시작, 끝, 쉬는날, 까지) {
    if (!시작 || !끝 || 끝 < 시작) return 0;
    const 마지막 = 까지 === undefined ? 끝 : (끝 < 까지 ? 끝 : 까지);
    if (마지막 < 시작) return 0;
    let n = 0;
    for (let d = 시작; d <= 마지막; d = 날더하기(d, 1)) if (!쉬는날.has(d)) n++;
    return n;
  }

  // 발신함 지시사본 [{이름, 내용}] → {지시ID: {규칙, 과목, 지점ID, 날짜}}
  function 지시사본읽기(발신파일들) {
    const 결과 = {};
    const 정렬된 = (발신파일들 || []).slice().sort((a, b) => (a.이름 < b.이름 ? -1 : 1));
    for (const f of 정렬된) {
      const m = f.이름.match(지시사본_re);
      if (!m || typeof f.내용 !== "string") continue;
      for (const ln of 줄나누기(f.내용)) {
        if (!ln.includes("|") || !ln.trim().startsWith("D-")) continue;
        const cols = 표줄파싱(ln);
        if (cols.length < 2) continue;
        const em = cols[1].replace(/\\/g, "").match(/^\[경보:([^|\]]+)\|([^|\]]+)\|([^\]]*)\]/);
        결과[cols[0]] = { 규칙: em ? em[1].trim() : "", 과목: em ? em[2].trim() : "", 지점ID: em ? em[3].trim() : "", 날짜: 날짜로(m[2]), 파일: f.이름 };
      }
    }
    return 결과;
  }

  // ---------------------------------------------------------------------------
  // 3. 계산
  // ---------------------------------------------------------------------------

  function 선형(값, x0, y0, x1, y1) {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const v = Math.min(Math.max(값, lo), hi);
    if (x1 === x0) return y1;
    return y0 + (v - x0) * (y1 - y0) / (x1 - x0);
  }
  function 체력점수(항목, 값) {
    const v = typeof 값 === "number" ? 값 : (String(값).trim() === "" ? NaN : Number(값));
    if (값 === null || 값 === undefined || typeof 값 === "boolean" || isNaN(v)) return null;
    const 단계 = 배점 => 선형(v, 1, 0, 4, 배점);
    const 표 = {
      "체중kg": () => 선형(v, 110, 0, 85, 100),
      "체지방kg": () => 선형(v, 40, 0, 18, 100),
      "근육kg": () => 선형(v, 35, 0, 45, 100),
      "축구리프팅개": () => Math.min(Math.max(v, 0), 50),
      "축구드리블자신감(1~5)": () => Math.min(Math.max(v, 0), 5) * 5,
      "축구슈팅자신감(1~5)": () => Math.min(Math.max(v, 0), 5) * 5,
      "배구토스연속": () => 선형(v, 0, 0, 50, 100),
      "농구자유투%": () => 선형(v, 0, 5, 90, 50),
      "농구드리블자신감합(10~50)": () => Math.min(Math.max(v, 0), 50),
      "체조핸드스프링(1~4)": () => 단계(40),
      "체조물구나무(1~4)": () => 단계(40),
      "체조앞구르기(1~4)": () => 단계(20),
      "체조뒤물구나무(1~4)": () => 단계(40),
      "체조백플립(1~4)": () => 단계(60),
      "수영IM초": () => 선형(v, 240, 0, 120, 100),
      "스쿼트kg": () => 선형(v, 60, 0, 140, 50),
      "데드리프트kg": () => 선형(v, 60, 0, 220, 50),
      "턱걸이개": () => 선형(v, 0, 0, 30, 50),
      "벤치kg": () => 선형(v, 0, 0, 100, 50),   // 스크립트와 같음(0kg = 0점 임시, 본부검수 모호함 13)
    };
    return 표[항목] ? 표[항목]() : null;
  }

  function 계산기(기록들, 지점목록, 목표진도, 지시사본, 오늘, 규격밖전체, 옵션) {
    const c = { 기록들, 지점목록, 목표진도, 지시사본, 오늘, 규격밖: 규격밖전체, 시험포함: !!옵션.시험포함,
      사람말: [], 되돌림: [], 빈순번: [], 빠짐: (옵션.빠짐 || []).slice(), 캐시: {} };

    c.기록과목 = r => 띄어(파이썬글(r.머리["과목"] === undefined ? r.코드 : r.머리["과목"])) || r.코드;
    c.사슬끝 = rid => { const 본 = new Set(); while (rid in c.고침 && !본.has(rid)) { 본.add(rid); rid = c.고침[rid]; } return rid; };
    c.지점있음 = (code, pid) => { const pl = c.지점목록[code]; return !!pl && pid in pl.지점; };
    const 내용키 = r => (정렬json(r.머리) + 정렬json(r.본문) + 정렬json(r.줄) + r.원문).replace(/\s+/g, " ").trim();

    // ---- 정리 ----
    c.고침 = {};
    for (const r of 기록들) { const m = r.메모.match(/^고침:\s*(\S+)/); if (m && r.기록ID) c.고침[m[1]] = r.기록ID; }
    for (const r of 기록들) if (r.기록ID in c.고침) r.대체됨 = true;
    const 그룹 = new Map();
    for (const r of 기록들) if (r.기록ID && !r.대체됨 && !r.제외) { if (!그룹.has(r.기록ID)) 그룹.set(r.기록ID, []); 그룹.get(r.기록ID).push(r); }
    for (const lst of 그룹.values()) {
      if (lst.length < 2) continue;
      const 내용들 = new Set(lst.map(내용키));
      if (내용들.size === 1) lst.slice(1).forEach(r => { r.중복 = true; });
      else lst.forEach(r => r.되돌림.push("ID 겹침, 내용 다름"));
    }
    const 기록ID들 = new Set(기록들.filter(r => r.기록ID).map(r => r.기록ID));
    for (const r of 기록들) {
      if (r.제외 || r.대체됨 || r.중복) continue;
      if (칸검사종류.includes(r.종류)) {
        지점검사(r);
        let 블록 = ["문제기록", "카드", "복습문제"].includes(r.종류) ? 띄어(파이썬글(r.머리["블록기록ID"] === undefined ? "-" : r.머리["블록기록ID"])) : "-";
        if (블록 && 블록 !== "-") { 블록 = c.사슬끝(블록); if (!기록ID들.has(블록)) r.되돌림.push("블록기록ID가 가리키는 공부기록 없음: " + 글정리(블록)); }
      }
    }
    for (const r of 기록들) {
      if (r.제외 || r.대체됨 || r.중복) continue;
      if (r.되돌림.length) c.되돌림.push({ "파일": r.파일, "까닭": r.되돌림.map(글정리).join("; ") });
      for (const [칸, 값] of r.규격밖) c.규격밖.push({ "파일": r.파일, "칸": 글정리(칸), "값": 글정리(값) });
    }
    const 순번들 = new Map();
    for (const r of 기록들) {
      if (r.제외) continue;
      const k = 키(r.날짜 || r.파일날짜, r.쓴곳);
      if (!순번들.has(k)) 순번들.set(k, new Set());
      순번들.get(k).add(r.순번);
    }
    const 순번키 = Array.from(순번들.keys()).sort((a, b) => { const A = JSON.parse(a), B = JSON.parse(b); return A[0] < B[0] ? -1 : A[0] > B[0] ? 1 : A[1] < B[1] ? -1 : A[1] > B[1] ? 1 : 0; });
    for (const k of 순번키) {
      const [d, 쓴곳] = JSON.parse(k); const s = 순번들.get(k); const mx = Math.max.apply(null, Array.from(s));
      for (let n = 1; n <= mx; n++) if (!s.has(n)) c.빈순번.push({ "쓴곳": d + " " + 쓴곳, "빠진번호": String(n).padStart(2, "0") });
    }

    function 지점검사(r) {
      const code = c.기록과목(r);
      if (!(code in c.지점목록) && r.종류 !== "이행" && r.종류 !== "체력") { r.규격밖.push(["과목", code + " (지점목록 없음, 지점ID 검사 못 함)"]); return; }
      const 없음 = [];
      const 보기 = (pid, 어디) => {
        pid = 띄어(파이썬글(pid));
        if (!pid || pid === "-") return;
        if (pid.startsWith("새개념:")) { c.사람말.push([r.파일, 어디, pid]); return; }
        if (!c.지점있음(code, pid)) 없음.push(pid);
      };
      if (r.종류 === "공부기록") {
        지점문자열(r.본문["지점"] === undefined ? "-" : r.본문["지점"]).forEach(p => 보기(p, "지점"));
        지점문자열(r.본문["미룸"] === undefined ? "-" : r.본문["미룸"]).forEach(p => 보기(p, "미룸"));
      } else if (["문제기록", "카드", "복습문제"].includes(r.종류)) r.줄.forEach(줄 => 보기(줄["지점ID"] === undefined ? "" : 줄["지점ID"], "지점ID"));
      if (없음.length) r.되돌림.push("지점ID 없음: " + Array.from(new Set(없음)).sort().join(", "));
    }

    // ---- 모으기 ----
    const 유효 = 기록들.filter(유효함);
    c.유효 = 유효;
    const 종류별 = k => 정렬(유효.filter(r => r.종류 === k), 정렬키비교);
    c.공부기록 = 종류별("공부기록"); c.문제기록 = 종류별("문제기록"); c.카드기록 = 종류별("카드");
    c.복습문제 = 종류별("복습문제"); c.체력기록 = 종류별("체력"); c.이행기록 = 종류별("이행");
    c.원문기록 = 정렬(유효.filter(r => 원문종류.includes(r.종류)), 정렬키비교);
    c.과목들 = Array.from(new Set(유효.filter(r => r.종류 !== "체력").map(c.기록과목).concat(Object.keys(c.지점목록)))).sort();
    c.줄들 = [];
    for (const r of c.문제기록) {
      const 블록 = c.사슬끝(띄어(파이썬글(r.머리["블록기록ID"] === undefined ? "-" : r.머리["블록기록ID"])));
      r.줄.forEach((줄, i) => {
        const 메모 = 띄어(파이썬글(줄["메모"] === undefined ? "-" : 줄["메모"]));
        if (진단제외메모.includes(메모) && !(메모 === "시험" && c.시험포함)) return;
        if (!결과값.includes(줄["결과"])) return;
        c.줄들.push({ 과목: c.기록과목(r), 날짜: r.날짜, 순번: r.순번, 번호: i, 기록ID: r.기록ID, 쓴곳: r.쓴곳, 블록, 메모,
          지점ID: 띄어(파이썬글(줄["지점ID"])), 문항ID: 띄어(파이썬글(줄["문항ID"])), 문제방향: 띄어(파이썬글(줄["문제방향"])),
          결과: 줄["결과"], O: 줄["결과"] === "O", 확신도: 띄어(파이썬글(줄["확신도"])), 함정: 함정글자(줄["함정"]),
          원인: 띄어(파이썬글(줄["원인"])), 원기록ID: 띄어(파이썬글(줄["원기록ID"])) });
      });
    }
    c.줄들.sort((a, b) => { const da = a.날짜 || 최소날, db = b.날짜 || 최소날; return da < db ? -1 : da > db ? 1 : (a.순번 - b.순번) || (a.번호 - b.번호); });
    for (const r of c.공부기록) { const 막힘 = r.본문["막힌 곳"] === undefined ? "-" : r.본문["막힌 곳"]; if (막힘 && 막힘 !== "-") c.사람말.push([r.파일, "막힌 곳", 막힘]); }
    for (const r of 유효) if (r.메모 && !메모정값.includes(r.메모) && !r.메모.startsWith("고침:")) c.사람말.push([r.파일, "메모", r.메모]);
    for (const r of c.문제기록) for (const 줄 of r.줄) { const m = 띄어(파이썬글(줄["메모"] === undefined ? "-" : 줄["메모"])); if (m && !메모정값.includes(m)) c.사람말.push([r.파일, "줄 메모", m]); }
    for (const r of c.원문기록) {
      c.사람말.push([r.파일, r.종류, r.원문.trim()]);
      const re = /새개념:[^\n]*/g; let m; while ((m = re.exec(r.원문))) c.사람말.push([r.파일, "새개념", m[0].trim()]);
    }

    // ---- 진도·미룸·다음 지점 ----
    c.본지점 = (code, 범위만) => {
      const s = new Set(); const pl = c.지점목록[code];
      for (const r of c.공부기록) {
        if (c.기록과목(r) !== code) continue;
        for (const pid of 지점문자열(r.본문["지점"] === undefined ? "-" : r.본문["지점"])) {
          if (!pl || !(pid in pl.지점) || pl.지점[pid]["제외"]) continue;
          if (범위만 && !pl.지점[pid]["교재범위"]) continue;
          s.add(pid);
        }
      }
      return Array.from(s);
    };
    c.미룸집합 = code => {
      const 미룸 = new Set();
      for (const r of c.공부기록) {
        if (c.기록과목(r) !== code) continue;
        for (const pid of 지점문자열(r.본문["지점"] === undefined ? "-" : r.본문["지점"])) 미룸.delete(pid);
        for (const pid of 지점문자열(r.본문["미룸"] === undefined ? "-" : r.본문["미룸"])) if (!pid.startsWith("새개념:")) 미룸.add(pid);
      }
      return Array.from(미룸);
    };
    c.목표 = (code, 날짜) => {
      날짜 = 날짜 || c.오늘;
      const it = c.목표진도.과목[code], pl = c.지점목록[code];
      if (!it || !pl || !it.시작 || !it.끝) return null;
      const 분모 = pl.분모;
      const 전체일 = 공부일수(it.시작, it.끝, it.쉬는날);
      const 지난일 = 공부일수(it.시작, it.끝, it.쉬는날, 날짜);
      if (전체일 === 0) return null;
      return { 목표: Math.trunc(분모 * 지난일 / 전체일), 하루: 분모 / 전체일, 기간안: it.시작 <= 날짜 && 날짜 <= it.끝, 시작: it.시작, 끝: it.끝 };
    };
    c.진도 = () => {
      const out = {}; const 전체 = { "본": 0, "분모": 0, "목표": 0, "차이p": 0.0, "차이일": 0.0 }; let 하루합 = 0;
      for (const code of c.과목들) {
        const pl = c.지점목록[code]; if (!pl) continue;
        const 본 = c.본지점(code, true).length, 분모 = pl.분모, t = c.목표(code);
        if (t === null) { out[code] = { "본": 본, "분모": 분모, "목표": "-", "차이p": "-", "차이일": "-" }; continue; }
        const 차이 = 본 - t.목표;
        out[code] = { "본": 본, "분모": 분모, "목표": t.목표, "차이p": 분모 ? 파이썬반올림(차이 / 분모 * 100, 1) : 0.0, "차이일": t.하루 ? 파이썬반올림(차이 / t.하루, 1) : 0.0 };
        전체["본"] += 본; 전체["분모"] += 분모; 전체["목표"] += t.목표; 하루합 += t.하루;
      }
      if (전체["분모"]) 전체["차이p"] = 파이썬반올림((전체["본"] - 전체["목표"]) / 전체["분모"] * 100, 1);
      if (하루합) 전체["차이일"] = 파이썬반올림((전체["본"] - 전체["목표"]) / 하루합, 1);
      return Object.assign({ "전체": 전체 }, out);
    };
    c.쪽범위 = (code, pids) => {
      const pl = c.지점목록[code]; const 권별 = new Map();
      for (const p of pids) {
        const m = 띄어(파이썬글(pl.지점[p]["교재쪽"] === undefined ? "" : pl.지점[p]["교재쪽"])).match(/^(\S+)\s+(\d+)/);
        if (!m) continue;
        if (!권별.has(m[1])) 권별.set(m[1], []); 권별.get(m[1]).push(parseInt(m[2], 10));
      }
      return Array.from(권별.entries()).map(([권, v]) => 권 + " " + Math.min.apply(null, v) + "~" + Math.max.apply(null, v)).join("; ") || "-";
    };
    c.복습대기 = () => {
      if (c.캐시.대기) return c.캐시.대기;
      const 풀음 = new Set(c.줄들.map(x => 키(x.원기록ID, x.문항ID, x.메모)));
      const 풀음2 = new Set(c.줄들.map(x => 키(x.원기록ID, x.문항ID)));
      const 대기 = [];
      for (const r of c.복습문제) for (const 줄 of r.줄) {
        if (풀음.has(키(r.기록ID, 파이썬글(줄["문항ID"]), 파이썬글(줄["종류"])))) continue;
        if (!다시내기메모.includes(파이썬글(줄["종류"])) && 풀음2.has(키(r.기록ID, 파이썬글(줄["문항ID"])))) continue;
        const d = 날짜로(파이썬글(줄["낼날짜"])); if (d === null) continue;
        대기.push({ 과목: c.기록과목(r), 기록ID: r.기록ID, 문항ID: 파이썬글(줄["문항ID"]), 지점ID: 파이썬글(줄["지점ID"]), 종류: 파이썬글(줄["종류"]), 낼날짜: d, 파일: r.파일, 문제: 줄 });
      }
      대기.sort((a, b) => (a.낼날짜 < b.낼날짜 ? -1 : a.낼날짜 > b.낼날짜 ? 1 : a.파일 < b.파일 ? -1 : a.파일 > b.파일 ? 1 : 0));
      c.캐시.대기 = 대기;
      return 대기;
    };
    c.오늘칸 = 진도 => {
      const 후보 = [];
      for (const code of c.과목들) { const t = c.목표(code); if (t === null) continue; 후보.push([code, t, (진도[code] || {})["차이일"] === undefined ? 0 : 진도[code]["차이일"]]); }
      const 기간안 = 후보.filter(x => x[1].기간안);
      let code, t;
      const 수 = v => (typeof v === "number" ? v : 0);
      if (기간안.length) { 기간안.sort((a, b) => (수(a[2]) - 수(b[2])) || (a[1].시작 < b[1].시작 ? -1 : a[1].시작 > b[1].시작 ? 1 : 0)); [code, t] = 기간안[0]; }
      else if (후보.length) {
        const 앞 = 후보.filter(x => x[1].시작 > c.오늘);
        if (앞.length) [code, t] = 정렬(앞, (a, b) => (a[1].시작 < b[1].시작 ? -1 : a[1].시작 > b[1].시작 ? 1 : 0))[0];
        else { const s = 정렬(후보, (a, b) => (a[1].끝 < b[1].끝 ? -1 : a[1].끝 > b[1].끝 ? 1 : 0)); [code, t] = s[s.length - 1]; }
      } else return { "과목": "-", "교재": "-", "지점처음": "-", "지점끝": "-", "첫일": { "글": "목표진도에 과목이 없음", "지점ID": "-" } };
      const pl = c.지점목록[code];
      const 본 = new Set(c.본지점(code, false)), 미룸 = new Set(c.미룸집합(code));
      const 남은 = pl.순서.filter(p => pl.지점[p]["교재범위"] && !본.has(p) && !미룸.has(p));
      const n = t.하루 ? Math.max(1, Math.ceil(파이썬반올림(t.하루 * 1000, 0) / 1000)) : 1;
      let 예정, 첫 = null;
      if (!남은.length) {
        const 남은미룸 = pl.순서.filter(p => 미룸.has(p) && pl.지점[p]["교재범위"]);
        if (남은미룸.length) { 예정 = 남은미룸.slice(0, n); 첫 = "미룸 지점 " + 남은미룸.length + "개 보기(1회독 범위 나머지 끝남)"; }
        else return { "과목": code, "교재": "-", "지점처음": "-", "지점끝": "-", "첫일": { "글": code + " 1회독 범위 지점을 모두 봄", "지점ID": "-" } };
      } else 예정 = 남은.slice(0, n);
      const 대기 = c.복습대기().filter(q => q.낼날짜 <= c.오늘 && q.과목 === code);
      if (첫 === null) 첫 = 대기.length ? "복습 문제 " + 대기.length + "개 풀기(스테이터스), 그다음 " + 예정[0] + "부터 읽기"
        : 예정[0] + "부터 읽기(" + (pl.지점[예정[0]]["교재쪽"] === undefined ? "-" : pl.지점[예정[0]]["교재쪽"]) + ")";
      return { "과목": code, "교재": c.쪽범위(code, 예정), "지점처음": 예정[0], "지점끝": 예정[예정.length - 1],
        "첫일": { "글": 글정리(첫), "지점ID": 대기.length ? 대기[0].지점ID : 예정[0] } };
    };

    // ---- 블록 확인 ----
    c.블록통과수 = 블록ID => {
      const 지점별 = new Map();
      for (const x of c.줄들) {
        if (x.블록 !== 블록ID) continue;
        if (!지점별.has(x.지점ID)) 지점별.set(x.지점ID, { 확인: false, 블록끝있음: false, 블록끝: false });
        const v = 지점별.get(x.지점ID); const 통 = x.O && x.확신도 === "확신";
        if (x.메모 === "블록끝") { v.블록끝있음 = true; v.블록끝 = v.블록끝 || 통; } else v.확인 = v.확인 || 통;
      }
      let n = 0; for (const v of 지점별.values()) if (v.확인 && v.블록끝있음 && v.블록끝) n++;
      return n;
    };
    c.확인남음블록 = () => {
      const out = {};
      for (const code of c.과목들) {
        let n = 0;
        for (const r of c.공부기록) if (c.기록과목(r) === code && c.블록통과수(r.기록ID) === 0) n++;
        if (c.공부기록.some(r => c.기록과목(r) === code) || code in c.지점목록) out[code] = n;
      }
      return out;
    };

    // ---- 숫자 ----
    c.줄통계 = 줄들 => {
      const 기출 = 줄들.filter(x => x.문제방향 === "특징→이름" || x.문제방향 === "오류고치기");
      const 확신 = 줄들.filter(x => x.확신도 === "확신"), 찍음 = 줄들.filter(x => x.확신도 === "찍음");
      const 다시 = 줄들.filter(x => 다시내기메모.includes(x.메모));
      return {
        "기출방향통과율": 비율(기출.filter(x => x.O).length, 기출.length),
        "확신정답률": 비율(확신.filter(x => x.O).length, 확신.length),
        "과신률": { "틀림": 확신.filter(x => !x.O).length, "전체": 확신.length },
        "찍음정답률": 비율(찍음.filter(x => x.O).length, 찍음.length),
        "다시내기통과율": 비율(다시.filter(x => x.O && x.확신도 === "확신").length, 다시.length),
      };
    };
    c.함정통계 = 줄들 => { const out = {}; for (const k of 함정기호) { const h = 줄들.filter(x => x.함정.includes(k)); out[k] = { "틀림": h.filter(x => !x.O).length, "전체": h.length }; } return out; };
    c.예측오차 = 기록목록 => {
      기록목록 = 기록목록 === undefined ? c.문제기록 : 기록목록;
      const 오차 = [];
      for (const r of 기록목록) {
        const m = 파이썬글(r.머리["예측"] === undefined ? "-" : r.머리["예측"]).match(/^\s*(\d+)\s*\/\s*(\d+)/);
        if (!m) continue;
        const 실제 = c.줄들.filter(x => x.기록ID === r.기록ID && x.O && ["-", "", "확인"].includes(x.메모)).length;
        오차.push(parseInt(m[1], 10) - 실제);
      }
      return { "평균": 오차.length ? 파이썬반올림(오차.reduce((a, b) => a + b, 0) / 오차.length, 2) : 0, "횟수": 오차.length };
    };
    c.메모별정답률 = 줄들 => { const out = {}; for (const k of 복습메모) { const h = 줄들.filter(x => x.메모 === k); out[k] = 비율(h.filter(x => x.O).length, h.length); } return out; };
    c.카드지점 = () => { const s = {}; for (const r of c.카드기록) for (const 줄 of r.줄) { const k = c.기록과목(r); (s[k] = s[k] || new Set()).add(띄어(파이썬글(줄["지점ID"]))); } return s; };
    c.카드대기 = () => {
      const 카드 = c.카드지점(); const out = {};
      for (const code of c.과목들) { const 본 = c.본지점(code, false); if (본.length || code in c.지점목록) out[code] = 본.filter(p => !(카드[code] && 카드[code].has(p))).length; }
      return out;
    };
    c.공부한날 = () => Array.from(new Set(c.공부기록.filter(r => r.날짜).map(r => r.날짜))).sort();
    c.근성과연속 = () => {
      const 날들 = new Set(c.공부한날()); const 쉬는날 = c.목표진도.쉬는날;
      if (!날들.size) return [0, 0];
      const 끝 = 날들.has(c.오늘) ? c.오늘 : 날더하기(c.오늘, -1);
      let d = Array.from(날들).sort()[0], 점수 = 0, 연속 = 0, 쉰연속 = 0; const 벌점 = [2, 5, 9, 14, 20, 27];
      while (d <= 끝) {
        if (쉬는날.has(d) && !날들.has(d)) { /* 건너뜀 */ }
        else if (날들.has(d)) { 쉰연속 = 0; 연속++; 점수 += 연속 === 1 ? 0 : 연속 <= 7 ? 1 : 연속 <= 14 ? 2 : 3; }
        else { 연속 = 0; 쉰연속++; 점수 -= 쉰연속 <= 6 ? 벌점[쉰연속 - 1] : 35; }
        d = 날더하기(d, 1);
      }
      return [Math.max(0, 점수), 연속];
    };
    c.체력 = () => {
      const 최근 = {};
      for (const r of c.체력기록) for (const 줄 of r.줄) if (체력항목.includes(줄["항목"])) 최근[줄["항목"]] = 줄["값"];
      let 합 = 0;
      for (const k of Object.keys(최근)) { const p = 체력점수(k, 최근[k]); if (p !== null) 합 += p; }
      return [Math.trunc(합 + 0.5), 최근];
    };
    c.스탯 = (다시통과, 다시실패) => {
      let 지력 = 0; for (const code of c.과목들) 지력 += c.본지점(code, false).length;
      let 메타 = 0;
      for (const x of c.줄들) { if (x.확신도 === "확신") 메타 += x.O ? 1 : -2; else if (x.확신도 === "찍음") 메타 += x.O ? -1 : 0; }
      const 기억 = 다시통과 - 다시실패;   // Anki 부분은 스크립트만(규격 §1-8)
      const [근성, 연속] = c.근성과연속(); c.연속공부일 = 연속;
      const [체력] = c.체력();
      const 함정내성 = {};
      for (const k of 함정기호) 함정내성[k] = Math.max(0, c.줄들.filter(x => x.함정.includes(k)).reduce((s, x) => s + (x.O ? 1 : -1), 0));
      함정내성["전체"] = Math.max(0, c.줄들.filter(x => x.함정.length).reduce((s, x) => s + (x.O ? 1 : -1), 0));
      const 정확도 = {};
      for (const k of 정확도방향) 정확도[k] = Math.max(0, c.줄들.filter(x => x.문제방향 === k).reduce((s, x) => s + (x.O ? 1 : -1), 0));
      정확도["전체"] = Math.max(0, c.줄들.reduce((s, x) => s + (x.O ? 1 : -1), 0));
      return { "지력": Math.floor(지력 / 30), "메타인지": Math.max(0, 메타), "기억력": Math.max(0, 기억), "근성": 근성, "체력": 체력, "함정내성": 함정내성, "정확도": 정확도 };
    };

    // ---- 경보 ----
    c.긴급 = (창일수, 기준) => {
      기준 = 기준 || c.오늘; const 시작 = 날더하기(기준, -(창일수 - 1)); const out = [];
      const 창 = x => x.날짜 !== null && 시작 <= x.날짜 && x.날짜 <= 기준;
      const 지점별 = new Map();
      for (const x of c.줄들) { const k = 키(x.과목, x.지점ID); if (!지점별.has(k)) 지점별.set(k, []); 지점별.get(k).push(x); }
      for (const [k, lst] of 지점별) {
        const [code, pid] = JSON.parse(k);
        for (let i = 0; i + 1 < lst.length; i++) { const a = lst[i], b = lst[i + 1];
          if (!a.O && !b.O && 창(b)) out.push({ "규칙": "① 같은 지점 2회 연속 틀림", "과목": code, "지점ID": pid, "기록ID": b.기록ID, "글": a.문항ID + " · " + b.문항ID + " 두 번 틀림(" + a.날짜 + ", " + b.날짜 + ")" }); }
      }
      for (const x of c.줄들) if (다시내기메모.includes(x.메모) && !x.O && 창(x))
        out.push({ "규칙": "② 다시 내기 실패", "과목": x.과목, "지점ID": x.지점ID, "기록ID": x.기록ID, "글": x.메모 + " " + x.문항ID + " 결과 " + x.결과 });
      const 날별 = new Map(), 첫기록 = new Map();
      for (const x of c.줄들) if (x.확신도 === "확신" && !x.O && 창(x)) { const k = 키(x.과목, x.날짜); 날별.set(k, (날별.get(k) || 0) + 1); if (!첫기록.has(k)) 첫기록.set(k, x.기록ID); }
      for (const [k, n] of 날별) if (n >= 3) { const [code, d] = JSON.parse(k); out.push({ "규칙": "③ 확신 오답 하루 3개↑", "과목": code, "지점ID": "-", "기록ID": 첫기록.get(k), "글": d + " 확신 오답 " + n + "개" }); }
      for (const code of c.끝난과목()) {
        const 본 = new Set();
        for (const x of c.줄들.filter(y => y.과목 === code)) if (!x.O) {
          if (본.has(x.지점ID) && 창(x)) out.push({ "규칙": "④ 1회독 끝난 과목 재오답", "과목": code, "지점ID": x.지점ID, "기록ID": x.기록ID, "글": x.문항ID + " 다시 틀림" });
          본.add(x.지점ID);
        }
      }
      return out;
    };
    c.끝난과목 = () => {
      if (c.캐시.끝난) return c.캐시.끝난;
      const out = []; const 확인남음 = c.확인남음블록();
      for (const code of Object.keys(c.지점목록)) { const pl = c.지점목록[code];
        if (pl.분모 && c.본지점(code, true).length >= pl.분모 && !c.미룸집합(code).length && (확인남음[code] || 0) === 0) out.push(code); }
      c.캐시.끝난 = out; return out;
    };
    c.공부없는날연속 = () => {
      const 시작들 = Object.values(c.목표진도.과목).map(it => it.시작).filter(Boolean);
      if (!시작들.length) return null;
      const 시작 = 시작들.sort()[0]; const 날들 = new Set(c.공부한날()); const 쉬는날 = c.목표진도.쉬는날;
      let d = 날더하기(c.오늘, -1); const 없는 = [];
      while (없는.length < 2 && d >= 시작) {
        if (쉬는날.has(d)) { d = 날더하기(d, -1); continue; }
        if (날들.has(d)) return null;
        없는.push(d); d = 날더하기(d, -1);
      }
      return 없는.length === 2 ? 없는 : null;
    };
    const 퍼센트0 = v => String(파이썬반올림(v, 0));   // "%.0f"
    c.경보 = 기준 => {
      기준 = 기준 || c.오늘; const out = [];
      const 안 = (x, a, b) => x.날짜 !== null && a <= x.날짜 && x.날짜 <= b;
      const a2 = 날더하기(기준, -13), b2 = 기준, a1 = 날더하기(기준, -6), b1 = 기준;
      const 전a = 날더하기(기준, -13), 전b = 날더하기(기준, -7);
      const 줄2 = c.줄들.filter(x => 안(x, a2, b2)), 줄1 = c.줄들.filter(x => 안(x, a1, b1)), 줄전 = c.줄들.filter(x => 안(x, 전a, 전b));
      for (const k of 함정기호) { const h = 줄2.filter(x => x.함정.includes(k));
        if (h.length >= 5) { const 틀 = h.filter(x => !x.O).length; if (틀 / h.length >= 0.30) out.push({ "규칙": "함정별 2주 오답률 30%↑", "과목": "-", "지점ID": "-", "기록ID": "-", "글": k + " " + 틀 + "/" + h.length }); } }
      const 이번확신 = 줄1.filter(x => x.확신도 === "확신"), 전확신 = 줄전.filter(x => x.확신도 === "확신");
      if (줄1.length >= 10 && 줄전.length >= 10 && 이번확신.length && 전확신.length) {
        const 이번 = 이번확신.filter(x => x.O).length / 이번확신.length * 100, 전 = 전확신.filter(x => x.O).length / 전확신.length * 100;
        if (전 - 이번 >= 10) out.push({ "규칙": "확신 정답률 전주 대비 10%p↓", "과목": "-", "지점ID": "-", "기록ID": "-", "글": "전주 " + 퍼센트0(전) + "% → 이번 주 " + 퍼센트0(이번) + "%" });
      }
      const 확신2 = 줄2.filter(x => x.확신도 === "확신");
      if (줄2.length >= 10 && 확신2.length) { const 과신 = 확신2.filter(x => !x.O).length / 확신2.length * 100; if (과신 >= 15) out.push({ "규칙": "과신률 15%↑(2주)", "과목": "-", "지점ID": "-", "기록ID": "-", "글": 퍼센트0(과신) + "%" }); }
      const 찍음2 = 줄2.filter(x => x.확신도 === "찍음");
      if (줄2.length >= 10 && 찍음2.length) { const 율 = 찍음2.filter(x => x.O).length / 찍음2.length * 100; if (율 >= 50) out.push({ "규칙": "찍음 정답률 50%↑(2주)", "과목": "-", "지점ID": "-", "기록ID": "-", "글": 퍼센트0(율) + "%" }); }
      const 장별 = new Map();
      for (const x of 줄1) if (!x.O) { const pl = c.지점목록[x.과목]; if (pl && x.지점ID in pl.지점) { const k = 키(x.과목, pl.지점[x.지점ID]["장"] === undefined ? "-" : pl.지점[x.지점ID]["장"]); 장별.set(k, (장별.get(k) || 0) + 1); } }
      for (const [k, n] of 장별) if (n >= 3) { const [code, 장] = JSON.parse(k); out.push({ "규칙": "같은 장 오답 3↑(1주)", "과목": code, "지점ID": "-", "기록ID": "-", "글": 장 + " 오답 " + n }); }
      const 오차 = c.예측오차(c.문제기록.filter(r => r.날짜 && a2 <= r.날짜 && r.날짜 <= b2));
      if (오차["횟수"] && Math.abs(오차["평균"]) >= 3) out.push({ "규칙": "예측 오차 평균 ±3↑(2주)", "과목": "-", "지점ID": "-", "기록ID": "-", "글": "평균 " + 파이썬수(오차["평균"]) + "(" + 오차["횟수"] + "회)" });
      for (const code of c.과목들) {
        const t = c.목표(code, 기준); if (t === null || !t.기간안) continue;
        let 본 = c.본지점(code, true).length;
        if (기준 !== c.오늘) {
          const s = new Set();
          for (const r of c.공부기록) if (c.기록과목(r) === code && r.날짜 && r.날짜 <= 기준)
            for (const p of 지점문자열(r.본문["지점"] === undefined ? "-" : r.본문["지점"])) if (c.지점있음(code, p) && c.지점목록[code].지점[p]["교재범위"]) s.add(p);
          본 = s.size;
        }
        if (t.하루 && (본 - t.목표) / t.하루 <= -3) out.push({ "규칙": "진도 목표보다 3일↑ 뒤짐", "과목": code, "지점ID": "-", "기록ID": "-", "글": "차이일 " + 파이썬반올림((본 - t.목표) / t.하루, 1).toFixed(1) });
      }
      return out;
    };
    c.주의 = (미룸, 체력, 카드대기) => {
      const out = []; const 지점별 = new Map();
      for (const x of c.줄들) if (x.확신도 === "애매" && !x.O) { const k = 키(x.과목, x.지점ID); 지점별.set(k, (지점별.get(k) || 0) + 1); }
      for (const [k, n] of 지점별) if (n >= 2) { const [code, pid] = JSON.parse(k); out.push({ "규칙": "애매 오답 2회(같은 지점)", "과목": code, "지점ID": pid, "기록ID": "-", "글": n + "회" }); }
      for (const code of Object.keys(미룸)) if (미룸[code] >= 20) out.push({ "규칙": "미룸 20↑", "과목": code, "지점ID": "-", "기록ID": "-", "글": 미룸[code] + "개" });
      const 카드날 = new Map(), 본카드 = new Set();
      for (const r of c.카드기록) for (const 줄 of r.줄) { const cid = 파이썬글(줄["카드ID"]); if (!본카드.has(cid)) { 본카드.add(cid); 카드날.set(r.날짜, (카드날.get(r.날짜) || 0) + 1); } }
      if (Object.values(카드대기).some(n => n > 0)) {
        const 공부날 = c.공부한날().filter(d => d <= c.오늘);
        if (공부날.length >= 3 && 공부날.slice(-3).every(d => (카드날.get(d) || 0) < 45))
          out.push({ "규칙": "카드 45장 3일 연속 미달", "과목": "-", "지점ID": "-", "기록ID": "-", "글": 공부날.slice(-3).map(d => d + " " + (카드날.get(d) || 0) + "장").join(", ") });
      }
      if (c.체력기록.length && 체력 < 30) out.push({ "규칙": "체력 30 아래", "과목": "FIT", "지점ID": "-", "기록ID": "-", "글": "체력 " + 체력 });
      const 밀림 = c.복습대기().filter(q => q.낼날짜 < c.오늘);
      if (밀림.length >= 10) out.push({ "규칙": "밀린 복습 문제 10개↑", "과목": "-", "지점ID": "-", "기록ID": "-", "글": 밀림.length + "개" });
      return out;
    };
    c.누적판독 = (긴급14, 경보지금) => {
      const 까닭 = [];
      if (긴급14.length >= 6) 까닭.push("① 2주 긴급 " + 긴급14.length + "건");
      const 과목별 = new Map(); for (const e of 긴급14) 과목별.set(e["과목"], (과목별.get(e["과목"]) || 0) + 1);
      for (const [code, n] of 과목별) if (n >= 3 && code !== "-") 까닭.push("② " + code + " 2주 긴급 " + n + "건");
      const 이행날 = new Map();
      for (const r of c.이행기록) for (const 줄 of r.줄) if (파이썬글(줄["결과"]) === "끝") 이행날.set(띄어(파이썬글(줄["지시ID"])), r.날짜);
      for (const [지시ID, d] of 이행날) {
        const info = c.지시사본[지시ID]; if (!info || !info.규칙 || d === null) continue;
        let 재발 = 0; let 기준 = 날더하기(d, ((6 - 요일(d)) % 7) || 7);
        while (기준 <= c.오늘) { if (c.경보(기준).some(e => e["규칙"].startsWith(info.규칙) && (e["과목"] === info.과목 || e["과목"] === "-"))) 재발++; 기준 = 날더하기(기준, 7); }
        if (재발 >= 2) 까닭.push("③ " + 지시ID + " 이행 뒤 '" + info.규칙 + "' " + 재발 + "회 재발");
      }
      if (경보지금.length > 7 && c.경보(날더하기(c.오늘, -7)).length > 7) 까닭.push("④ 주간 경보 2주 연속 7 초과");
      const 둘다 = lst => lst.some(e => e["규칙"].startsWith("진도 목표보다")) && lst.some(e => e["규칙"].startsWith("확신 정답률"));
      if (둘다(경보지금) && 둘다(c.경보(날더하기(c.오늘, -7)))) 까닭.push("⑤ 진도 뒤짐+확신 정답률 하락 2주 동시");
      for (const code of c.끝난과목()) {
        const 재오답 = new Set(), 본 = new Set();
        for (const x of c.줄들.filter(y => y.과목 === code)) if (!x.O) { if (본.has(x.지점ID)) 재오답.add(x.지점ID); 본.add(x.지점ID); }
        if (재오답.size >= 10) 까닭.push("⑥ " + code + " 재오답 지점 " + 재오답.size);
      }
      return 까닭;
    };

    // ---- 전체 ----
    c.상태 = (기준시각, 포함기록수) => {
      const 진도 = c.진도();
      const 미룸 = {};
      for (const code of c.과목들) if (code in c.지점목록 || c.공부기록.some(r => c.기록과목(r) === code)) 미룸[code] = c.미룸집합(code).length;
      const 확인남음 = c.확인남음블록();
      const 통계 = c.줄통계(c.줄들);
      const 다시 = c.줄들.filter(x => 다시내기메모.includes(x.메모));
      const 스탯 = c.스탯(다시.filter(x => x.O && x.확신도 === "확신").length, 다시.filter(x => !x.O).length);
      const 카드대기 = c.카드대기();
      const 어제 = 날더하기(c.오늘, -1);
      const 어제기록 = c.유효.filter(r => r.날짜 === 어제).length;
      const 긴급 = c.긴급(7);
      const 없는날 = c.공부없는날연속();
      if (없는날) 긴급.push({ "규칙": "⑤ 공부기록 없는 날 2일 연속", "과목": "-", "지점ID": "-", "기록ID": "-", "글": 없는날.slice().sort().join(", ") });
      if (c.빠짐.length || c.되돌림.length) 긴급.push({ "규칙": "⑤ 빠짐·되돌림 1개↑", "과목": "-", "지점ID": "-", "기록ID": "-", "글": "되돌림 " + c.되돌림.length + "건, 빠짐 " + c.빠짐.length + "건" });
      const 경보 = c.경보();
      const 주의 = c.주의(미룸, 스탯["체력"], 카드대기);
      c.누적까닭 = c.누적판독(c.긴급(14), 경보);
      const 어제복습오답 = c.줄들.filter(x => x.날짜 === 어제 && ["확인", "다시 내기 24시간", "다시 내기 1주", "주간복습", "변형"].includes(x.메모) && !x.O)
        .map(x => ({ "과목": x.과목, "지점ID": x.지점ID, "문항ID": x.문항ID }));
      const 창시작 = 날더하기(c.오늘, -27);
      const 숫자 = Object.assign({}, 통계);
      delete 숫자["다시내기통과율"];
      숫자["예측오차"] = c.예측오차();
      숫자["다시내기통과율"] = 통계["다시내기통과율"];
      숫자["함정4주"] = c.함정통계(c.줄들.filter(x => x.날짜 && 창시작 <= x.날짜 && x.날짜 <= c.오늘));
      숫자["함정전체"] = c.함정통계(c.줄들);
      숫자["메모별정답률"] = c.메모별정답률(c.줄들);
      숫자["카드대기"] = 카드대기;
      숫자["Anki유지율"] = "-";               // 스크립트만(규격 §1-8). 화면은 상태.json 값을 보인다
      숫자["연속공부일"] = c.연속공부일;
      숫자["어제기록"] = 어제기록;
      const 지도판 = {}, 지점목록파일 = {};
      for (const code of Object.keys(c.지점목록).sort()) { 지도판[code] = c.지점목록[code].지도판; 지점목록파일[code] = c.지점목록[code].파일; }
      return {
        "종류": "상태", "날짜": c.오늘, "기준시각": 기준시각, "규격판": 규격판, "지도판": 지도판, "지점목록": 지점목록파일,
        "시험까지": 날차이(시험예정일, c.오늘), "오늘": c.오늘칸(진도), "진도": 진도, "미룸": 미룸, "확인남음블록": 확인남음,
        "숫자": 숫자, "스탯": 스탯,
        "경보": { "긴급": 긴급, "경보": 경보, "주의": 주의, "누적판독": c.누적까닭.length > 0 },
        "놓침": { "빠짐": c.빠짐, "되돌림": c.되돌림, "빈순번": c.빈순번 },
        "규격밖": c.규격밖, "어제복습오답": 어제복습오답, "포함기록수": 포함기록수, "끝표시": 끝표시_json,
      };
    };
    return c;
  }

  function 파이썬수(v) { return Number.isInteger(v) ? v.toFixed(1) : String(v); }   // str(float)

  // ---------------------------------------------------------------------------
  // 바깥에 내놓는 함수
  // ---------------------------------------------------------------------------

  // 입력: {수신함: [{이름, 내용}], 본부: [{이름, 내용}](지점목록·목표진도), 발신함: [{이름, 내용}](지시사본, 없어도 됨)}
  // 옵션: {오늘: 'YYYY-MM-DD', 시험포함: bool, 날짜하한: 'YYYY-MM-DD'(기본 2026-11-02), 빠짐: [](상태.json 놓침.빠짐), 기준시각}
  // 출력: {상태(§9-3 모양), 계산기(화면용 중간값: 줄들·복습대기·카드기록 등), 읽은파일, 옛파일}
  function 상태만들기(입력, 옵션) {
    옵션 = 옵션 || {};
    const 오늘 = 날짜로(옵션.오늘);
    if (!오늘) throw new Error("오늘 날짜 형식이 아님: " + 옵션.오늘);
    const 규격밖전체 = [];
    const { 기록들, 읽은파일, 옛파일 } = 기록읽기(입력.수신함 || [], 옵션.날짜하한 || 첫기록일, !!옵션.시험포함, 규격밖전체);
    const 지점목록 = 지점목록읽기(입력.본부 || []);
    const 목표진도 = 목표진도읽기(입력.본부 || []);
    for (const code of Object.keys(목표진도.과목)) {
      const it = 목표진도.과목[code];
      if (지점목록[code] && it.분모 !== null && it.분모 !== 지점목록[code].분모)
        규격밖전체.push({ "파일": 목표진도.파일, "칸": "분모 " + code, "값": it.분모 + " (지점목록 " + 지점목록[code].파일 + "로 셈 " + 지점목록[code].분모 + "와 다름)" });
    }
    const 지시사본 = 지시사본읽기(입력.발신함 || []);
    const c = 계산기(기록들, 지점목록, 목표진도, 지시사본, 오늘, 규격밖전체, 옵션);
    const 상태 = 글값정리(c.상태(옵션.기준시각 || "-", c.유효.length));
    return { 상태, 계산기: c, 읽은파일, 옛파일 };
  }

  // 과목 하나만 본 §8 숫자(상태창 과목 고르기). 스탯은 사람 하나의 값이라 과목으로 나누지 않는다.
  function 과목숫자(c, code) {
    const 줄들 = c.줄들.filter(x => x.과목 === code);
    const 통계 = c.줄통계(줄들);
    const 창시작 = 날더하기(c.오늘, -27);
    return Object.assign({}, 통계, {
      "예측오차": c.예측오차(c.문제기록.filter(r => c.기록과목(r) === code)),
      "함정4주": c.함정통계(줄들.filter(x => x.날짜 && 창시작 <= x.날짜 && x.날짜 <= c.오늘)),
      "함정전체": c.함정통계(줄들),
      "메모별정답률": c.메모별정답률(줄들),
    });
  }

  return { 상태만들기, 과목숫자, 체력점수, 날짜로, 날더하기, 날차이, 요일, 글정리, 파일이름_re, 지점목록_re, 목표진도_re,
    체력항목, 함정기호, 첫기록일, 규격판, 끝표시_json, 끝표시_md };
});
