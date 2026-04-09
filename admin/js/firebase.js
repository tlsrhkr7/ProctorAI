/**
 * firebase.js — Firebase Firestore 초기화 및 실시간 리스너
 * admin 페이지에서 import하여 사용
 */

export let _db  = null;
export let _fb  = null;
let _unsub = null;

/** localStorage에 저장된 Firebase 설정을 반환 */
export function getFbCfg() {
  try { return JSON.parse(localStorage.getItem('fb_cfg') || '{}'); }
  catch { return {}; }
}

/** Firebase 초기화 및 Firestore 연결 */
export async function initFb(onUpdate) {
  const cfg = getFbCfg();
  if (!cfg.projectId) return false;
  try {
    const { initializeApp, getApps } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const fs =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    _db = fs.getFirestore(app);
    _fb = fs;

    // 전역 노출 (HTML 인라인 핸들러에서 접근 필요 시)
    window.__db = _db;
    window.__fb = fs;

    listenFb(onUpdate);
    setFbStatus('✅ 연결됨', 'var(--ok)');
    return true;
  } catch (e) {
    setFbStatus('❌ ' + e.message, 'var(--danger)');
    return false;
  }
}

/** Firestore 실시간 리스너 등록 */
function listenFb(onUpdate) {
  if (!_db || !_fb) return;
  const { collection, query, orderBy, limit, onSnapshot, doc, setDoc } = _fb;

  // 로그 스트림
  const q = query(collection(_db, 'proctor_logs'), orderBy('ts', 'desc'), limit(300));
  if (_unsub) _unsub();
  _unsub = onSnapshot(q, snap => {
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    localStorage.setItem('proctor_logs', JSON.stringify(logs));
    onUpdate('logs', logs);
  });

  // 시험 스트림
  onSnapshot(collection(_db, 'exams'), snap => {
    const stored = JSON.parse(localStorage.getItem('proctor_exams') || '[]');
    snap.docs.forEach(d => {
      const fd = { ...d.data(), id: d.id };
      const i  = stored.findIndex(e => e.id === fd.id);
      if (i >= 0) stored[i] = { ...stored[i], ...fd };
      else stored.push(fd);
    });
    localStorage.setItem('proctor_exams', JSON.stringify(stored));
    onUpdate('exams', stored);
  });
}

/** Firestore에 시험 저장/갱신 */
export async function saveExamToFb(exam) {
  if (!_db || !_fb) return;
  await _fb.setDoc(_fb.doc(_db, 'exams', exam.id), exam).catch(console.warn);
}

/** UI 상태 텍스트 업데이트 헬퍼 */
function setFbStatus(text, color) {
  const el = document.getElementById('fb-status');
  if (el) { el.textContent = text; el.style.color = color; }
}
