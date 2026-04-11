from fastapi import APIRouter, HTTPException, Depends
from schemas import RegisterRequest, LoginRequest, UserOut, LoginResponse
from auth import hash_password, verify_password, create_token, get_current_user
from db import get_conn

router = APIRouter()


# POST /api/auth/register — 회원가입
@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    if body.role not in ("admin", "student"):
        raise HTTPException(400, "role must be admin or student")

    async with get_conn() as (conn, cur):
        # 이름 중복 체크
        await cur.execute("SELECT id FROM users WHERE name = %s", (body.name,))
        if await cur.fetchone():
            raise HTTPException(400, "name already exists")

        hashed = hash_password(body.password)
        await cur.execute(
            "INSERT INTO users (name, password_hash, role) VALUES (%s, %s, %s)",
            (body.name, hashed, body.role),
        )
        user_id = cur.lastrowid

    return {"id": user_id, "name": body.name, "role": body.role}


# POST /api/auth/login — 로그인
@router.post("/login")
async def login(body: LoginRequest):
    async with get_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, name, password_hash, role FROM users WHERE name = %s",
            (body.name,),
        )
        user = await cur.fetchone()

    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "invalid name or password")

    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "role": user["role"]},
    }


# GET /api/auth/me — 내 정보 조회
@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "name": user["name"], "role": user["role"]}
