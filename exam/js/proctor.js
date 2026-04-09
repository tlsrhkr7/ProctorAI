/**
 * proctor.js — 감독 상태 관리, 경고 / AI 면담 / 종료 로직
 * camera.js, voice.js 의 콜백을 받아 처리
 */

import { sendLog } from './firebase.js';

/* ── 감독 상태 (외부에서 참조 가능하도록 export) ── */
export const S = {
  studentId: '', studentName: '', examId: '', examName: '',
  warns: 0, maxWarns: 3,
  gazeAway: false, gazeAwayTime: 0, totalAway: 0,
  gazeTimer: null, gazeThreshold: 3,
  voiceAlerts: 0,
  paused: false, terminated: false,
  chatTurn: 0, chatHistory: [],
  apiKey: '',
  recognition: null,
};

/* ── 로그 헬퍼 ── */
export function addLog(type, event, detail) {
  const now  = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
  const list = document.getElementById('log-list');
  const item = document.createElement('div');
  item.className = 'log-item li-' + type;
  item.innerHTML = `<span class="lt">${time}</span><span><strong>${event}</strong> — ${detail}</span>`;
  list.insertBefore(item, list.firstChild);
  if (list.children.length > 30) list.removeChild(list.lastChild);
}

function _sendLog(severity, event, detail) {
  sendLog({ studentId: S.studentId, studentName: S.studentName,
            examId: S.examId, examName: S.examName, severity, event, detail });
}

/* ── 상태 UI ── */
export function setStatus(type, txt) {
  const el = document.getElementById('sp');
  el.className = 'status-pill ' + { ok:'sp-ok', w:'sp-w', d:'sp-d' }[type];
  document.getElementById('sp-txt').textContent = txt;
}

/* ── 경고 배지 ── */
export function updateWarnBadges() {
  for (let i = 1; i <= 3; i++) {
    const b = document.getElementById('wb' + i);
    if (i <= S.warns) b.classList.add(i === S.maxWarns ? 'crit' : 'used');
  }
}

/* ── 테두리 플래시 ── */
function _flash(t) {
  const el = document.getElementById('b-flash');
  el.className = 'b-flash bf-' + t;
  setTimeout(() => { el.className = 'b-flash'; }, 2000);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   시선 이탈 처리
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * camera.js onGaze 콜백 → 시선 상태 처리
 * @param {boolean} away   - 화면 이탈 여부
 * @param {number}  val    - 시선 수평 비율 (0~1)
 */
export function handleGaze(away, val) {
  if (S.paused || S.terminated) return;

  // 집중도 바 업데이트
  const pct  = Math.max(0, Math.min(100, away ? 18 : 68 + val * 32));
  const fill = document.getElementById('gaze-fill');
  fill.style.width      = pct + '%';
  fill.style.background = away ? 'var(--danger)' : pct > 70 ? 'var(--ok)' : 'var(--warn)';
  document.getElementById('gaze-lbl').textContent = away ? '⚠ 시선 이탈' : '시선 정상';
  const fe = document.getElementById('st-focus');
  fe.textContent = Math.round(pct) + '%';
  fe.className   = 'sbox-v ' + (pct > 70 ? 'g' : pct > 40 ? 'w' : 'd');

  if (away && !S.gazeAway) {
    S.gazeAway     = true;
    S.gazeAwayTime = 0;
    S.gazeTimer    = setInterval(() => {
      if (!S.gazeAway || S.paused || S.terminated) { clearInterval(S.gazeTimer); return; }
      S.gazeAwayTime++;
      S.totalAway++;
      document.getElementById('st-away').textContent = S.totalAway + 's';
      if (S.gazeAwayTime >= S.gazeThreshold) {
        _triggerGazeWarning();
        clearInterval(S.gazeTimer);
      }
    }, 1000);

  } else if (!away && S.gazeAway) {
    S.gazeAway     = false;
    S.gazeAwayTime = 0;
    clearInterval(S.gazeTimer);
  }
}

function _triggerGazeWarning() {
  S.warns++;
  updateWarnBadges();
  addLog('warn', '시선 이탈', `${S.gazeThreshold}초+ 이탈 (${S.warns}/${S.maxWarns})`);
  _sendLog('warn', '시선 이탈', `${S.gazeThreshold}초+ 이탈`);
  const we = document.getElementById('st-warns');
  we.textContent = S.warns + '회';
  we.className   = 'sbox-v ' + (S.warns >= S.maxWarns - 1 ? 'd' : 'w');
  S.warns >= S.maxWarns ? startChat('gaze') : (showWarning('시선 이탈 감지', `화면을 ${S.gazeThreshold}초+ 이탈했습니다. 경고 ${S.warns}/${S.maxWarns}회`), _flash('w'));
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   음성 의심 처리
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * voice.js onSuspicious 콜백 → 음성 경고 처리
 * @param {string} transcript
 */
export function handleVoiceSuspicion(transcript) {
  if (S.paused || S.terminated) return;
  S.voiceAlerts++;
  const ve = document.getElementById('st-voice');
  ve.textContent = S.voiceAlerts + '회';
  ve.className   = 'sbox-v ' + (S.voiceAlerts >= 3 ? 'd' : 'w');

  const snippet = transcript.substring(0, 28);
  addLog('danger', '음성 경고', `의심 발언: "${snippet}"`);
  _sendLog('danger', '음성 경고', `의심 발언: "${snippet}"`);

  S.warns++;
  updateWarnBadges();
  S.warns >= S.maxWarns
    ? startChat('voice')
    : (showWarning('의심 발언 감지', `"${snippet}" — 시험 관련 발언이 감지되었습니다`), _flash('d'));
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   경고 오버레이
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function showWarning(title, msg) {
  if (S.paused || S.terminated) return;
  document.getElementById('ov-warn-title').textContent = title;
  document.getElementById('ov-warn-msg').textContent   = msg;
  document.getElementById('ov-warn').classList.add('act');
  S.paused = true;
  document.getElementById('exam-content').classList.add('blurred');
  setStatus('w', `경고 ${S.warns}/${S.maxWarns}`);
  setTimeout(() => {
    if (document.getElementById('ov-warn').classList.contains('act')) dismissWarning();
  }, 8000);
}

export function dismissWarning() {
  document.getElementById('ov-warn').classList.remove('act');
  S.paused = false;
  document.getElementById('exam-content').classList.remove('blurred');
  setStatus('ok', '정상 감독 중');
  addLog('info', '경고 확인', '응시자 확인 후 재개');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AI 면담
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function startChat(reason) {
  if (S.paused || S.terminated) return;
  S.paused = true;
  document.getElementById('exam-content').classList.add('blurred');
  document.getElementById('ov-warn').classList.remove('act');
  if (S.recognition) { try { S.recognition.stop(); } catch (_) {} }

  S.chatHistory = []; S.chatTurn = 0;
  document.getElementById('chat-msgs').innerHTML    = '';
  document.getElementById('resume-btn').style.display = 'none';
  document.getElementById('ov-chat').classList.add('act');
  setStatus('d', 'AI 면담 중');

  const rm = { gaze: '시선이 반복 이탈', voice: '의심 발언이 반복 감지' };
  const msg = `안녕하세요, ${S.studentName}님. 저는 ProctorAI 감독 시스템입니다.\n\n${rm[reason]}되었습니다. 시험 공정성을 위해 간단한 확인이 필요합니다.\n\n현재 시험 외 다른 자료나 도움을 받고 있습니까?`;
  await _typeMessage('ai', msg);
  S.chatHistory.push({ role: 'assistant', content: msg });
  S.chatTurn = 1;
  addLog('danger', 'AI 면담 시작', rm[reason]);
  _sendLog('danger', 'AI 면담 시작', rm[reason]);
}

export async function sendChatMessage(text) {
  await _typeMessage('user', text);
  S.chatHistory.push({ role: 'user', content: text });
  const reply = await _getAIReply();
  await _typeMessage('ai', reply);
  S.chatHistory.push({ role: 'assistant', content: reply });
  S.chatTurn++;
  if (S.chatTurn >= 3) {
    document.getElementById('resume-btn').style.display = 'inline-flex';
    addLog('info', 'AI 면담', '완료 — 재개 가능');
  }
}

export function resumeFromChat() {
  document.getElementById('ov-chat').classList.remove('act');
  S.paused = false;
  S.warns  = 0;
  for (let i = 1; i <= 3; i++) {
    document.getElementById('wb' + i).classList.remove('used', 'crit');
  }
  document.getElementById('exam-content').classList.remove('blurred');
  setStatus('ok', '정상 감독 중');
  addLog('ok', '시험 재개', 'AI 면담 완료');
  _sendLog('ok', '시험 재개', '면담 후 재개');
  if (S.recognition) { try { S.recognition.start(); } catch (_) {} }
}

async function _getAIReply() {
  if (S.apiKey) {
    try {
      const sys = `당신은 온라인 시험 감독 AI. 응시자 ${S.studentName}(${S.studentId}), 시험: ${S.examName}. 2~3문장 한국어만.`;
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
        body:    JSON.stringify({
          model: 'llama3-8b-8192', max_tokens: 250, temperature: 0.7,
          messages: [{ role: 'system', content: sys }, ...S.chatHistory]
        })
      });
      if (res.ok) { const d = await res.json(); return d.choices[0].message.content.trim(); }
    } catch (e) { console.warn(e); }
  }
  // 시뮬레이션
  const sims = [
    `이해합니다, ${S.studentName}님. 혹시 주변 소리나 다른 화면으로 인해 시선이 이탈된 이유를 설명해 주시겠습니까?`,
    '말씀 감사합니다. 추가 위반 시 시험이 자동 종료됩니다. 이해하셨나요?',
    '확인되었습니다. 면담을 종료하겠습니다. 최선을 다해 응시해 주세요.'
  ];
  return sims[Math.min(S.chatTurn - 1, 2)];
}

function _typeMessage(role, text) {
  return new Promise(resolve => {
    const c = document.getElementById('chat-msgs');
    const d = document.createElement('div');
    d.className = 'chat-msg cm-' + role;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
    if (role === 'ai') {
      const t = document.createElement('div');
      t.className = 'typing';
      t.innerHTML = '<div class="tdot"></div><div class="tdot"></div><div class="tdot"></div>';
      d.appendChild(t);
      c.scrollTop = c.scrollHeight;
      setTimeout(() => {
        d.innerHTML = text.replace(/\n/g, '<br>');
        c.scrollTop = c.scrollHeight;
        resolve();
      }, 900 + Math.random() * 700);
    } else {
      d.textContent = text;
      c.scrollTop = c.scrollHeight;
      resolve();
    }
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   시험 종료
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function showDoneScreen(forced, startTime) {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const em = Math.floor(elapsed / 60), es = elapsed % 60;
  document.getElementById('done-icon').textContent  = forced ? '🚫' : '✅';
  document.getElementById('done-title').textContent = forced ? '시험 강제 종료' : '시험 제출 완료';
  document.getElementById('done-title').className   = 'ov-title ' + (forced ? 'd' : 'g');
  document.getElementById('done-sub').textContent   = forced
    ? '부정행위 의심으로 강제 종료되었습니다.'
    : '수고하셨습니다! 답안이 제출되었습니다.';
  document.getElementById('dn-warns').textContent = S.warns;
  document.getElementById('dn-away').textContent  = S.totalAway + 's';
  document.getElementById('dn-voice').textContent = S.voiceAlerts;
  document.getElementById('dn-time').textContent  =
    `${String(em).padStart(2,'0')}:${String(es).padStart(2,'0')}`;
  document.getElementById('ov-done').classList.add('act');
}
