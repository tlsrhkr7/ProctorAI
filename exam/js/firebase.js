/**
 * firebase.js — 응시자 페이지 Firebase 초기화 및 로그 전송
 */

export let _db = null;
export let _fb = null;

/** Firebase 초기화 (localStorage에 저장된 설정 사용) */
export async function initFb() {
  const cfg = JSON.parse(localStorage.getItem('fb_cfg') || '{}');
  if (!cfg.projectId) return;
  try {
    const { initializeApp, getApps } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const fs =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    _db = fs.getFirestore(app);
    _fb = fs;
  } catch (e) {
    console.warn('Firebase init:', e);
  }
}

/**
 * 감독 이벤트 로그를 Firestore + localStorage에 저장
 * @param {object} entry - { studentId, studentName, examId, examName, severity, event, detail }
 */
export async function sendLog(entry) {
  const doc = { ...entry, ts: new Date().toISOString(), timestamp: new Date().toISOString() };

  // Firestore
  if (_db && _fb) {
    try { await _fb.addDoc(_fb.collection(_db, 'proctor_logs'), doc); }
    catch (e) { console.warn('Firestore log:', e); }
  }

  // localStorage fallback (관리자 페이지 폴링용)
  const stored = JSON.parse(localStorage.getItem('proctor_logs') || '[]');
  stored.unshift(doc);
  localStorage.setItem('proctor_logs', JSON.stringify(stored.slice(0, 500)));
}

/**
 * Firebase Firestore에서 활성 시험 목록을 실시간 구독
 * @param {function} onExams - 시험 배열을 인자로 받는 콜백
 */
export function listenExams(onExams) {
  if (!_db || !_fb) return;
  _fb.onSnapshot(_fb.collection(_db, 'exams'), snap => {
    const list = snap.docs
      .map(d => ({ ...d.data(), id: d.id }))
      .filter(e => e.status === 'active');

    // localStorage도 동기화
    const stored = JSON.parse(localStorage.getItem('proctor_exams') || '[]');
    list.forEach(e => {
      const i = stored.findIndex(x => x.id === e.id);
      if (i >= 0) stored[i] = e; else stored.push(e);
    });
    localStorage.setItem('proctor_exams', JSON.stringify(stored));
    onExams(list);
  });
}
