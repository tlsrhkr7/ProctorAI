/**
 * pdf.js — PDF 파일 업로드 및 텍스트 추출
 * pdf.js CDN 라이브러리(pdfjsLib)가 전역에 로드된 후 사용
 */

/** 현재 추출된 PDF 텍스트 (모듈 상태) */
let _pdfText = '';

export function getPdfText() { return _pdfText; }
export function clearPdfText() { _pdfText = ''; }

/** 드래그 드롭 이벤트 처리 */
export function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') processPdf(file);
}

/** 파일 input change 이벤트 처리 */
export function handleFile(e) {
  const file = e.target.files[0];
  if (file) processPdf(file);
}

/** PDF 선택 초기화 */
export function clearPdf() {
  _pdfText = '';
  document.getElementById('pdf-chip').style.display    = 'none';
  document.getElementById('pdf-preview').style.display = 'none';
  document.getElementById('gen-btn').disabled           = true;
  document.getElementById('gen-status').textContent     = 'PDF를 먼저 업로드하세요';
  document.getElementById('pdf-inp').value              = '';
}

/** PDF → 텍스트 추출 */
async function processPdf(file) {
  document.getElementById('pdf-name').textContent = file.name;
  document.getElementById('pdf-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
  document.getElementById('pdf-chip').style.display = 'flex';
  document.getElementById('gen-status').textContent  = '📖 텍스트 추출 중...';

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let txt = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const pg = await pdf.getPage(i);
      const tc = await pg.getTextContent();
      txt += tc.items.map(t => t.str).join(' ') + '\n';
    }
    _pdfText = txt.trim();

    document.getElementById('pdf-prev-text').textContent =
      _pdfText.substring(0, 300) + (_pdfText.length > 300 ? '...' : '');
    document.getElementById('pdf-preview').style.display = 'block';
    document.getElementById('gen-btn').disabled           = false;
    document.getElementById('gen-status').textContent     = `✅ ${pdf.numPages}페이지 추출 완료`;
  } catch (e) {
    document.getElementById('gen-status').textContent = '❌ 추출 실패: ' + e.message;
  }
}
