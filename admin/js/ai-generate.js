/**
 * ai-generate.js — Groq API를 이용한 AI 문제 자동 생성
 */

import { getPdfText } from './pdf.js';

/** 마지막으로 생성된 문제 배열 */
let _generatedQs = [];
export function getGeneratedQs() { return _generatedQs; }

/** 진행 바 UI 업데이트 */
function setProgress(show, step = '', pct = 0) {
  document.getElementById('gen-prog').style.display = show ? 'block' : 'none';
  if (show) {
    document.getElementById('gen-step').textContent  = step;
    document.getElementById('gen-pct').textContent   = pct + '%';
    document.getElementById('gen-bar').style.width   = pct + '%';
  }
}

/** 문제 목록 HTML 렌더 */
function renderQPreview(qs) {
  const container = document.getElementById('q-preview');
  container.innerHTML = '';
  qs.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'q-item fi';
    d.innerHTML = `
      <div class="q-head">
        <div class="q-badge">Q${String(i + 1).padStart(2, '0')}</div>
        <div class="q-txt">${q.question}</div>
      </div>
      <div class="q-opts">
        ${q.options.map((o, oi) => `
          <div class="q-opt${oi === q.answer ? ' ans' : ''}">
            <div class="opt-l">${['A','B','C','D'][oi]}</div>${o}
          </div>`).join('')}
      </div>
      ${q.explanation
        ? `<div class="q-exp">💡 ${q.explanation}</div>`
        : ''}`;
    container.appendChild(d);
  });
}

/**
 * Groq llama3 API 호출하여 문제 생성
 * @param {string} apiKey  - Groq API 키
 * @param {number} qCount  - 생성할 문항 수
 * @param {string} diff    - 난이도 (쉬움/보통/어려움)
 */
export async function generateQuestions(apiKey, qCount, diff) {
  const pdfText = getPdfText();
  if (!pdfText) { alert('PDF를 먼저 업로드하세요'); return; }

  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  document.getElementById('q-preview').innerHTML  = '';
  document.getElementById('save-sec').style.display = 'none';
  _generatedQs = [];

  const prompt =
    `다음 교육 자료를 분석하여 ${diff} 난이도의 4지선다 객관식 문제 ${qCount}개를 생성하세요.\n\n` +
    `교육 자료:\n${pdfText.substring(0, 5500)}\n\n` +
    `반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이):\n` +
    `{"questions":[{"question":"문제 내용","options":["① 보기1","② 보기2","③ 보기3","④ 보기4"],"answer":0,"explanation":"해설"}]}\n` +
    `answer는 정답 index(0~3). 반드시 한국어.`;

  try {
    setProgress(true, 'Groq llama3 요청 중...', 15);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:       'llama3-8b-8192',
        max_tokens:  4000,
        temperature: 0.7,
        messages:    [{ role: 'user', content: prompt }]
      })
    });

    setProgress(true, 'AI 응답 파싱 중...', 80);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'API 오류 ' + res.status);

    const raw    = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    _generatedQs = parsed.questions;

    setProgress(true, '완료!', 100);
    setTimeout(() => setProgress(false), 500);
    renderQPreview(_generatedQs);
    document.getElementById('save-sec').style.display   = 'block';
    document.getElementById('gen-status').textContent   = `✅ ${_generatedQs.length}문항 생성 완료`;
  } catch (e) {
    setProgress(false);
    document.getElementById('gen-status').textContent = '❌ 실패: ' + e.message;
  }
  btn.disabled = false;
}
