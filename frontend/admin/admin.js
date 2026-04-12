const API='https://proctorai-production.up.railway.app';
let token=localStorage.getItem('admin_token')||'';
let _pollTimer=null;
const G={logs:[],exams:[],pdfImages:[],pdfPageCount:0,genQs:[]};

// ── API 헬퍼 ──────────────────────────────────────────────
async function api(method,path,body){
  const h={'Content-Type':'application/json'};
  if(token)h['Authorization']=`Bearer ${token}`;
  const o={method,headers:h};
  if(body!==undefined)o.body=JSON.stringify(body);
  const r=await fetch(API+path,o);
  if(r.status===204)return null;
  const d=await r.json();
  if(!r.ok)throw new Error(d.detail||JSON.stringify(d));
  return d;
}

// ── 로그인 모달 ───────────────────────────────────────────
function injectLoginModal(){
  const el=document.createElement('div');
  el.id='login-modal';
  el.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;align-items:center;justify-content:center;';
  el.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:32px;width:360px;max-width:90vw">
    <div style="font-size:22px;font-weight:700;margin-bottom:4px">PROCTOR<span style="color:var(--accent2)">AI</span></div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:22px">관리자 대시보드 로그인</div>
    <label class="lbl">이름</label><input type="text" class="inp" id="lm-name" placeholder="관리자 이름">
    <label class="lbl">비밀번호</label><input type="password" class="inp" id="lm-pw" placeholder="비밀번호" onkeydown="if(event.key==='Enter')doLogin()">
    <div id="lm-err" style="color:var(--danger);font-size:12px;min-height:18px;margin-bottom:12px"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-p" style="flex:1" onclick="doLogin()">로그인</button><button class="btn btn-ghost" style="flex:1" onclick="doRegister()">회원가입</button></div>
  </div>`;
  document.body.appendChild(el);
}

async function performLogin(name,pw){
  const r=await api('POST','/api/auth/login',{name,password:pw});
  token=r.token;
  localStorage.setItem('admin_token',token);
  localStorage.setItem('admin_name',name);
  document.getElementById('login-modal').style.display='none';
  document.getElementById('admin-name-disp').textContent=name;
  document.getElementById('set-admin').value=name;
  loadAll();
}

window.doLogin=async function(){
  const name=document.getElementById('lm-name').value.trim();
  const pw=document.getElementById('lm-pw').value.trim();
  if(!name||!pw){document.getElementById('lm-err').textContent='이름과 비밀번호를 입력하세요';return;}
  try{await performLogin(name,pw);}
  catch(e){document.getElementById('lm-err').textContent='❌ '+e.message;}
};

window.doRegister=async function(){
  const name=document.getElementById('lm-name').value.trim();
  const pw=document.getElementById('lm-pw').value.trim();
  if(!name||!pw){document.getElementById('lm-err').textContent='이름과 비밀번호를 입력하세요';return;}
  try{
    await api('POST','/api/auth/register',{name,password:pw,role:'admin'});
    await performLogin(name,pw);
  }catch(e){document.getElementById('lm-err').textContent='❌ '+e.message;}
};

// ── 데이터 패치 ───────────────────────────────────────────
async function fetchExams(){
  const rows=await api('GET','/api/exams');
  G.exams=rows||[];
}

async function fetchLogs(){
  const r=await api('GET','/api/admin/logs?size=200');
  G.logs=r.logs||[];
}

async function fetchSettings(){
  const s=await api('GET','/api/admin/settings');
  if(!s)return;
  if(s.groq_key){document.getElementById('set-groq').value=s.groq_key;localStorage.setItem('groq_key',s.groq_key);}
  if(s.gaze_threshold)document.getElementById('set-gaze').value=s.gaze_threshold;
  if(s.max_warnings)document.getElementById('set-maxw').value=s.max_warnings;
}

async function loadAll(){
  try{
    await Promise.all([fetchExams(), fetchSettings()]);
    renderDash();
    if(_pollTimer)clearInterval(_pollTimer);
    _pollTimer=setInterval(poll,5000);
  }catch(e){console.error('loadAll:',e);}
}

async function poll(){
  try{
    await fetchExams();
    renderDash();
    const activePage=document.querySelector('.page.on');
    if(!activePage)return;
    const id=activePage.id;
    if(id==='page-monitor')renderMonitor();
    if(id==='page-exams')renderExams();
  }catch(e){console.warn('poll:',e);}
}

// ── Nav ───────────────────────────────────────────────────
window.nav=(name,btn)=>{
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.sb-btn').forEach(b=>b.classList.remove('on'));
  document.getElementById('page-'+name).classList.add('on');btn.classList.add('on');
  const L={dashboard:'대시보드',create:'시험 생성',exams:'시험 목록',monitor:'실시간 감독',results:'응시 결과',settings:'설정'};
  document.getElementById('crumb').textContent=L[name];
  if(name==='monitor')renderMonitor();
  if(name==='exams')renderExams();
  if(name==='dashboard')renderDash();
  if(name==='results')initResultsPage();
};

// ── PDF ───────────────────────────────────────────────────
window.handleDrop=e=>{e.preventDefault();document.getElementById('upload-zone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&f.type==='application/pdf')processPdf(f);};
window.handleFile=e=>{const f=e.target.files[0];if(f)processPdf(f);};
window.clearPdf=()=>{G.pdfImages=[];G.pdfPageCount=0;document.getElementById('pdf-chip').style.display='none';document.getElementById('pdf-preview').style.display='none';document.getElementById('gen-btn').disabled=true;document.getElementById('gen-status').textContent='PDF를 먼저 업로드하세요';document.getElementById('pdf-inp').value='';};

async function processPdf(file){
  document.getElementById('pdf-name').textContent=file.name;
  document.getElementById('pdf-size').textContent=(file.size/1024).toFixed(1)+' KB';
  document.getElementById('pdf-chip').style.display='flex';
  document.getElementById('gen-status').textContent='🖼 PDF 이미지 변환 중...';
  try{
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    G.pdfPageCount=pdf.numPages;
    const maxPages=Math.min(pdf.numPages,5); // 최대 5페이지 (토큰 절약)
    G.pdfImages=[];
    for(let i=1;i<=maxPages;i++){
      document.getElementById('gen-status').textContent=`🖼 이미지 변환 중... (${i}/${maxPages}페이지)`;
      const pg=await pdf.getPage(i);
      // 800px 기준 스케일 계산 (너무 크면 토큰 과다)
      const vp0=pg.getViewport({scale:1});
      const scale=Math.min(800/vp0.width,1.5);
      const vp=pg.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=vp.width;canvas.height=vp.height;
      await pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      // JPEG 65% 품질로 압축
      G.pdfImages.push(canvas.toDataURL('image/jpeg',0.65).split(',')[1]);
    }
    // 미리보기: 1페이지 썸네일
    const prev=document.createElement('img');
    prev.src='data:image/jpeg;base64,'+G.pdfImages[0];
    prev.style.cssText='max-width:100%;border-radius:6px;max-height:150px;object-fit:contain;';
    const previewEl=document.getElementById('pdf-prev-text');
    previewEl.innerHTML='';previewEl.appendChild(prev);
    document.getElementById('pdf-preview').style.display='block';
    document.getElementById('gen-btn').disabled=false;
    document.getElementById('gen-status').textContent=`✅ ${maxPages}/${pdf.numPages}페이지 변환 완료`;
  }catch(e){document.getElementById('gen-status').textContent='❌ 변환 실패: '+e.message;}
}

// ── AI 문제 생성 (Groq 직접 호출) ────────────────────────
window.generateQs=async function(){
  const key=localStorage.getItem('groq_key');
  if(!key){alert('설정에서 Groq API 키를 먼저 입력하세요!');nav('settings',document.querySelectorAll('.sb-btn')[5]);return;}
  if(!G.pdfImages.length){alert('PDF를 먼저 업로드하세요');return;}
  const qcnt=document.getElementById('n-qcnt').value;
  const diff=document.getElementById('n-diff').value;
  prog(true,'Vision AI 요청 중...',15);
  document.getElementById('gen-btn').disabled=true;
  document.getElementById('q-preview').innerHTML='';
  document.getElementById('save-sec').style.display='none';
  G.genQs=[];
  const prompt=`이 PDF 페이지 이미지들을 분석하여 ${diff} 난이도의 4지선다 객관식 문제 ${qcnt}개를 생성하세요.\n\n반드시 아래 JSON 형식으로만 응답 (다른 텍스트 절대 없이):\n{"questions":[{"question":"문제 내용","options":["① 보기1","② 보기2","③ 보기3","④ 보기4"],"answer":0,"explanation":"해설"}]}\nanswer는 정답 index(0~3). 반드시 한국어로 작성.`;
  // 이미지 content 배열 구성 (페이지별 이미지 + 텍스트 프롬프트)
  const imgContents=G.pdfImages.map(b64=>({type:'image_url',image_url:{url:`data:image/jpeg;base64,${b64}`}}));
  try{
    prog(true,'Vision AI가 이미지 분석 중...',45);
    const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
      body:JSON.stringify({
        model:'meta-llama/llama-4-scout-17b-16e-instruct', // Vision 지원 모델
        max_tokens:8000,
        temperature:.7,
        messages:[{role:'user',content:[...imgContents,{type:'text',text:prompt}]}]
      })
    });
    prog(true,'응답 파싱 중...',80);
    const data=await res.json();
    if(!res.ok)throw new Error(data.error?.message||'API 오류 '+res.status);
    let raw=data.choices[0].message.content.trim().replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const jsonMatch=raw.match(/\{[\s\S]*\}/);
    if(!jsonMatch)throw new Error('JSON 형식 응답을 찾을 수 없습니다');
    raw=jsonMatch[0];
    const sanitized=raw.replace(/("(?:[^"\\]|\\.)*")/g,m=>m.replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t'));
    let parsed;
    try{
      parsed=JSON.parse(sanitized);
    }catch(e1){
      const partialMatch=sanitized.match(/"questions"\s*:\s*(\[[\s\S]*)/);
      if(!partialMatch)throw new Error('JSON 파싱 실패: '+e1.message);
      let arr=partialMatch[1];
      const lastBrace=arr.lastIndexOf('}');
      if(lastBrace===-1)throw new Error('완성된 문제가 없습니다');
      arr=arr.substring(0,lastBrace+1)+']';
      try{parsed={questions:JSON.parse(arr)};}
      catch(e2){throw new Error('JSON 파싱 실패 (복구 불가): '+e1.message);}
    }
    G.genQs=parsed.questions;
    prog(true,'완료!',100);setTimeout(()=>prog(false),500);
    renderQPreview(G.genQs);
    document.getElementById('save-sec').style.display='block';
    document.getElementById('gen-status').textContent=`✅ ${G.genQs.length}문항 생성 완료 (${G.pdfImages.length}페이지 분석)`;
  }catch(e){prog(false);document.getElementById('gen-status').textContent='❌ 실패: '+e.message;}
  document.getElementById('gen-btn').disabled=false;
};

function prog(show,step='',pct=0){
  document.getElementById('gen-prog').style.display=show?'block':'none';
  if(show){document.getElementById('gen-step').textContent=step;document.getElementById('gen-pct').textContent=pct+'%';document.getElementById('gen-bar').style.width=pct+'%';}
}
function renderQPreview(qs){
  const c=document.getElementById('q-preview');c.innerHTML='';
  qs.forEach((q,i)=>{const d=document.createElement('div');d.className='q-item fi';d.innerHTML=`<div class="q-head"><div class="q-badge">Q${String(i+1).padStart(2,'0')}</div><div class="q-txt">${q.question}</div></div><div class="q-opts">${q.options.map((o,oi)=>`<div class="q-opt${oi===q.answer?' ans':''}"><div class="opt-l">${['A','B','C','D'][oi]}</div>${o}</div>`).join('')}</div>${q.explanation?`<div class="q-exp">💡 ${q.explanation}</div>`:''}`; c.appendChild(d);});
}

// ── 시험 저장 (API) ───────────────────────────────────────
window.saveExam=async function(){
  const name=document.getElementById('n-name').value.trim();
  if(!name){alert('시험 이름을 입력하세요');return;}
  if(!G.genQs.length){alert('문제를 먼저 생성하세요');return;}
  try{
    prog(true,'시험 등록 중...',20);
    const exam=await api('POST','/api/exams',{
      title:name,
      duration:parseInt(document.getElementById('n-dur').value),
      source_text:null
    });
    prog(true,'문제 저장 중...',50);
    for(let i=0;i<G.genQs.length;i++){
      const q=G.genQs[i];
      await api('POST','/api/questions',{
        exam_id:exam.id,type:'choice',
        text:q.question,options:q.options,
        answer:String(q.answer),explanation:q.explanation||''
      });
      prog(true,`문제 저장 중... (${i+1}/${G.genQs.length})`,50+Math.round((i+1)/G.genQs.length*45));
    }
    prog(false);
    await fetchExams();
    alert(`✅ "${name}" 시험 등록 완료!`);
    nav('exams',document.querySelectorAll('.sb-btn')[2]);renderExams();
  }catch(e){prog(false);alert('❌ 등록 실패: '+e.message);}
};

// ── 시험 목록 ─────────────────────────────────────────────
function renderExams(){
  const tb=document.getElementById('exam-tbody');
  if(!G.exams.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:28px">등록 없음</td></tr>';return;}
  const sc={ready:'bb',active:'bg',closed:'bm'};
  const st={ready:'대기',active:'진행중',closed:'종료'};
  tb.innerHTML=G.exams.map(e=>`<tr>
    <td><strong>${e.title}</strong><br><span style="font-size:10px;color:var(--muted)">${new Date(e.created_at).toLocaleDateString('ko')}</span></td>
    <td>${e.question_count||0}문항</td>
    <td>${Math.floor(e.duration/60)}분</td>
    <td>-</td>
    <td><span class="badge ${sc[e.status]||'bb'}">${st[e.status]||'대기'}</span></td>
    <td style="display:flex;gap:6px;">
      <button class="btn btn-ghost btn-sm" onclick="toggleExam(${e.id})">${e.status==='active'?'⏹ 종료':'▶ 활성화'}</button>
      <button class="btn btn-ghost btn-sm" onclick="deleteExam(${e.id})">🗑</button>
    </td></tr>`).join('');
}

window.toggleExam=async id=>{
  const e=G.exams.find(x=>x.id===id);if(!e)return;
  const newStatus=e.status==='active'?'closed':'active';
  try{await api('PATCH',`/api/exams/${id}/status`,{status:newStatus});await fetchExams();renderExams();renderDash();}
  catch(err){alert('상태 변경 실패: '+err.message);}
};

window.deleteExam=async id=>{
  if(!confirm('삭제?'))return;
  try{await api('DELETE',`/api/exams/${id}`);await fetchExams();renderExams();renderDash();}
  catch(err){alert('삭제 실패: '+err.message);}
};

// ── 실시간 감독 ───────────────────────────────────────────
async function renderMonitor(){
  let students=[];
  try{students=await api('GET','/api/admin/monitor/live');}
  catch(e){console.warn('monitor:',e);}
  const grid=document.getElementById('stu-grid');
  if(!students.length){
    grid.innerHTML='<div style="font-size:12px;color:var(--muted)">응시 중인 학생 없음</div>';
    document.getElementById('mon-live').classList.remove('show');
    document.getElementById('live-chip').classList.remove('show');
    document.getElementById('alert-badge').classList.remove('show');
    return;
  }
  document.getElementById('mon-live').classList.add('show');
  document.getElementById('live-chip').classList.add('show');
  document.getElementById('mon-exam').textContent=students[0].exam_title||'진행 중';
  document.getElementById('alert-badge').classList.toggle('show',students.some(s=>s.warning_count>=2));
  grid.innerHTML=students.map(s=>{
    const warns=s.warning_count||0;
    const pct=Math.max(0,100-warns*18);
    const col=pct>70?'var(--ok)':pct>40?'var(--warn)':'var(--danger)';
    const lastTime=s.last_timestamp?new Date(s.last_timestamp).toLocaleTimeString('ko'):'';
    return `<div class="stu-card ${warns>=3?'dc':warns>=1?'wc':''}">
      <div class="stu-top"><div><div class="stu-name">${s.user_name}</div><div class="stu-id">${s.exam_title}</div></div>
      <div>${warns>0?`<span class="badge bw">⚠ ${warns}회</span>`:'<span class="badge bg">정상</span>'}</div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--muted)">집중도</span><span style="color:${col}">${pct}%</span></div>
      <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${col}"></div></div>
      <div style="font-size:10px;color:var(--muted);margin-top:7px">${lastTime}</div>
      <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;font-size:11px" onclick="openIntervene(${s.attempt_id},'${s.user_name}')">관리자 개입</button>
    </div>`;
  }).join('');
}

// ── 관리자 개입 ───────────────────────────────────────────
let _interveneAttemptId = null;
window.openIntervene = function(attemptId, userName) {
  _interveneAttemptId = attemptId;
  document.getElementById('iv-title').textContent = `개입: ${userName}`;
  document.getElementById('iv-sub').textContent = `Attempt ID: ${attemptId}`;
  document.getElementById('iv-msg').value = '';
  document.getElementById('intervene-modal').style.display = 'flex';
};
window.closeIntervene = () => { document.getElementById('intervene-modal').style.display = 'none'; };
window.interveneAction = async function(type) {
  if(!_interveneAttemptId) return;
  try {
    if(type === 'pause') {
      await api('PATCH', `/api/admin/attempts/${_interveneAttemptId}/status`, {status: 'under_review'});
      alert('시험이 검토 상태로 변경되었습니다.');
    } else if(type === 'terminate') {
      if(!confirm('정말 강제 종료하시겠습니까?')) return;
      await api('PATCH', `/api/admin/attempts/${_interveneAttemptId}/status`, {status: 'terminated'});
      alert('시험이 강제 종료되었습니다.');
      closeIntervene();
    } else if(type === 'message') {
      const msg = document.getElementById('iv-msg').value.trim();
      if(!msg) { alert('메시지를 입력하세요'); return; }
      await api('POST', `/api/admin/attempts/${_interveneAttemptId}/message`, {message: msg});
      alert('메시지가 전송되었습니다.');
      document.getElementById('iv-msg').value = '';
    }
  } catch(e) { alert('실패: ' + e.message); }
};

// ── 대시보드 ──────────────────────────────────────────────
function renderDash(){
  document.getElementById('d-exams').textContent=G.exams.length;
  document.getElementById('d-active').textContent=G.exams.filter(e=>e.status==='active').length;
  document.getElementById('d-warns').textContent=G.logs.filter(l=>l.severity==='warn'||l.severity==='danger').length;
  document.getElementById('d-term').textContent=G.logs.filter(l=>l.event&&l.event.includes('강제 종료')).length;
  document.getElementById('d-examlist').innerHTML=G.exams.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(30,42,61,.4)"><span style="font-size:13px;font-weight:600">${e.title}</span><span class="badge ${e.status==='active'?'bg':'bb'}">${e.status==='active'?'진행중':'대기'}</span></div>`).join('')||'<div style="font-size:12px;color:var(--muted)">시험을 먼저 생성하세요</div>';
  // 최근 경고 응시자
  const warnStudents = G.logs.filter(l => l.severity === 'warn' || l.severity === 'danger')
    .reduce((acc, l) => {
      const key = l.user_name;
      if(!acc[key]) acc[key] = {name: l.user_name, exam: l.exam_title, count: 0, last: l.timestamp};
      acc[key].count++;
      return acc;
    }, {});
  const warnList = Object.values(warnStudents).sort((a,b) => b.count - a.count).slice(0, 5);
  document.getElementById('d-warnlist').innerHTML = warnList.length
    ? warnList.map(w => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(30,42,61,.4)">
        <div><span style="font-size:13px;font-weight:600">${w.name}</span><span style="font-size:10px;color:var(--muted);margin-left:8px">${w.exam}</span></div>
        <span class="badge bw">⚠ ${w.count}회</span></div>`).join('')
    : '<div style="font-size:12px;color:var(--muted)">경고 없음</div>';
}

// ── 설정 ──────────────────────────────────────────────────
window.saveAdmin=()=>{
  const v=document.getElementById('set-admin').value.trim()||'관리자';
  localStorage.setItem('admin_name',v);
  document.getElementById('admin-name-disp').textContent=v;
  alert('저장됨');
};

window.saveGroq=async()=>{
  const key=document.getElementById('set-groq').value.trim();
  try{
    await api('PUT','/api/admin/settings',{groq_key:key});
    localStorage.setItem('groq_key',key);
    alert('✅ Groq API 키 저장 완료');
  }catch(e){alert('저장 실패: '+e.message);}
};


window.saveProctor=async()=>{
  try{
    await api('PUT','/api/admin/settings',{
      gaze_threshold:parseInt(document.getElementById('set-gaze').value),
      max_warnings:parseInt(document.getElementById('set-maxw').value)
    });
    alert('저장됨');
  }catch(e){alert('저장 실패: '+e.message);}
};

// ── 응시 결과 ─────────────────────────────────────────────
function initResultsPage(){
  const sel=document.getElementById('res-exam-sel');
  const cur=sel.value;
  sel.innerHTML='<option value="">-- 시험을 선택하세요 --</option>'+G.exams.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
  sel.value=cur;
  if(cur)loadResults();
}

window.loadResults=async function(){
  const examId=document.getElementById('res-exam-sel').value;
  const card=document.getElementById('res-table-card');
  if(!examId){card.style.display='none';return;}
  const exam=G.exams.find(e=>e.id==examId);
  document.getElementById('res-table-title').textContent=`${exam?.title||''} — 응시자 목록`;
  card.style.display='block';
  const tb=document.getElementById('res-tbody');
  tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">불러오는 중...</td></tr>';
  try{
    const rows=await api('GET',`/api/admin/exams/${examId}/results`);
    document.getElementById('res-count').textContent=`총 ${rows.length}명`;
    if(!rows.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">응시자 없음</td></tr>';return;}
    const sc={submitted:'bg',terminated:'bd',in_progress:'bw',under_review:'bm'};
    const st={submitted:'제출완료',terminated:'강제종료',in_progress:'응시중',under_review:'검토중'};
    tb.innerHTML=rows.map(r=>`<tr>
      <td><strong>${r.user_name}</strong></td>
      <td><span class="badge ${sc[r.status]||'bb'}">${st[r.status]||r.status}</span></td>
      <td style="font-weight:700;color:${r.score>=80?'var(--ok)':r.score>=60?'var(--warn)':'var(--danger)'}">${r.score!=null?r.score+'점':'-'}</td>
      <td style="font-weight:700;color:${(r.warning_count||0)>=3?'var(--danger)':(r.warning_count||0)>=2?'var(--warn)':'var(--text)'}">${r.warning_count||0}회${(r.warning_count||0)>=3?' 🚨':''}</td>
      <td>${r.total_away_time||0}초</td>
      <td>${r.voice_alerts||0}회</td>
      <td style="font-size:11px;color:var(--muted)">${r.started_at?new Date(r.started_at).toLocaleString('ko'):'-'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="showResultDetail(${r.attempt_id},'${r.user_name}')">상세</button></td>
    </tr>`).join('');
  }catch(e){tb.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger)">로드 실패: ${e.message}</td></tr>`;}
};

window.showResultDetail = async function(attemptId, userName) {
  const modal = document.getElementById('res-modal');
  modal.style.display = 'flex';
  document.getElementById('rm-title').textContent = `${userName} — 상세 결과`;
  document.getElementById('rm-sub').textContent = '';
  document.getElementById('rm-stats').innerHTML = '<div style="color:var(--muted);font-size:12px;grid-column:1/-1">불러오는 중...</div>';
  ['rm-answers','rm-events','rm-voice','rm-chat'].forEach(id => document.getElementById(id).innerHTML = '');
  switchTab('answers');
  try {
    const r = await api('GET', `/api/admin/attempts/${attemptId}/result`);
    const dur = r.submitted_at && r.started_at ? Math.round((new Date(r.submitted_at) - new Date(r.started_at)) / 1000) : null;
    document.getElementById('rm-sub').textContent = r.exam_title;
    document.getElementById('rm-stats').innerHTML = [
      ['점수', r.score != null ? r.score + '점' : '-', r.score >= 80 ? 'var(--ok)' : r.score >= 60 ? 'var(--warn)' : 'var(--danger)'],
      ['경고', `${r.warning_count || 0}회`, (r.warning_count || 0) >= 4 ? 'var(--danger)' : 'var(--warn)'],
      ['이탈', `${r.total_away_time || 0}초`, 'var(--muted)'],
      ['소요', dur ? `${Math.floor(dur/60)}분 ${dur%60}초` : '-', 'var(--muted)'],
    ].map(([l,v,c]) => `<div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:700;color:${c}">${v}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">${l}</div></div>`).join('');

    // 탭1: 답안
    if (!r.answers || !r.answers.length) {
      document.getElementById('rm-answers').innerHTML = '<div style="font-size:12px;color:var(--muted)">제출된 답안 없음</div>';
    } else {
      document.getElementById('rm-answers').innerHTML = r.answers.map(a => {
        const opts = a.options || [];
        const correct = parseInt(a.correct_answer);
        const selected = a.selected;
        const ok = a.is_correct;
        return `<div style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:10px;border-left:3px solid ${ok===1?'var(--ok)':ok===0?'var(--danger)':'var(--border)'}">
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
            <span style="background:var(--bg2);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap">Q${a.number}</span>
            <span style="font-size:13px">${a.text}</span>
            <span style="margin-left:auto;font-size:18px">${ok===1?'✅':ok===0?'❌':'—'}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${opts.map((o, oi) => {
              const isSel = oi === selected, isAns = oi === correct;
              const bg = isAns ? 'rgba(34,197,94,.15)' : isSel && !isAns ? 'rgba(239,68,68,.15)' : 'transparent';
              const border = isAns ? '1px solid var(--ok)' : isSel ? '1px solid var(--danger)' : '1px solid transparent';
              return `<div style="font-size:12px;padding:5px 8px;border-radius:6px;background:${bg};border:${border}">${['A','B','C','D'][oi]} ${o}${isAns?' ✓':''}${isSel&&!isAns?' ✗':''}</div>`;
            }).join('')}
          </div>
          ${a.explanation ? `<div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">💡 ${a.explanation}</div>` : ''}
        </div>`;
      }).join('');
    }

    // 로그 전체 로드
    const allLogs = await api('GET', `/api/admin/attempts/${attemptId}/logs`);
    const chatLogs = allLogs.filter(l => l.event && l.event.startsWith('AI 면담'));
    const voiceLogs = allLogs.filter(l => l.event === '음성 기록');
    const eventLogs = allLogs.filter(l => l.event && !l.event.startsWith('AI 면담') && l.event !== '음성 기록');

    // 탭2: 이벤트
    if (eventLogs.length) {
      const sevIcon = {danger:'🚨',warn:'⚠️',ok:'✅',info:'ℹ️'};
      const sevColor = {danger:'var(--danger)',warn:'var(--warn)',ok:'var(--ok)',info:'var(--muted)'};
      document.getElementById('rm-events').innerHTML = `<div style="display:flex;flex-direction:column;gap:4px">
        ${eventLogs.map(l => {
          const ic = sevIcon[l.severity] || '•';
          const co = sevColor[l.severity] || 'var(--muted)';
          const ts = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('ko') : '-';
          return `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 10px;background:var(--bg3);border-radius:6px;border-left:3px solid ${co}">
            <span style="font-size:13px;flex-shrink:0">${ic}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <span style="font-size:12px;font-weight:700;color:${co}">${l.event || ''}</span>
                <span style="font-size:10px;color:var(--muted);white-space:nowrap">${ts}</span>
              </div>
              ${l.detail ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;word-break:break-all">${l.detail}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    } else {
      document.getElementById('rm-events').innerHTML = '<div style="font-size:12px;color:var(--muted)">이벤트 없음</div>';
    }

    // 탭3: 음성기록
    if (voiceLogs.length) {
      document.getElementById('rm-voice').innerHTML = `
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px">총 ${voiceLogs.length}건의 음성이 인식되었습니다.</div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto">
          ${[...voiceLogs].reverse().map(l => {
            const ts = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('ko') : '-';
            const isSusp = allLogs.some(x => x.event === '음성 경고' && Math.abs(new Date(x.timestamp) - new Date(l.timestamp)) < 3000);
            return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 12px;background:${isSusp?'rgba(239,68,68,.08)':'var(--bg3)'};border-radius:6px;border-left:3px solid ${isSusp?'var(--danger)':'var(--border)'}">
              <span style="font-size:10px;color:var(--muted);white-space:nowrap;margin-top:2px;min-width:50px">${ts}</span>
              <span style="font-size:12px;flex:1;line-height:1.5">${l.detail || ''}</span>
              ${isSusp ? '<span style="font-size:10px;color:var(--danger);font-weight:700;white-space:nowrap">⚠ 의심</span>' : ''}
            </div>`;
          }).join('')}
        </div>`;
    } else {
      document.getElementById('rm-voice').innerHTML = '<div style="font-size:12px;color:var(--muted)">음성 기록 없음</div>';
    }

    // 탭4: AI 면담
    if (chatLogs.length) {
      document.getElementById('rm-chat').innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
        ${chatLogs.map(l => {
          const isAI = l.event === 'AI 면담: AI';
          const isStudent = l.event === 'AI 면담: 응시자';
          const bg = isAI ? 'rgba(99,102,241,.12)' : isStudent ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.04)';
          const border = isAI ? '2px solid rgba(99,102,241,.4)' : isStudent ? '2px solid rgba(34,197,94,.3)' : '2px solid var(--border)';
          const label = isAI ? '🤖 AI 감독관' : isStudent ? '👤 응시자' : `📋 ${l.event}`;
          const ts = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('ko') : '-';
          return `<div style="background:${bg};border-left:${border};border-radius:0 8px 8px 0;padding:10px 14px;font-size:12px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-weight:700">${label}</span>
              <span style="color:var(--muted);font-size:10px">${ts}</span>
            </div>
            <div style="color:var(--text);line-height:1.6;white-space:pre-wrap">${l.detail || ''}</div>
          </div>`;
        }).join('')}
      </div>`;
    } else {
      document.getElementById('rm-chat').innerHTML = '<div style="font-size:12px;color:var(--muted)">AI 면담 기록 없음</div>';
    }

  } catch(e) {
    document.getElementById('rm-stats').innerHTML = `<div style="color:var(--danger);font-size:12px;grid-column:1/-1">로드 실패: ${e.message}</div>`;
  }
};

window.switchTab = function(name) {
  ['answers','events','voice','chat'].forEach(t => {
    document.getElementById('rm-tab-' + t).style.display = t === name ? 'block' : 'none';
    document.getElementById('tab-' + t).classList.toggle('on', t === name);
  });
};

window.closeResultModal=()=>{document.getElementById('res-modal').style.display='none';};

// ── 초기화 ────────────────────────────────────────────────
(async()=>{
  injectLoginModal();
  const an=localStorage.getItem('admin_name')||'관리자';
  document.getElementById('admin-name-disp').textContent=an;
  document.getElementById('set-admin').value=an;
  if(token){
    try{await api('GET','/api/auth/me');loadAll();}
    catch{token='';localStorage.removeItem('admin_token');document.getElementById('login-modal').style.display='flex';}
  }else{
    document.getElementById('login-modal').style.display='flex';
  }
})();
