/**
 * voice.js — Web Speech API 음성 실시간 감지 및 의심 키워드 탐지
 */

/** 의심 키워드 목록 */
const SUSPICIOUS_KEYWORDS = [
  '답', '정답', 'answer', 'solution',
  '알려줘', '뭐야', '어떻게', '맞아', '맞지',
  '번이야', '번인가'
];

/**
 * 음성 인식 초기화
 * @param {function} onSuspicious  - (transcript: string) => void  — 의심 발언 감지 시
 * @param {function} addLog        - (type, event, detail) => void
 * @returns {SpeechRecognition|null} recognition 인스턴스 (stop() 호출용)
 */
export function initVoice(onSuspicious, addLog) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addLog('warn', '음성', '미지원 브라우저'); return null; }

  const rec = new SR();
  rec.lang             = 'ko-KR';
  rec.continuous       = true;
  rec.interimResults   = true;
  rec.maxAlternatives  = 1;

  rec.onstart = () => {
    document.getElementById('v-status').textContent = '감지 중';
    document.querySelectorAll('.wave-bar').forEach(b => b.classList.add('act'));
    addLog('ok', '음성', '마이크 활성화');
  };

  rec.onresult = e => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++)
      transcript += e.results[i][0].transcript;
    if (!transcript.trim()) return;

    document.getElementById('v-txt').textContent = `"${transcript}"`;

    const isSuspicious = SUSPICIOUS_KEYWORDS.some(kw =>
      transcript.toLowerCase().includes(kw)
    );
    if (isSuspicious) onSuspicious(transcript);
  };

  rec.onerror = e => {
    if (e.error !== 'no-speech') addLog('warn', '음성 오류', e.error);
  };

  // 자동 재시작 (종료되지 않는 한)
  rec.onend = () => {
    // proctor.js 에서 상태 체크 후 재시작 처리
    rec._ended = true;
  };

  try { rec.start(); } catch (_) {}
  return rec;
}

/** 음성 인식 재시작 (면담 후 재개 등에 사용) */
export function restartVoice(rec) {
  if (!rec) return;
  try { rec.start(); } catch (_) {}
}
