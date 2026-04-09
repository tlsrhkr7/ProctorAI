/**
 * ui.js — 관리자 페이지 UI 렌더링 & 네비게이션
 * Dashboard / Exams / Monitor / Logs 렌더 함수 모음
 */

/* ── 네비게이션 ── */
export function navigate(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('page-' + name).classList.add('on');
  btn.classList.add('on');
  const labels = {
    dashboard: '대시보드', create: '시험 생성', exams: '시험 목록',
    monitor: '실시간 감독', logs: '전체 로그', settings: '설정'
  };
  document.getElementById('crumb').textContent = labels[name];
}

/* ── 대시보드 ── */
export function renderDash(exams, logs) {
  document.getElementById('d-exams').textContent  = exams.length;
  document.getElementById('d-active').textContent = exams.filter(e => e.status === 'active').length;
  document.getElementById('d-warns').textContent  = logs.filter(l => l.severity === 'warn' || l.severity === 'danger').length;
  document.getElementById('d-term').textContent   = logs.filter(l => l.event && l.event.includes('강제 종료')).length;

  const ic = { ok: '✅', info: 'ℹ️', warn: '⚠️', danger: '🚨' };
  document.getElementById('d-loglist').innerHTML =
    logs.slice(0, 5).map(l => `
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(30,42,61,.4)">
        <span>${ic[l.severity] || '•'}</span>
        <span style="color:var(--muted);font-size:10px">${new Date(l.ts || l.timestamp).toLocaleTimeString('ko')}</span>
        <span><strong>${l.studentName}</strong> — ${l.event}</span>
      </div>`).join('') ||
    '<div style="font-size:12px;color:var(--muted)">이벤트 없음</div>';

  document.getElementById('d-examlist').innerHTML =
    exams.map(e => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(30,42,61,.4)">
        <span style="font-size:13px;font-weight:600">${e.name}</span>
        <span class="badge ${e.status === 'active' ? 'bg' : 'bb'}">${e.status === 'active' ? '진행중' : '대기'}</span>
      </div>`).join('') ||
    '<div style="font-size:12px;color:var(--muted)">시험을 먼저 생성하세요</div>';

  // 로그 필터 시험 옵션 동기화
  const sel = document.getElementById('lf-exam');
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 시험</option>' +
    exams.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  sel.value = cur;
}

/* ── 시험 목록 테이블 ── */
export function renderExams(exams, logs) {
  const tb = document.getElementById('exam-tbody');
  if (!exams.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:28px">등록 없음</td></tr>';
    return;
  }
  const sc = { ready: 'bb', active: 'bg', closed: 'bm' };
  const st = { ready: '대기', active: '진행중', closed: '종료' };

  tb.innerHTML = exams.map(e => {
    const uniq = [...new Set(logs.filter(l => l.examId === e.id).map(l => l.studentId))].length;
    return `<tr>
      <td><strong>${e.name}</strong><br>
          <span style="font-size:10px;color:var(--muted)">${new Date(e.createdAt).toLocaleDateString('ko')}</span>
      </td>
      <td>${e.questions.length}문항</td>
      <td>${Math.floor(e.duration / 60)}분</td>
      <td>${uniq}명</td>
      <td><span class="badge ${sc[e.status] || 'bb'}">${st[e.status] || '대기'}</span></td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="window.toggleExam('${e.id}')">
          ${e.status === 'active' ? '⏹ 종료' : '▶ 활성화'}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="window.deleteExam('${e.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── 실시간 모니터 ── */
export function renderMonitor(logs) {
  const now    = Date.now();
  const recent = logs.filter(l => (now - new Date(l.ts || l.timestamp).getTime()) < 7_200_000);
  const students = {};

  recent.forEach(l => {
    if (!students[l.studentId])
      students[l.studentId] = { name: l.studentName, id: l.studentId, exam: l.examName, warns: 0, last: l.ts || l.timestamp };
    if (l.severity === 'warn')   students[l.studentId].warns++;
    if (l.severity === 'danger') students[l.studentId].warns += 2;
    students[l.studentId].last = l.ts || l.timestamp;
  });

  const list = Object.values(students);
  const grid = document.getElementById('stu-grid');

  if (!list.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--muted)">응시 중인 학생 없음</div>';
    document.getElementById('mon-live').classList.remove('show');
    document.getElementById('live-chip').classList.remove('show');
    document.getElementById('alert-badge').classList.remove('show');
    return;
  }

  document.getElementById('mon-live').classList.add('show');
  document.getElementById('live-chip').classList.add('show');
  document.getElementById('mon-exam').textContent = list[0].exam || '진행 중';
  document.getElementById('alert-badge').classList.toggle('show', list.some(s => s.warns >= 2));

  grid.innerHTML = list.map(s => {
    const pct = Math.max(0, 100 - s.warns * 18);
    const col = pct > 70 ? 'var(--ok)' : pct > 40 ? 'var(--warn)' : 'var(--danger)';
    return `
      <div class="stu-card ${s.warns >= 3 ? 'dc' : s.warns >= 1 ? 'wc' : ''}">
        <div class="stu-top">
          <div>
            <div class="stu-name">${s.name}</div>
            <div class="stu-id">${s.id}</div>
          </div>
          <div>${s.warns > 0
            ? `<span class="badge bw">⚠ ${s.warns}회</span>`
            : '<span class="badge bg">정상</span>'}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
          <span style="color:var(--muted)">집중도</span>
          <span style="color:${col}">${pct}%</span>
        </div>
        <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${col}"></div></div>
        <div style="font-size:10px;color:var(--muted);margin-top:7px">
          ${new Date(s.last).toLocaleTimeString('ko')}
        </div>
      </div>`;
  }).join('');
}

/* ── 전체 로그 ── */
export function renderLogs(logs) {
  const ef  = document.getElementById('lf-exam').value;
  const sf  = document.getElementById('lf-sev').value;
  let   filtered = [...logs];
  if (ef) filtered = filtered.filter(l => l.examId   === ef);
  if (sf) filtered = filtered.filter(l => l.severity === sf);

  document.getElementById('log-cnt').textContent = filtered.length + '건';
  const tb = document.getElementById('log-tbody');

  if (!filtered.length) {
    tb.innerHTML = '<div style="padding:22px;text-align:center;font-size:12px;color:var(--muted)">로그 없음</div>';
    return;
  }
  const sm = { ok: '정상', info: '정보', warn: '경고', danger: '위험' };
  tb.innerHTML = filtered.slice(0, 150).map(l => `
    <div class="log-row ${l.severity === 'danger' ? 'rd' : l.severity === 'warn' ? 'rw' : ''}">
      <div class="log-time">${new Date(l.ts || l.timestamp).toLocaleTimeString('ko')}</div>
      <div class="log-stu">${l.studentName}<br>
        <span style="color:var(--muted);font-size:10px">${l.studentId}</span>
      </div>
      <div>${l.event} — ${l.detail}</div>
      <div><span class="sev sv-${l.severity}">${sm[l.severity] || l.severity}</span></div>
    </div>`).join('');
}

/* ── CSV 내보내기 ── */
export function exportCsv(logs) {
  const rows = [
    '시각,학번,이름,시험,이벤트,내용,등급',
    ...logs.map(l =>
      `${new Date(l.ts || l.timestamp).toLocaleString('ko')},${l.studentId},${l.studentName},${l.examName || ''},${l.event},"${l.detail}",${l.severity}`)
  ];
  const a = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(rows.join('\n'));
  a.download = `proctor_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
