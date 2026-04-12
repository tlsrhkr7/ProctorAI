"""
ProctorAI 유지보수 스크립트
- 시험/유저 목록 조회
- 이름 변경 (exam title, user name)
- 문제 내용 출력 및 답 검증

사용법: python maintenance.py
"""
import httpx, json

BASE = "https://proctorai-production.up.railway.app"
c = httpx.Client(base_url=BASE, timeout=15)

# ─── 관리자 로그인 ───────────────────────────────────────
ADMIN_NAME = "prof"        # 관리자 계정
ADMIN_PASS = "1234"

r = c.post("/api/auth/login", json={"name": ADMIN_NAME, "password": ADMIN_PASS})
if r.status_code != 200:
    print(f"❌ 로그인 실패: {r.text}")
    exit(1)
token = r.json()["token"]
ah = {"Authorization": f"Bearer {token}"}
print(f"✅ 관리자 로그인 성공 ({ADMIN_NAME})\n")

# ─── 사용자 목록 ─────────────────────────────────────────
print("=" * 60)
print("👤 사용자 목록")
print("=" * 60)
users = c.get("/api/auth/users", headers=ah).json()
for u in users:
    print(f"  ID={u['id']:3d} | role={u['role']:7s} | name={u['name']}")

# ─── 시험 목록 ───────────────────────────────────────────
print("\n" + "=" * 60)
print("📝 시험 목록")
print("=" * 60)
exams = c.get("/api/exams", headers=ah).json()
for e in exams:
    print(f"  ID={e['id']:3d} | status={e['status']:8s} | questions={e.get('question_count',0):2d}개 | title={e['title']}")

# ─── 이름 변경 ───────────────────────────────────────────
print("\n" + "=" * 60)
print("✏️  이름 변경")
print("=" * 60)

# "중간고사" → "test 시험" (가장 최근 것)
exam_to_rename = next((e for e in exams if e['title'] == '중간고사'), None)
if exam_to_rename:
    r = c.patch(f"/api/exams/{exam_to_rename['id']}", json={"title": "test 시험"}, headers=ah)
    if r.status_code == 200:
        print(f"  ✅ 시험 이름 변경: '중간고사' → 'test 시험' (ID={exam_to_rename['id']})")
    else:
        print(f"  ❌ 시험 이름 변경 실패: {r.text}")
else:
    print("  ℹ️  '중간고사' 시험 없음 (이미 변경됐거나 존재하지 않음)")

# "stu2" → "test 응시자"
user_to_rename = next((u for u in users if u['name'] == 'stu2'), None)
if user_to_rename:
    r = c.patch(f"/api/auth/users/{user_to_rename['id']}/name", json={"name": "test 응시자"}, headers=ah)
    if r.status_code == 200:
        print(f"  ✅ 사용자 이름 변경: 'stu2' → 'test 응시자' (ID={user_to_rename['id']})")
    else:
        print(f"  ❌ 사용자 이름 변경 실패: {r.text}")
else:
    print("  ℹ️  'stu2' 사용자 없음 (이미 변경됐거나 존재하지 않음)")

# ─── 문제 내용 출력 ──────────────────────────────────────
# 시험 목록 다시 로드 (이름 변경 후)
exams = c.get("/api/exams", headers=ah).json()
for e in exams:
    if e.get('question_count', 0) == 0:
        continue
    print(f"\n{'=' * 60}")
    print(f"📋 시험: {e['title']} (ID={e['id']})")
    print("=" * 60)
    detail = c.get(f"/api/exams/{e['id']}", headers=ah).json()
    questions = detail.get("questions", [])
    if not questions:
        print("  문제 없음")
        continue
    issues = []
    for q in questions:
        opts = q.get("options") or []
        ans_str = str(q.get("answer", ""))
        try:
            ans_idx = int(ans_str)
        except:
            ans_idx = -1
        valid = 0 <= ans_idx < len(opts) if opts else True
        flag = "✅" if valid else "❌ 정답 인덱스 오류!"
        print(f"\n  Q{q['number']} {flag}")
        print(f"  문제: {q['text']}")
        if opts:
            for i, o in enumerate(opts):
                marker = " ◀ 정답" if i == ans_idx else ""
                print(f"    [{i}] {o}{marker}")
        else:
            print(f"  (서술형) 정답: {q.get('answer','')}")
        if q.get("explanation"):
            print(f"  해설: {q['explanation']}")
        if not valid:
            issues.append(q)
    if issues:
        print(f"\n  ⚠️  위 {len(issues)}개 문제의 정답 인덱스를 확인/수정하세요.")
    else:
        print(f"\n  ✅ 모든 문제 정답 인덱스 정상")

print("\n" + "=" * 60)
print("완료")
print("=" * 60)
