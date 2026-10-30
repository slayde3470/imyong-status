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
      // 닫는 괄호는 짝을 세어 찾는다(`음의 일 (=음(-)의 일, negative work)`)
      let 깊이 = 0, j = -1;
      for (let k = i; k < 글.length; k++) {
        if (글[k] === "(") 깊이++;
        else if (글[k] === ")" && --깊이 === 0) { j = k; break; }
      }
      const 안 = 글.slice(i + 2, j < 0 ? 글.length : j);
      후보.push(글.slice(0, i).trim());
      // 쉼표로 가르되 숫자 사이 쉼표(`1,200 W`)는 가르지 않는다
      for (const x of 안.split(/(?<!\d)[,，]|[,，](?!\d)/)) if (x.trim()) 후보.push(x.trim());
    } else 후보.push(글);
    return 후보.filter(x => x !== "");
  }

  // ⑶ 통일 규칙(지우는 것이 아니라 한 가지로 맞춤). 부호 `-`·소수점·단위는 지우지 않는다
  function 통일(s) {
    let t = String(s);
    t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, " ");   // 전각 → 반각
    t = t.replace(/[㎏㎎㎝㎜㎞㎡㎥ℓ㎖℃㎉₀₁₂₃₄]/g, ch => 낱글자[ch]);   // 낱글자 표(NFKC는 ㄱ·㉡을 깨뜨려 쓰지 않음)
    t = t.replace(/²/g, "^2").replace(/³/g, "^3");
    t = t.toLowerCase();                                       // 영문 대소문자 통일
    t = t.replace(/(^|[^a-z])x(?=[^a-z]|$)/g, "$1×");          // 낱말 밖의 x만 단위 곱(띄어쓰기를 지우기 전에 본다. max의 x는 둠)
    t = t.replace(/\s+/g, "");                                 // 띄어쓰기 제거
    t = t.replace(/[−–‒‐‑—]/g, "-");                          // 하이픈 종류
    while (/\d,\d/.test(t)) t = t.replace(/(\d),(\d)/g, "$1$2");   // 숫자 속 쉼표
    t = t.replace(/[·・ㆍ∙⋅*]/g, "×");                         // 단위 곱
    t = t.replace(/([a-z])(\d)/g, "$1^$2").replace(/\^\^/g, "^");   // 단위 속 숫자는 ^ (m2 → m^2)
    t = t.replace(/(\d)[~∼〜～-](?=\.?\d)/g, "$1~");            // 범위 기호(숫자 사이만. 부호 -10·KR-20·ㄷ-ㄱ-ㄴ은 그대로)
    t = t.replace(/^(\d[\d.]*)%~/, "$1~");                     // 범위 앞쪽 단위 생략 50%~60% = 50~60%
    t = t.replace(/(^|[^\d.])\.(\d)/g, "$10.$2");              // 소수 앞 0: .85 = 0.85
    t = t.replace(/([a-z])\.([a-z])/g, "$1×$2");               // 영문 사이 점: kg.m/s = kg·m/s
    t = t.replace(/[.。]+$/, "");                               // 끝 마침표
    if (/^[ㄱ-ㅎ]([,→>·][ㄱ-ㅎ])+$/.test(t)) t = t.replace(/[,→>·]/g, "-");   // 배열 답 구분 기호
    return t;
  }
  const 낱글자 = { "㎏": "kg", "㎎": "mg", "㎝": "cm", "㎜": "mm", "㎞": "km", "㎡": "m^2", "㎥": "m^3", "ℓ": "l", "㎖": "ml", "℃": "°c", "㎉": "kcal", "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4" };
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
