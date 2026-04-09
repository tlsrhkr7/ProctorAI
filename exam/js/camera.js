/**
 * camera.js — 카메라 초기화 및 MediaPipe 눈 추적
 * updateGaze(away, val) 콜백을 통해 proctor.js와 연동
 */

/**
 * 카메라 스트림 시작 및 눈 추적 초기화
 * @param {function} onGaze   - (isAway: boolean, gazeVal: number) => void
 * @param {function} addLog   - (type, event, detail) => void
 */
export async function initCamera(onGaze, addLog) {
  try {
    const vid = document.getElementById('cam-vid');
    const cvs = document.getElementById('cam-cvs');
    const ctx = cvs.getContext('2d');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    vid.srcObject = stream;
    vid.addEventListener('loadedmetadata', () => {
      cvs.width  = vid.videoWidth;
      cvs.height = vid.videoHeight;
    });

    if (typeof FaceMesh !== 'undefined') {
      // MediaPipe 실제 추적
      const fm = new FaceMesh({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
      });
      fm.setOptions({
        maxNumFaces: 1, refineLandmarks: true,
        minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
      });
      fm.onResults(r => _processLandmarks(r, ctx, cvs, onGaze));
      const cam = new Camera(vid, {
        onFrame: async () => await fm.send({ image: vid }),
        width: 640, height: 480
      });
      cam.start();
      addLog('ok', 'MediaPipe', '얼굴 추적 초기화 완료');
    } else {
      _simulateEye(onGaze, addLog);
    }
  } catch (e) {
    addLog('warn', '카메라', '접근 실패 — 시뮬레이션 모드');
    _simulateEye(onGaze, addLog);
  }
}

/** MediaPipe 랜드마크 처리 및 시선 방향 계산 */
function _processLandmarks(results, ctx, cvs, onGaze) {
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  if (!results.multiFaceLandmarks?.length) { onGaze(true, 0.5); return; }

  const lm = results.multiFaceLandmarks[0];
  // 홍채 중심: 왼쪽 468, 오른쪽 473
  const li = lm[468], ri = lm[473];
  // 눈 코너
  const lIn = lm[362], lOut = lm[263], rIn = lm[133], rOut = lm[33];
  const lg  = (li.x - lIn.x) / (lOut.x - lIn.x);
  const rg  = (ri.x - rIn.x) / (rOut.x - rIn.x);
  const avg = (lg + rg) / 2;
  // 수직 시선
  const et = lm[386], eb = lm[374];
  const lv = (li.y - et.y) / (eb.y - et.y);
  const away = avg < 0.22 || avg > 0.78 || lv < 0.18 || lv > 0.82;

  onGaze(away, avg);
  _drawOverlay(ctx, cvs, lm, li, ri, away);
}

/** Canvas에 눈 추적 시각화 */
function _drawOverlay(ctx, cvs, lm, li, ri, away) {
  const w = cvs.width, h = cvs.height;
  ctx.save();
  ctx.fillStyle = away ? 'rgba(239,68,68,.85)' : 'rgba(34,197,94,.85)';
  [[li.x, li.y], [ri.x, ri.y]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x * w, y * h, 4, 0, Math.PI * 2); ctx.fill();
  });
  [[362,385,387,263,373,380], [33,160,158,133,153,144]].forEach(pts => {
    ctx.beginPath();
    pts.forEach((i, idx) => {
      const p = lm[i];
      idx === 0 ? ctx.moveTo(p.x*w, p.y*h) : ctx.lineTo(p.x*w, p.y*h);
    });
    ctx.closePath();
    ctx.strokeStyle = away ? 'rgba(239,68,68,.5)' : 'rgba(34,197,94,.5)';
    ctx.lineWidth = 1.5; ctx.stroke();
  });
  ctx.restore();
}

/** 카메라 없을 때 시뮬레이션 (데모 모드) */
function _simulateEye(onGaze, addLog) {
  addLog('info', '시뮬레이션', '카메라 없음 — 데모 모드');
  setInterval(() => onGaze(Math.random() < 0.08, Math.random()), 700);
}
