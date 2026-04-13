const API='https://proctorai-production.up.railway.app';
let studentToken='';
const S={studentId:'',studentName:'',examId:null,attemptId:null,examName:'',duration:1800,timeLeft:1800,questions:[],answers:{},startTime:null,timerInt:null,cmdPollInt:null,warns:0,maxWarns:6,gazeAway:false,gazeAwayTime:0,totalAway:0,gazeTimer:null,gazeThreshold:3,voiceAlerts:0,paused:false,terminated:false,chatTurn:0,chatHistory:[],recognition:null};
// 키워드 목록은 Groq API 없을 때 폴백으로만 사용
const kwds=['답 알려','정답이 뭐','answer is','solution is','뭐가 정답','몇번이야','몇번인지'];
let _voiceLastCheck=0; // Groq 음성 분석 쿨다운
let _lastMsgId=0; // 관리자 메시지 폴링용

// ── API 헬퍼 ──────────────────────────────────────────────
async function apiCall(method,path,body){
  const h={'Content-Type':'application/json'};
  if(studentToken)h['Authorization']=`Bearer ${studentToken}`;
  const o={method,headers:h};
  if(body!==undefined)o.body=JSON.stringify(body);
  const r=await fetch(API+path,o);
  if(r.status===204)return null;
  const d=await r.json();
  if(!r.ok)throw new Error(d.detail||JSON.stringify(d));
  return d;
}

// ── 학생 자동 인증 (학번 = name + password) ───────────────
async function authStudent(studentId){
  try{
    const r=await apiCall('POST','/api/auth/login',{name:studentId,password:studentId});
    studentToken=r.token;return true;
  }catch{}
  try{
    await apiCall('POST','/api/auth/register',{name:studentId,password:studentId,role:'student'});
    const r=await apiCall('POST','/api/auth/login',{name:studentId,password:studentId});
    studentToken=r.token;return true;
  }catch(e){console.error('authStudent:',e);return false;}
}

// ── 시험 목록 로드 ────────────────────────────────────────
async function loadExams(studentId){
  const sel=document.getElementById('l-exam');
  sel.innerHTML='<option value="">로딩 중...</option>';
  try{
    if(!await authStudent(studentId)){
      sel.innerHTML='<option value="">인증 실패 — 학번을 확인하세요</option>';
      return;
    }
    const exams=await apiCall('GET','/api/student/exams');
    if(!exams.length){
      sel.innerHTML='<option value="">활성 시험 없음 (관리자에게 문의)</option>';
    }else{
      sel.innerHTML='<option value="">-- 시험 선택 --</option>'+exams.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
    }
  }catch(e){
    sel.innerHTML='<option value="">시험을 불러올 수 없습니다</option>';
    console.error(e);
  }
}

// ── 권한 확인 (카메라 + 마이크) ──────────────────────────
async function checkPermissions(){
  while(true){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      stream.getTracks().forEach(t=>t.stop()); // 확인 후 즉시 해제
      return true;
    }catch(e){
      const denied=e.name==='NotAllowedError'||e.name==='PermissionDeniedError';
      const msg=denied
        ?'⛔ 카메라와 마이크 접근이 거부되었습니다.\n\n시험 응시를 위해 반드시 허용이 필요합니다.\n\n브라우저 주소창 왼쪽 🔒 아이콘 → 카메라/마이크 → 허용\n\n허용 후 확인을 누르세요.'
        :'⚠️ 카메라 또는 마이크를 찾을 수 없습니다.\n\n장치가 연결되어 있는지 확인 후 확인을 누르세요.';
      alert(msg);
      // 허용 여부 재확인
      try{
        const pCam=await navigator.permissions.query({name:'camera'});
        const pMic=await navigator.permissions.query({name:'microphone'});
        if(pCam.state==='granted'&&pMic.state==='granted')return true;
      }catch(_){}
      // 계속 루프 (허용할 때까지)
    }
  }
}

// ── 시험 시작 ─────────────────────────────────────────────
window.startExam=async function(){
  const id=document.getElementById('l-id').value.trim();
  const name=document.getElementById('l-name').value.trim();
  const examId=document.getElementById('l-exam').value;
  if(!id||!name){alert('학번과 이름을 입력하세요');return;}
  if(!examId){alert('시험을 선택하세요');return;}
  // 카메라 + 마이크 권한 확인 (허용 전까지 진행 불가)
  const btn=document.querySelector('[onclick="startExam()"]');
  if(btn){btn.disabled=true;btn.textContent='권한 확인 중...';}
  const permitted=await checkPermissions();
  if(btn){btn.disabled=false;btn.textContent='시험 시작';}
  if(!permitted)return;
  if(!studentToken){
    if(!await authStudent(id)){alert('인증 실패. 학번을 확인하세요.');return;}
  }
  try{
    const r=await apiCall('POST',`/api/student/exams/${examId}/start`);
    const {attempt_id,exam,questions}=r;
    // 관리자 설정 로드 (감독 기준 — Groq 키는 서버에서만 보관)
    let maxW=6;let gazeT=3;
    try{
      const cfg=await apiCall('GET','/api/student/settings');
      maxW=cfg.max_warnings||6;
      gazeT=cfg.gaze_threshold||3;
    }catch(e){console.warn('설정 로드 실패:',e);}
    Object.assign(S,{
      studentId:id,studentName:name,
      examId:exam.id,attemptId:attempt_id,examName:exam.title,
      duration:exam.duration,timeLeft:exam.duration,
      questions,answers:{},startTime:Date.now(),
      maxWarns:maxW,gazeThreshold:gazeT
    });
    document.getElementById('login-screen').style.display='none';
    document.getElementById('exam-screen').style.display='flex';
    document.getElementById('tb-name').textContent=exam.title;
    document.getElementById('p-title').textContent=exam.title;
    document.getElementById('p-qcnt').textContent=questions.length;
    document.getElementById('p-dur').textContent=Math.round(exam.duration/60);
    document.getElementById('p-name').textContent=name;
    document.getElementById('p-id').textContent=id;
    renderQs();updateTimer();
    S.timerInt=setInterval(tick,1000);
    _lastMsgId=0;
    S.cmdPollInt=setInterval(pollCommands,4000);
    addLog('info','시험 시작',exam.title);
    sendLog('info','시험 시작',`${exam.title} | 응시자: ${name}(${id})`);
    sendLog('info','응시자 정보',`이름: ${name} / 학번: ${id}`);
    initCam();initVoice();initWindowGuard();
  }catch(e){
    alert('시험 시작 실패: '+e.message);
  }
};

function renderMath(){
  if(typeof renderMathInElement==='function'){
    renderMathInElement(document.getElementById('q-area'),{
      delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],
      throwOnError:false
    });
  }
}
function renderQs(){
  const a=document.getElementById('q-area');a.innerHTML='';
  S.questions.forEach((q,i)=>{
    const d=document.createElement('div');d.className='q-block fi';
    const opts=q.options||[];
    d.innerHTML=`<div class="q-num">문제 ${String(i+1).padStart(2,'0')}</div><div class="q-text">${q.text}</div><div class="q-options">${opts.map((o,oi)=>`<div class="q-option" id="opt-${i}-${oi}" onclick="selOpt(${i},${oi},${q.id})"><div class="opt-l">${['A','B','C','D'][oi]}</div>${o}</div>`).join('')}</div>`;
    a.appendChild(d);
  });
  renderMath();
}
window.selOpt=(qi,oi,qid)=>{
  document.querySelectorAll(`[id^="opt-${qi}-"]`).forEach(e=>e.classList.remove('sel'));
  document.getElementById(`opt-${qi}-${oi}`).classList.add('sel');
  S.answers[qid]=oi;
};

function tick(){if(S.paused||S.terminated)return;S.timeLeft--;updateTimer();if(S.timeLeft<=0)submitExam();}
function updateTimer(){const m=Math.floor(S.timeLeft/60),s=S.timeLeft%60;const el=document.getElementById('timer');el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;el.className='timer'+(S.timeLeft<120?' td':S.timeLeft<300?' tw':'');}

// ── 카메라 / 시선 추적 (로직 동일) ───────────────────────
async function initCam(){
  try{
    const vid=document.getElementById('cam-vid'),cvs=document.getElementById('cam-cvs'),ctx=cvs.getContext('2d');
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}});
    vid.srcObject=stream;vid.addEventListener('loadedmetadata',()=>{cvs.width=vid.videoWidth;cvs.height=vid.videoHeight;});
    if(typeof FaceMesh!=='undefined'){
      const fm=new FaceMesh({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`});
      fm.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.5,minTrackingConfidence:.5});
      fm.onResults(r=>processLM(r,ctx,cvs));
      const cam=new Camera(vid,{onFrame:async()=>await fm.send({image:vid}),width:640,height:480});
      cam.start();addLog('ok','MediaPipe','얼굴 추적 시작');
    }else simEye();
  }catch(e){addLog('warn','카메라','접근 실패');simEye();}
}
let _awayFrames=0, _nofaceFrames=0;
const AWAY_FRAME_THRESHOLD=45;   // 연속 이탈 프레임 (~1.5초 @ 30fps)
const NOFACE_FRAME_THRESHOLD=60; // 얼굴 미감지 허용 프레임 (~2초 @ 30fps)

function processLM(r,ctx,cvs){
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // 얼굴 미감지 — 일시적 오탐 방지용 버퍼
  if(!r.multiFaceLandmarks||!r.multiFaceLandmarks.length){
    _nofaceFrames=Math.min(_nofaceFrames+1,NOFACE_FRAME_THRESHOLD+5);
    _awayFrames=0;
    if(_nofaceFrames>=NOFACE_FRAME_THRESHOLD)updateGaze(true,.5);
    return;
  }
  _nofaceFrames=0;
  const lm=r.multiFaceLandmarks[0];
  // 468=오른쪽 iris, 473=왼쪽 iris (뷰어 기준)
  // 오른쪽 눈 코너: 33(외측), 133(내측)
  // 왼쪽 눈 코너: 362(내측), 263(외측)
  const li=lm[468], ri=lm[473];
  const lg=(li.x-lm[33].x)/(lm[133].x-lm[33].x);   // 오른쪽 눈: 외→내 정규화
  const rg=(ri.x-lm[362].x)/(lm[263].x-lm[362].x); // 왼쪽 눈: 내→외 정규화
  const avg=(lg+rg)/2; // 정면 응시 시 ~0.5 (수평)
  // 수직: iris Y 위치를 눈꺼풀 상하 기준 정규화 (0=위, 0.5=정면, 1=아래)
  const rEyeH=lm[145].y-lm[159].y, lEyeH=lm[374].y-lm[386].y;
  const lv=rEyeH>0.002?Math.max(0,Math.min(1,(li.y-lm[159].y)/rEyeH)):0.5;
  const rv=lEyeH>0.002?Math.max(0,Math.min(1,(ri.y-lm[386].y)/lEyeH)):0.5;
  const vavg=(lv+rv)/2;
  const away=(avg<0.42||avg>0.57)||(vavg<0.30||vavg>0.42);
  updateGaze(away,avg);
  const w=cvs.width,h=cvs.height;ctx.save();
  ctx.fillStyle=away?'rgba(239,68,68,.85)':'rgba(34,197,94,.85)';
  [[li.x,li.y],[ri.x,ri.y]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x*w,y*h,4,0,Math.PI*2);ctx.fill();});
  [[362,385,387,263,373,380],[33,160,158,133,153,144]].forEach(pts=>{ctx.beginPath();pts.forEach((i,idx)=>{const p=lm[i];idx===0?ctx.moveTo(p.x*w,p.y*h):ctx.lineTo(p.x*w,p.y*h);});ctx.closePath();ctx.strokeStyle=away?'rgba(239,68,68,.5)':'rgba(34,197,94,.5)';ctx.lineWidth=1.5;ctx.stroke();});
  ctx.restore();
}
function simEye(){setInterval(()=>{if(S.terminated||S.paused)return;updateGaze(Math.random()<.05,Math.random());},700);addLog('info','시뮬레이션','데모 모드');}
function updateGaze(away,val){
  if(S.paused||S.terminated)return;
  // 연속 프레임 카운터 — 일시적 튐 무시
  if(away){_awayFrames=Math.min(_awayFrames+1,AWAY_FRAME_THRESHOLD+5);}
  else{_awayFrames=0;}
  const stableAway=_awayFrames>=AWAY_FRAME_THRESHOLD;
  const pct=Math.max(0,Math.min(100,stableAway?18:68+val*32));
  const fill=document.getElementById('gaze-fill');fill.style.width=pct+'%';fill.style.background=stableAway?'var(--danger)':pct>70?'var(--ok)':'var(--warn)';
  document.getElementById('gaze-lbl').textContent=stableAway?'⚠ 시선 이탈':'시선 정상';
  const fe=document.getElementById('st-focus');fe.textContent=Math.round(pct)+'%';fe.className='sbox-v '+(pct>70?'g':pct>40?'w':'d');
  if(stableAway&&!S.gazeAway){S.gazeAway=true;S.gazeAwayTime=0;S.gazeTimer=setInterval(()=>{if(!S.gazeAway||S.paused||S.terminated){clearInterval(S.gazeTimer);return;}S.gazeAwayTime++;S.totalAway++;document.getElementById('st-away').textContent=S.totalAway+'s';if(S.gazeAwayTime>=S.gazeThreshold){gazeWarn();clearInterval(S.gazeTimer);}},1000);}
  else if(!stableAway&&S.gazeAway){S.gazeAway=false;S.gazeAwayTime=0;clearInterval(S.gazeTimer);}
}
function gazeWarn(){
  S.warns++;updateWB();
  const isNoFace=_nofaceFrames>=NOFACE_FRAME_THRESHOLD;
  const evtName=isNoFace?'얼굴 미감지':'시선 이탈';
  addLog('warn',evtName,`${S.gazeThreshold}초+ (경고 ${S.warns}/${S.maxWarns})`);
  sendLog('warn',evtName,`${S.gazeThreshold}초+ ${evtName} — 경고 ${S.warns}회`);
  const we=document.getElementById('st-warns');we.textContent=S.warns+'회';we.className='sbox-v '+(S.warns>=S.maxWarns?'d':'w');
  if(S.warns>=S.maxWarns){terminate('경고 누적 — 0점 퇴장');}
  else if(S.warns%2===0){startChat(isNoFace?'noface':'gaze');}
  else{showWarn(evtName+' 감지',`${isNoFace?'카메라에 얼굴이 감지되지 않습니다.':'화면을 '+S.gazeThreshold+'초 이상 이탈했습니다.'}\n경고 ${S.warns}회`);flash('w');}
}

// ── Groq 음성 분석 (백엔드 프록시 — 키 노출 없음) ─────────
async function analyzeVoiceGroq(text){
  const now=Date.now();
  if(now-_voiceLastCheck<5000)return false; // 5초 쿨다운
  _voiceLastCheck=now;
  const topics=S.questions.slice(0,3).map(q=>q.text||'').join(' / ');
  const prompt=`시험 감독 중입니다. 응시자 발언: "${text}"\n시험 주제: ${topics}\n\n이 발언이 부정행위(답 요청, 문제 내용 언급, 타인에게 도움 요청)에 해당하면 YES, 아니면 NO만 답하세요.`;
  try{
    const d=await apiCall('POST','/api/student/groq/chat',{
      model:'llama-3.1-8b-instant',max_tokens:5,temperature:0,
      messages:[{role:'user',content:prompt}]
    });
    return d.choices[0].message.content.trim().toUpperCase().startsWith('YES');
  }catch(e){
    console.warn('Groq voice:',e);
    return kwds.some(k=>text.toLowerCase().includes(k)); // 폴백: 키워드 매칭
  }
}

function triggerVoiceWarn(text){
  S.voiceAlerts++;
  const ve=document.getElementById('st-voice');ve.textContent=S.voiceAlerts+'회';ve.className='sbox-v '+(S.voiceAlerts>=3?'d':'w');
  addLog('danger','음성 경고',`의심 발언: "${text.substring(0,40)}"`);
  sendLog('danger','음성 경고',`의심 발언: "${text.substring(0,40)}"`);
  S.warns++;updateWB();
  if(S.warns>=S.maxWarns){terminate('경고 누적 — 0점 퇴장');}
  else if(S.warns%2===0){startChat('voice');}
  else{showWarn('의심 발언 감지',`"${text.substring(0,30)}" 감지\n경고 ${S.warns}회`);flash('d');}
}

// ── 음성 감지 ─────────────────────────────────────────────
function initVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){addLog('warn','음성','미지원');return;}
  const rec=new SR();rec.lang='ko-KR';rec.continuous=true;rec.interimResults=true;
  rec.onstart=()=>{document.getElementById('v-status').textContent='감지 중';document.querySelectorAll('.wave-bar').forEach(b=>b.classList.add('act'));addLog('ok','음성','마이크 활성화');};
  let _lastVoiceLog='';let _interimTimer=null;
  rec.onresult=async e=>{
    if(S.paused||S.terminated)return;
    let finalTxt='';let interimTxt='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal)finalTxt+=e.results[i][0].transcript;
      else interimTxt+=e.results[i][0].transcript;
    }
    const display=(finalTxt||interimTxt).trim();
    if(!display)return;
    document.getElementById('v-txt').textContent=`"${display}"`;
    // 확정 결과 즉시 저장
    if(finalTxt.trim().length>1&&finalTxt.trim()!==_lastVoiceLog){
      _lastVoiceLog=finalTxt.trim();
      if(_interimTimer){clearTimeout(_interimTimer);_interimTimer=null;}
      sendLog('info','음성 기록',finalTxt.trim());
    }
    // interim이 3초 이상 유지되면 저장 (확정 안 되는 경우 대비)
    if(interimTxt.trim().length>3){
      clearTimeout(_interimTimer);
      _interimTimer=setTimeout(()=>{
        const txt=interimTxt.trim();
        if(txt&&txt!==_lastVoiceLog){_lastVoiceLog=txt;sendLog('info','음성 기록',txt);}
      },3000);
    }
  };
  rec.onerror=e=>{if(e.error!=='no-speech')addLog('warn','음성 오류',e.error);};
  rec.onend=()=>{if(!S.paused&&!S.terminated)setTimeout(()=>{try{rec.start();}catch(_){}},500);};
  S.recognition=rec;try{rec.start();}catch(_){}
}

// ── 창 이탈 / 최소화 감지 ─────────────────────────────────
function initWindowGuard(){
  let hiddenAt=0;
  document.addEventListener('visibilitychange',()=>{
    if(S.terminated||!S.attemptId)return;
    if(document.hidden){
      hiddenAt=Date.now();
      addLog('warn','화면 이탈','다른 탭/창으로 전환');
      sendLog('warn','화면 이탈','다른 탭 또는 창으로 전환됨');
      S.warns++;updateWB();
      if(S.warns>=S.maxWarns){terminate('경고 누적 — 0점 퇴장');}
      else if(S.warns%2===0){startChat('window');}
      else{showWarn('화면 이탈 감지',`다른 창 또는 탭으로 전환되었습니다.\n경고 ${S.warns}회`);flash('w');}
    }else{
      const sec=hiddenAt?Math.round((Date.now()-hiddenAt)/1000):0;
      addLog('info','화면 복귀',`${sec}초 후 복귀`);
      sendLog('info','화면 복귀',`${sec}초 자리 비움 후 복귀`);
    }
  });
  // 창 최소화 / 다른 프로그램 전환 감지 (즉시)
  window.addEventListener('blur',()=>{
    if(S.terminated||!S.attemptId||document.hidden)return;
    addLog('warn','창 포커스 이탈','다른 프로그램/창으로 전환');
    sendLog('warn','창 포커스 이탈','다른 프로그램/창으로 전환됨');
    S.warns++;updateWB();
    if(S.warns>=S.maxWarns){terminate('경고 누적 — 0점 퇴장');}
    else if(S.warns%2===0){startChat('window');}
    else{showWarn('창 전환 감지',`다른 프로그램 또는 최소화가 감지되었습니다.\n경고 ${S.warns}회`);flash('w');}
  });
  // 창 닫기 = 0점 처리
  window.addEventListener('beforeunload',()=>{
    if(!S.attemptId||S.terminated)return;
    S.terminated=true;
    fetch(`${API}/api/student/attempts/${S.attemptId}/submit`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${studentToken}`},
      body:JSON.stringify({answers:[]}),
      keepalive:true
    });
  });
}

function showWarn(title,msg){if(S.paused||S.terminated)return;document.getElementById('ov-warn-title').textContent=title;document.getElementById('ov-warn-msg').textContent=msg;document.getElementById('ov-warn').classList.add('act');S.paused=true;document.getElementById('exam-content').classList.add('blurred');setStatus('w','경고 '+S.warns+'/'+S.maxWarns);setTimeout(()=>{if(document.getElementById('ov-warn').classList.contains('act'))dismissWarn();},8000);}
window.dismissWarn=()=>{document.getElementById('ov-warn').classList.remove('act');S.paused=false;S.gazeAway=false;S.gazeAwayTime=0;clearInterval(S.gazeTimer);_awayFrames=0;_nofaceFrames=0;document.getElementById('exam-content').classList.remove('blurred');setStatus('ok','정상 감독 중');addLog('info','경고 확인','재개');};
function flash(t){const el=document.getElementById('b-flash');el.className='b-flash bf-'+t;setTimeout(()=>el.className='b-flash',2000);}
function updateWB(){for(let i=1;i<=6;i++){const b=document.getElementById('wb'+i);if(!b)return;if(i<=S.warns)b.classList.add(i===S.maxWarns?'crit':'used');}}

// ── AI 면담 (로직 동일) ───────────────────────────────────
async function startChat(reason){
  if(S.paused||S.terminated)return;S.paused=true;document.getElementById('exam-content').classList.add('blurred');document.getElementById('ov-warn').classList.remove('act');if(S.recognition){try{S.recognition.stop();}catch(_){}}
  S.chatHistory=[];S.chatTurn=0;document.getElementById('chat-msgs').innerHTML='';document.getElementById('resume-btn').style.display='none';document.getElementById('ov-chat').classList.add('act');setStatus('d','AI 면담 중');
  const rm={gaze:'시선이 반복 이탈',voice:'의심 발언이 반복 감지',window:'화면/창 이탈이 반복 감지'};
  const msg=`안녕하세요, ${S.studentName}님. 저는 ProctorAI 감독 시스템입니다.\n\n${rm[reason]}되었습니다. 시험 공정성을 위해 간단한 확인이 필요합니다.\n\n현재 시험 외 다른 자료나 도움을 받고 있습니까?`;
  await typeMsg('ai',msg);S.chatHistory.push({role:'assistant',content:msg});S.chatTurn=1;addLog('danger','AI 면담 시작',rm[reason]);sendLog('danger','AI 면담 시작',rm[reason]);
}
window.sendChat=async function(){
  const inp=document.getElementById('chat-inp');const txt=inp.value.trim();if(!txt)return;inp.value='';
  await typeMsg('user',txt);S.chatHistory.push({role:'user',content:txt});
  sendLog('info','AI 면담: 응시자',txt);
  const reply=await getAIReply();await typeMsg('ai',reply);S.chatHistory.push({role:'assistant',content:reply});
  sendLog('info','AI 면담: AI',reply);
  S.chatTurn++;
  if(S.chatTurn>=3){document.getElementById('resume-btn').style.display='inline-flex';addLog('info','AI 면담','완료');}
};
async function getAIReply(){
  // 백엔드 프록시 경유 — API 키가 브라우저에 전달되지 않음
  try{
    const sys=`당신은 온라인 시험 감독 AI. 응시자 ${S.studentName}(${S.studentId}), 시험: ${S.examName}. 2~3문장 한국어만.`;
    const d=await apiCall('POST','/api/student/groq/chat',{
      model:'llama-3.1-8b-instant',max_tokens:250,temperature:.7,
      system:sys,messages:S.chatHistory
    });
    return d.choices[0].message.content.trim();
  }catch(e){
    console.warn('getAIReply:',e);
    const sims=[`이해합니다, ${S.studentName}님. 혹시 주변 소리나 다른 화면으로 인해 시선이 이탈된 이유를 설명해 주시겠습니까?`,'말씀 감사합니다. 추가 위반 시 시험이 자동 종료됩니다. 이해하셨나요?','확인되었습니다. 면담을 종료하겠습니다. 최선을 다해 응시해 주세요.'];
    return sims[Math.min(S.chatTurn-1,2)];
  }
}
function typeMsg(role,text){return new Promise(res=>{const c=document.getElementById('chat-msgs');const d=document.createElement('div');d.className='chat-msg cm-'+role;c.appendChild(d);c.scrollTop=c.scrollHeight;if(role==='ai'){const t=document.createElement('div');t.className='typing';t.innerHTML='<div class="tdot"></div><div class="tdot"></div><div class="tdot"></div>';d.appendChild(t);c.scrollTop=c.scrollHeight;setTimeout(()=>{d.innerHTML=text.replace(/\n/g,'<br>');c.scrollTop=c.scrollHeight;res();},900+Math.random()*700);}else{d.textContent=text;c.scrollTop=c.scrollHeight;res();}});}
window.resumeChat=()=>{document.getElementById('ov-chat').classList.remove('act');S.paused=false;S.gazeAway=false;S.gazeAwayTime=0;clearInterval(S.gazeTimer);_awayFrames=0;_nofaceFrames=0;document.getElementById('exam-content').classList.remove('blurred');setStatus('ok','정상 감독 중');addLog('ok','시험 재개','면담 완료');sendLog('ok','시험 재개','면담 후 재개');if(S.recognition){try{S.recognition.start();}catch(_){}}};

// ── 제출 / 강제 종료 (API 연동) ──────────────────────────
window.submitExam=async function(){
  if(S.terminated)return;
  // 미답변 문항 확인
  const unanswered=S.questions.filter(q=>S.answers[q.id]===undefined);
  if(unanswered.length>0){
    const nums=unanswered.map(q=>q.number).join(', ');
    const ok=confirm(`아직 답하지 않은 문항이 있습니다.\n\n미답변: ${nums}번 (${unanswered.length}문항)\n\n그래도 제출하시겠습니까?\n미답변 문항은 0점 처리됩니다.`);
    if(!ok)return;
  }
  S.terminated=true;S.paused=true;
  clearInterval(S.timerInt);
  if(S.recognition){try{S.recognition.stop();}catch(_){}}
  addLog('ok','제출','답안 제출');
  if(S.attemptId){
    const answers=S.questions.map(q=>({
      question_id:q.id,
      selected:S.answers[q.id]!==undefined?S.answers[q.id]:null,
      text:null
    }));
    try{await apiCall('POST',`/api/student/attempts/${S.attemptId}/submit`,{answers});}
    catch(e){console.warn('submit failed:',e);}
  }
  sendLog('ok','시험 제출','답안 제출');
  showDone(false);
};

async function pollCommands(){
  if(!S.attemptId||S.terminated){clearInterval(S.cmdPollInt);return;}
  try{
    const r=await apiCall('GET',`/api/student/attempts/${S.attemptId}/commands?since_id=${_lastMsgId}`);
    // 강제 종료
    if(r.status==='terminated'&&!S.terminated){terminate('관리자 강제 종료');return;}
    // 일시정지
    const pauseOv=document.getElementById('ov-admin-pause');
    if(r.status==='under_review'&&!S.terminated){
      if(!pauseOv.classList.contains('act')){
        S.paused=true;
        document.getElementById('exam-content').classList.add('blurred');
        pauseOv.classList.add('act');
        setStatus('w','관리자 검토 중');
        addLog('info','관리자 개입','시험 일시정지');
      }
    }
    // 재개 (under_review → in_progress)
    if(r.status==='in_progress'&&pauseOv.classList.contains('act')){
      pauseOv.classList.remove('act');
      S.paused=false;
      document.getElementById('exam-content').classList.remove('blurred');
      setStatus('ok','정상 감독 중');
      addLog('info','시험 재개','관리자 검토 완료');
    }
    // 관리자 메시지
    for(const msg of r.messages){
      showAdminToast('📨 관리자: '+msg.text);
      addLog('info','관리자 메시지',msg.text);
      _lastMsgId=Math.max(_lastMsgId,msg.id);
    }
  }catch(e){console.warn('pollCommands:',e);}
}

function showAdminToast(text){
  const el=document.getElementById('admin-toast');
  if(!el)return;
  el.textContent=text;el.style.display='block';
  clearTimeout(el._t);
  el._t=setTimeout(()=>{el.style.display='none';},10000);
}

async function terminate(reason){
  S.terminated=true;S.paused=true;
  clearInterval(S.timerInt);clearInterval(S.cmdPollInt);
  if(S.recognition){try{S.recognition.stop();}catch(_){}}
  ['ov-chat','ov-warn'].forEach(id=>document.getElementById(id).classList.remove('act'));
  addLog('danger','강제 종료',reason);
  sendLog('danger','시험 강제 종료',reason);
  if(S.attemptId){
    // 0점 처리: 빈 답안으로 제출 후 종료
    try{
      const emptyAnswers=S.questions.map(q=>({question_id:q.id,selected:null,text:null}));
      await apiCall('POST',`/api/student/attempts/${S.attemptId}/submit`,{answers:emptyAnswers});
    }catch(e){console.warn('zero-submit failed:',e);}
    try{await apiCall('POST',`/api/student/attempts/${S.attemptId}/end`,{warning_count:S.warns,total_away_time:S.totalAway,voice_alerts:S.voiceAlerts,force_zero:true});}
    catch(e){console.warn('end failed:',e);}
  }
  showDone(true);
}

function showDone(forced){const el=Math.round((Date.now()-S.startTime)/1000);const em=Math.floor(el/60),es=el%60;document.getElementById('done-icon').textContent=forced?'🚫':'✅';document.getElementById('done-title').textContent=forced?'시험 강제 종료':'시험 제출 완료';document.getElementById('done-title').className='ov-title '+(forced?'d':'g');document.getElementById('done-sub').textContent=forced?'부정행위 의심으로 강제 종료되었습니다.':'수고하셨습니다!';document.getElementById('dn-warns').textContent=S.warns;document.getElementById('dn-away').textContent=S.totalAway+'s';document.getElementById('dn-voice').textContent=S.voiceAlerts;document.getElementById('dn-time').textContent=`${String(em).padStart(2,'0')}:${String(es).padStart(2,'0')}`;document.getElementById('ov-done').classList.add('act');}

function setStatus(t,txt){const el=document.getElementById('sp');const m={ok:'sp-ok',w:'sp-w',d:'sp-d'};el.className='status-pill '+m[t];document.getElementById('sp-txt').textContent=txt;}
function addLog(type,event,detail){const now=new Date();const t=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;const list=document.getElementById('log-list');const item=document.createElement('div');item.className='log-item li-'+type;item.innerHTML=`<span class="lt">${t}</span><span><strong>${event}</strong> — ${detail}</span>`;list.insertBefore(item,list.firstChild);if(list.children.length>30)list.removeChild(list.lastChild);}

async function sendLog(severity,event,detail){
  if(!S.attemptId)return;
  try{await apiCall('POST',`/api/student/attempts/${S.attemptId}/logs`,{severity,event,detail});}
  catch(e){console.warn('sendLog:',e);}
}

// ── 학번 입력 시 시험 목록 자동 로드 ─────────────────────
(()=>{
  let loadTimer;
  const idField=document.getElementById('l-id');
  idField.addEventListener('input',()=>{
    clearTimeout(loadTimer);
    const id=idField.value.trim();
    if(id.length>=4)loadTimer=setTimeout(()=>loadExams(id),700);
  });
  idField.addEventListener('blur',()=>{const id=idField.value.trim();if(id)loadExams(id);});
})();
