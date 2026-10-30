// 규격 v2.5 기준
// grade.js — 복습 문제 채점(순수 함수). 정의: 07_재설계\학습방식_합의안_v3_2026-10-26.md §2-2(채점 순서 ⑴~⑷·통일 규칙), §4(입력 모양).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.채점 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const 확신도낱말 = ["확신", "애매", "찍음"];

  // ⑴ 입력의 마지막 낱말이 확신도면 떼어 낸다(합의안 §4). `10 / 확신` → 답 `10 /`(그대로 둠, §9 4주 뒤 확인)
  function 확신도떼기(입력) {
    const 글 = String(입력 == null ? "" : 입력).trim();
    const m = 글.match(/^(.*?)\s*(확신|애매|찍음)$/);
    if (m && m[1] !== "" && /\s$/.test(글.slice(0, 글.length - m[2].length))) return { 답: m[1].trim(), 확신도: m[2] };
    return { 답: 글, 확신도: null };
  }

  // ⑵ 정답 → 후보 목록(대표답 + 인정표기). `(추정)`을 뗀다
  function 후보목록(정답) {
    let 글 = String(정답 == null ? "" : 정답).trim().replace(/\s*\(추정\)\s*$/, "").trim();
    const 후보 = [];
    const i = 글.indexOf("(=");
    if (i >= 0) {
      const j = 글.indexOf(")", i);
      const 안 = 글.slice(i + 2, j < 0 ? 글.length : j);
      후보.push(글.slice(0, i).trim());
      for (const x of 안.split(/[,，]/)) if (x.trim()) 후보.push(x.trim());
    } else 후보.push(글);
    return 후보.filter(x => x !== "");
  }

  // ⑶ 통일 규칙(지우는 것이 아니라 한 가지로 맞춤). 부호 `-`·소수점·단위는 지우지 않는다
  function 통일(s) {
    let t = String(s);
    t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, " ");   // 전각 → 반각
    t = t.replace(/²/g, "^2").replace(/³/g, "^3");
    t = t.toLowerCase();                                       // 영문 대소문자 통일
    t = t.replace(/(^|[^a-z])x(?=[^a-z]|$)/g, "$1×");          // 낱말 밖의 x만 단위 곱(띄어쓰기를 지우기 전에 본다. max의 x는 둠)
    t = t.replace(/\s+/g, "");                                 // 띄어쓰기 제거
    t = t.replace(/[−–‒‐‑—]/g, "-");                          // 하이픈 종류
    while (/\d,\d/.test(t)) t = t.replace(/(\d),(\d)/g, "$1$2");   // 숫자 속 쉼표
    t = t.replace(/[·・ㆍ∙⋅*]/g, "×");                         // 단위 곱
    t = t.replace(/([a-z])(\d)/g, "$1^$2").replace(/\^\^/g, "^");   // 단위 속 숫자는 ^ (m2 → m^2)
    t = t.replace(/[.。]+$/, "");                               // 끝 마침표
    return t;
  }
  const 배열답_re = /^[ㄱ-ㅎ](-[ㄱ-ㅎ])+$/;

  // 채점: 입력 글·정답 칸 → {결과: "O"|"X", 답, 확신도(입력 끝 낱말, 없으면 null), 후보}
  function 채점하기(입력, 정답) {
    const { 답, 확신도 } = 확신도떼기(입력);
    const 후보 = 후보목록(정답);
    const 내 = 통일(답);
    let 맞음 = false;
    if (내 !== "") {
      for (const h of 후보) {
        const 정 = 통일(h);
        if (정 === 내) { 맞음 = true; break; }
        if (배열답_re.test(정) && 정.replace(/-/g, "") === 내) { 맞음 = true; break; }   // 배열 답만 하이픈 없는 것도 인정
      }
    }
    return { 결과: 맞음 ? "O" : "X", 답, 확신도, 후보 };
  }

  return { 채점하기, 확신도떼기, 후보목록, 통일, 확신도낱말 };
});
