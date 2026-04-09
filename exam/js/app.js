/**
 * app.js — 응시자 페이지 메인 진입점
 * 모든 모듈을 조합하여 시험 흐름을 제어
 */

import { initFb, sendLog, listenExams } from './firebase.js';
import { initCamera }                    from './camera.js';
import { initVoice }                     from './voice.js';
import {
  S, addLog, setStatus, updateWarnBadges,
  handleGaze, handleVoiceSuspicion,
  showWarning, dismissWarning,
  startChat, sendChatMessage, resumeFromChat,
  showDoneScreen
} from './proctor.js';

/* ── 시험 진행 상태 ── */
let _startTime = null;
let _timerInt  = null;
let _answers   = {};
let _questions = [];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   로그인 & 시험 선택
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function loadExams() {
  const stored = JSON.parse(localStorage.getItem('proctor_exams') || '[]');
  const sel    = document.getElementById('l-exam');
  const active = stored.filter(e => e.status === 'active');
  const list   = active.length ? active : stored; // active 없으면 전체 보여줌

  sel.innerHTML = list.length
    ? '<option value="">-- 시험 선택 --</option>' +
      list.map(e => `<option value="${e.id}">${e.name}</option>`).join('')
    : '<option value="">활성 시험 없음 (관리자에게 문의)</option>';
}

window.startExam = async function () {
  const id     = document.getElementById('l-id').value.trim();
  const name   = document.getElementById('l-name').value.trim();
  const examId = document.getElementById('l-exam').value;
  if (!id || !name) { alert('학번과 이름을 입력하세요'); return; }
  if (!examId)      { alert('시험을 선택하세요');        return; }

  const exams = JSON.parse(localStorage.getItem('proctor_exams') || '[]');
  const exam  = exams.find(e => e.id === examId);
  if (!exam) { alert('시험 정보를 찾을 수 없습니다'); return; }

  // 상태 초기화
  Object.assign(S, {
    studentId: id, studentName: name, examId, examName: exam.name,
    apiKey: localStorage.getItem('groq_key') || ''
  });
  const cfg = JSON.parse(localStorage.getItem('proctor_cfg') || '{}');
  S.gazeThreshold = parseInt(cfg.gaze) || 3;
  S.maxWarns      = parseInt(cfg.maxw) || 3;

  _questions = exam.questions;
  _startTime = Date.now();

  // UI 전환
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('exam-screen').style.display  = 'flex';
  document.getElementById('tb-name').textContent  = exam.name;
  document.getElementById('p-title').textContent  = exam.name;
  document.getElementById('p-qcnt').textContent   = exam.questions.length;
  document.getElementById('p-dur').textContent    = Math.round(exam.duration / 60);
  document.getElementById('p-name').textContent   = name;
  document.getElementById('p-id').textContent     = id;

  _renderQuestions();
  _updateTimer(exam.duration);

  S.timeLeft = exam.duration;
  _timerInt  = setInterval(() => _tick(exam.duration), 1000);

  addLog('info', '시험 시작', exam.name);
  sendLog({ studentId: id, studentName: name, examId, examName: exam.name,
            severity: 'info', event: '시험 시작', detail: exam.name });

  // 감독 초기화
  await initCamera(handleGaze, addLog);
  const rec = initVoice(handleVoiceSuspicion, addLog);
  S.recognition = rec;

  // voice 자동 재시작 루프
  setInterval(() => {
    if (rec?._ended && !S.paused && !S.terminated) {
      rec._ended = false;
      try { rec.start(); } catch (_) {}
    }
  }, 600);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   문제 렌더링
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function _renderQuestions() {
  const area = document.getElementById('q-area');
  area.innerHTML = '';
  _questions.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'q-block fi';
    d.innerHTML = `
      <div class="q-num">문제 ${String(i + 1).padStart(2, '0')}</div>
      <div class="q-text">${q.question}</div>
      <div class="q-options">
        ${q.options.map((o, oi) => `
          <div class="q-option" id="opt-${i}-${oi}" onclick="selOpt(${i},${oi})">
            <div class="opt-l">${['A','B','C','D'][oi]}</div>${o}
          </div>`).join('')}
      </div>`;
    area.appendChild(d);
  });
}

window.selOpt = (qi, oi) => {
  document.querySelectorAll(`[id^="opt-${qi}-"]`).forEach(e => e.classList.remove('sel'));
  document.getElementById(`opt-${qi}-${oi}`).classList.add('sel');
  _answers[qi] = oi;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   타이머
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function _tick() {
  if (S.paused || S.terminated) return;
  S.timeLeft--;
  _updateTimer();
  if (S.timeLeft <= 0) submitExam();
}

function _updateTimer() {
  const m = Math.floor(S.timeLeft / 60), s = S.timeLeft % 60;
  const el = document.getElementById('timer');
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className   = 'timer' + (S.timeLeft < 120 ? ' td' : S.timeLeft < 300 ? ' tw' : '');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   제출 / 강제 종료
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

window.submitExam = function () {
  if (S.terminated) return;
  S.terminated = true; S.paused = true;
  clearInterval(_timerInt);
  if (S.recognition) { try { S.recognition.stop(); } catch (_) {} }
  addLog('ok', '제출', '답안 제출');
  sendLog({ studentId: S.studentId, studentName: S.studentName,
            examId: S.examId, examName: S.examName,
            severity: 'ok', event: '시험 제출', detail: '답안 제출 완료' });
  showDoneScreen(false, _startTime);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   오버레이 핸들러 (HTML onclick에서 호출)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.dismissWarn  = dismissWarning;
window.resumeChat   = resumeFromChat;
window.sendChat     = async () => {
  const inp = document.getElementById('chat-inp');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  await sendChatMessage(txt);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   초기화
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(async () => {
  await initFb();
  loadExams();
  // Firebase 실시간 시험 구독
  listenExams(list => {
    if (!list.length) return;
    const sel = document.getElementById('l-exam');
    sel.innerHTML = '<option value="">-- 시험 선택 --</option>' +
      list.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    // localStorage 갱신
    const stored = JSON.parse(localStorage.getItem('proctor_exams') || '[]');
    list.forEach(e => {
      const i = stored.findIndex(x => x.id === e.id);
      if (i >= 0) stored[i] = e; else stored.push(e);
    });
    localStorage.setItem('proctor_exams', JSON.stringify(stored));
  });
})();
