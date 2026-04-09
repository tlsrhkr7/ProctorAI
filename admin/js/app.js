/**
 * app.js — 관리자 메인 진입점
 * 모든 모듈을 import하고 이벤트 바인딩 및 초기화를 수행
 */

import { initFb, saveExamToFb, getFbCfg } from './firebase.js';
import { handleDrop, handleFile, clearPdf } from './pdf.js';
import { generateQuestions, getGeneratedQs }  from './ai-generate.js';
import { navigate, renderDash, renderExams, renderMonitor, renderLogs, exportCsv } from './ui.js';

/* ── 전역 상태 ── */
const G = {
  logs:  JSON.parse(localStorage.getItem('proctor_logs')  || '[]'),
  exams: JSON.parse(localStorage.getItem('proctor_exams') || '[]'),
};

/* ── localStorage 저장 ── */
function persist() {
  localStorage.setItem('proctor_exams', JSON.stringify(G.exams));
  localStorage.setItem('proctor_logs',  JSON.stringify(G.logs));
}

/* ── 전체 UI 갱신 ── */
function refresh() {
  renderDash(G.exams, G.logs);
  renderMonitor(G.logs);
  renderLogs(G.logs);
  renderExams(G.exams, G.logs);
}

/* ── Firebase 업데이트 콜백 ── */
function onFbUpdate(type, data) {
  if (type === 'logs')  G.logs  = data;
  if (type === 'exams') G.exams = data;
  refresh();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HTML onclick="..." 에서 호출하는 함수들
   → window에 노출 필요
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** 사이드바 네비게이션 */
window.nav = (name, btn) => {
  navigate(name, btn);
  if (name === 'monitor')   renderMonitor(G.logs);
  if (name === 'logs')      renderLogs(G.logs);
  if (name === 'exams')     renderExams(G.exams, G.logs);
  if (name === 'dashboard') renderDash(G.exams, G.logs);
};

/** PDF 이벤트 */
window.handleDrop = handleDrop;
window.handleFile = handleFile;
window.clearPdf   = clearPdf;

/** AI 문제 생성 */
window.generateQs = async () => {
  const key   = localStorage.getItem('groq_key');
  if (!key) {
    alert('설정에서 Groq API 키를 먼저 입력하세요!');
    nav('settings', document.querySelectorAll('.sb-btn')[5]);
    return;
  }
  const qcnt = document.getElementById('n-qcnt').value;
  const diff = document.getElementById('n-diff').value;
  await generateQuestions(key, qcnt, diff);
};

/** 시험 등록 */
window.saveExam = async () => {
  const name = document.getElementById('n-name').value.trim();
  if (!name)                      { alert('시험 이름을 입력하세요'); return; }
  if (!getGeneratedQs().length)   { alert('문제를 먼저 생성하세요'); return; }

  const exam = {
    id:         'exam_' + Date.now(),
    name,
    duration:   parseInt(document.getElementById('n-dur').value),
    questions:  getGeneratedQs(),
    createdAt:  new Date().toISOString(),
    status:     'ready',
  };
  G.exams.push(exam);
  persist();
  await saveExamToFb(exam);
  alert(`✅ "${name}" 시험 등록!\n응시자 페이지에서 선택 가능합니다.`);
  nav('exams', document.querySelectorAll('.sb-btn')[2]);
  renderExams(G.exams, G.logs);
};

/** 시험 상태 토글 (활성화 ↔ 종료) */
window.toggleExam = id => {
  const e = G.exams.find(x => x.id === id);
  if (!e) return;
  e.status = e.status === 'active' ? 'closed' : 'active';
  persist();
  saveExamToFb(e);
  renderExams(G.exams, G.logs);
};

/** 시험 삭제 */
window.deleteExam = id => {
  if (!confirm('삭제할까요?')) return;
  G.exams = G.exams.filter(e => e.id !== id);
  persist();
  renderExams(G.exams, G.logs);
};

/** 로그 필터 변경 */
window.renderLogs = () => renderLogs(G.logs);

/** CSV 내보내기 */
window.exportCsv = () => exportCsv(G.logs);

/* ━━━━━━━━ 설정 저장 ━━━━━━━━ */
window.saveAdmin = () => {
  const v = document.getElementById('set-admin').value.trim() || '관리자';
  localStorage.setItem('admin_name', v);
  document.getElementById('admin-name-disp').textContent = v;
  alert('저장됨');
};
window.saveGroq = () => {
  localStorage.setItem('groq_key', document.getElementById('set-groq').value.trim());
  alert('✅ Groq API 키 저장 완료');
};
window.saveFb = async () => {
  const cfg = {
    apiKey:            document.getElementById('fb-k').value.trim(),
    authDomain:        document.getElementById('fb-d').value.trim(),
    projectId:         document.getElementById('fb-p').value.trim(),
    storageBucket:     document.getElementById('fb-b').value.trim(),
    messagingSenderId: document.getElementById('fb-s').value.trim(),
    appId:             document.getElementById('fb-a').value.trim(),
  };
  localStorage.setItem('fb_cfg', JSON.stringify(cfg));
  await initFb(onFbUpdate);
};
window.saveProctor = () => {
  localStorage.setItem('proctor_cfg', JSON.stringify({
    gaze: document.getElementById('set-gaze').value,
    maxw: document.getElementById('set-maxw').value,
  }));
  alert('저장됨');
};

/* ━━━━━━━━ localStorage 폴링 (Firebase 없을 때 동기화) ━━━━━━━━ */
setInterval(() => {
  const lg = JSON.parse(localStorage.getItem('proctor_logs')  || '[]');
  const ex = JSON.parse(localStorage.getItem('proctor_exams') || '[]');
  if (lg.length !== G.logs.length)  { G.logs  = lg; refresh(); }
  if (ex.length !== G.exams.length) { G.exams = ex; refresh(); }
}, 1500);

/* ━━━━━━━━ 초기화 ━━━━━━━━ */
(async () => {
  // 저장된 설정 복원
  const an = localStorage.getItem('admin_name') || '관리자';
  document.getElementById('admin-name-disp').textContent = an;
  document.getElementById('set-admin').value = an;
  document.getElementById('set-groq').value  = localStorage.getItem('groq_key') || '';

  const fc = getFbCfg();
  if (fc.projectId) {
    document.getElementById('fb-k').value = fc.apiKey            || '';
    document.getElementById('fb-d').value = fc.authDomain        || '';
    document.getElementById('fb-p').value = fc.projectId         || '';
    document.getElementById('fb-b').value = fc.storageBucket     || '';
    document.getElementById('fb-s').value = fc.messagingSenderId || '';
    document.getElementById('fb-a').value = fc.appId             || '';
    await initFb(onFbUpdate);
  }

  const pc = JSON.parse(localStorage.getItem('proctor_cfg') || '{}');
  if (pc.gaze) document.getElementById('set-gaze').value = pc.gaze;
  if (pc.maxw) document.getElementById('set-maxw').value = pc.maxw;

  renderDash(G.exams, G.logs);
})();
