import json
from fastapi import APIRouter, HTTPException, Depends
from schemas import SubmitRequest
from auth import get_current_user
from db import get_conn

router = APIRouter()


# GET /api/student/exams — 활성 시험 목록
@router.get("/exams")
async def list_active_exams(user: dict = Depends(get_current_user)):
    async with get_conn() as (conn, cur):
        await cur.execute(
            """SELECT e.id, e.title, e.duration, COUNT(q.id) AS question_count
                 FROM exams e
            LEFT JOIN questions q ON q.exam_id = e.id
                WHERE e.status = 'active'
             GROUP BY e.id
             ORDER BY e.created_at DESC"""
        )
        rows = await cur.fetchall()
    return rows


# POST /api/student/exams/{exam_id}/start — 시험 시작
@router.post("/exams/{exam_id}/start", status_code=201)
async def start_exam(exam_id: int, user: dict = Depends(get_current_user)):
    async with get_conn() as (conn, cur):
        # 시험 존재 + active 확인
        await cur.execute(
            "SELECT id, title, duration, status FROM exams WHERE id = %s",
            (exam_id,),
        )
        exam = await cur.fetchone()
        if not exam:
            raise HTTPException(404, "exam not found")
        if exam["status"] != "active":
            raise HTTPException(400, "exam is not active")

        # 이미 진행 중인 attempt 확인
        await cur.execute(
            "SELECT id FROM attempts WHERE exam_id = %s AND user_id = %s AND status = 'in_progress'",
            (exam_id, user["id"]),
        )
        if await cur.fetchone():
            raise HTTPException(400, "already in progress")

        # attempt 생성
        await cur.execute(
            "INSERT INTO attempts (exam_id, user_id) VALUES (%s, %s)",
            (exam_id, user["id"]),
        )
        attempt_id = cur.lastrowid

        # 문제 조회 (정답/해설 제외)
        await cur.execute(
            "SELECT id, number, type, text, options FROM questions WHERE exam_id = %s ORDER BY number",
            (exam_id,),
        )
        questions = await cur.fetchall()

    # JSON 파싱
    for q in questions:
        if q["options"] and isinstance(q["options"], str):
            q["options"] = json.loads(q["options"])

    return {
        "attempt_id": attempt_id,
        "exam": {
            "id": exam["id"],
            "title": exam["title"],
            "duration": exam["duration"],
        },
        "questions": questions,
    }


# POST /api/student/attempts/{attempt_id}/submit — 답안 제출
@router.post("/attempts/{attempt_id}/submit")
async def submit_answers(attempt_id: int, body: SubmitRequest, user: dict = Depends(get_current_user)):
    async with get_conn() as (conn, cur):
        # attempt 확인
        await cur.execute(
            "SELECT id, exam_id, user_id, status FROM attempts WHERE id = %s",
            (attempt_id,),
        )
        attempt = await cur.fetchone()
        if not attempt:
            raise HTTPException(404, "attempt not found")
        if attempt["user_id"] != user["id"]:
            raise HTTPException(403, "not your attempt")
        if attempt["status"] != "in_progress":
            raise HTTPException(400, "attempt already finished")

        # 해당 시험의 문제 정답 조회
        await cur.execute(
            "SELECT id, type, answer FROM questions WHERE exam_id = %s",
            (attempt["exam_id"],),
        )
        q_rows = await cur.fetchall()
        answer_map = {q["id"]: q for q in q_rows}

        # 답안 저장 + 채점
        correct_count = 0
        choice_total = 0

        for ans in body.answers:
            q = answer_map.get(ans.question_id)
            if not q:
                continue

            is_correct = None
            if q["type"] == "choice" and ans.selected is not None:
                choice_total += 1
                is_correct = 1 if str(ans.selected) == str(q["answer"]) else 0
                if is_correct:
                    correct_count += 1

            await cur.execute(
                """INSERT INTO answers (attempt_id, question_id, selected, text, is_correct)
                   VALUES (%s, %s, %s, %s, %s)""",
                (attempt_id, ans.question_id, ans.selected, ans.text, is_correct),
            )

        # 점수 계산 (객관식 기준)
        score = round((correct_count / choice_total * 100)) if choice_total > 0 else 0

        # attempt 업데이트
        await cur.execute(
            "UPDATE attempts SET status = 'submitted', score = %s, submitted_at = NOW() WHERE id = %s",
            (score, attempt_id),
        )

    return {
        "attempt_id": attempt_id,
        "status": "submitted",
        "score": score,
    }


# GET /api/student/attempts/current — 현재 진행 중인 시험 확인
@router.get("/attempts/current")
async def current_attempt(user: dict = Depends(get_current_user)):
    async with get_conn() as (conn, cur):
        await cur.execute(
            """SELECT a.id AS attempt_id, a.exam_id, e.title AS exam_title,
                      a.status, a.started_at
                 FROM attempts a
                 JOIN exams e ON a.exam_id = e.id
                WHERE a.user_id = %s AND a.status = 'in_progress'
                LIMIT 1""",
            (user["id"],),
        )
        row = await cur.fetchone()
    return row
