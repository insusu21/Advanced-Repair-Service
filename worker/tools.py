"""그래프가 쓰는 '팔다리': 사진 받기, MCP 호출, GPT 호출. graph.py는 이 함수들만 부른다."""

import base64
import json
import tempfile
from pathlib import Path
from typing import Literal

import httpx
from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from pydantic import BaseModel, Field

from . import config as C

# ── 1. 사진 ──────────────────────────────────────────────


def load_photos(command: dict) -> list[dict]:
    """Spring에서 첨부 사진을 받아 로컬 파일로 저장한다. 하나라도 못 받으면 예시 사진 2장을 쓴다.

    돌려주는 값: [{"attachmentId": "1" 또는 None(예시), "path": "/tmp/.../1.jpg"}]
    """
    folder = Path(tempfile.mkdtemp(prefix=f"task{command['taskId']}_"))
    try:
        photos = []
        for a in command["payload"]["attachments"]:
            r = httpx.get(C.SPRING_URL + a["downloadPath"], headers={"Authorization": f"Bearer {C.SPRING_TOKEN}"}, timeout=10)
            r.raise_for_status()
            path = folder / f"{a['id']}.jpg"
            path.write_bytes(r.content)
            photos.append({"attachmentId": a["id"], "path": str(path)})
        if photos:
            return photos
    except Exception:
        pass
    return [{"attachmentId": None, "path": p} for p in C.SAMPLE_PHOTOS]


# ── 2. MCP ───────────────────────────────────────────────


async def call_mech_mcp(path: str) -> dict:
    """mechanical-mcp: 금속 표면 결함 (scratches, patches 등)."""
    async with Client(C.MECH_MCP_URL) as c:
        return (await c.call_tool("detect_surface_defects", {"photo_id": path})).data


async def call_pcb_mcp(path: str) -> dict:
    """pcb-detector (MCP_Error_check/pcb_agent): PCB 결함 (short, missing_hole 등)."""
    transport = StdioTransport(command=C.PCB_MCP_PYTHON, args=[C.PCB_MCP_SERVER], log_file=C.HERE / "pcb_mcp.log")
    # 옛 서버가 내는 경고(server/discover 모름)는 터미널 대신 로그 파일로. 동작엔 문제없음
    async with Client(transport) as c:
        r = await c.call_tool("analyze_pcb_image", {"image_path": path})
        return json.loads(r.content[0].text)  # 옛 mcp 1.x 서버라 결과가 글(JSON 문자열)로 온다


async def call_rag_mcp(error_codes: list[str]) -> dict:
    # TODO(RAG 담당): Rag_mcp가 생기면 여기서 매뉴얼 검색. 지금은 가짜 결과
    return {"hits": [{"citation": f"MANUAL §{c}", "excerpt": f"에러 {c} 설명(가짜)"} for c in error_codes]}


# ── 3. GPT ───────────────────────────────────────────────


class PhotoKind(BaseModel):
    kind: Literal["PCB", "MECH", "OTHER"] = Field(description="PCB: 회로기판·구리 배선·납땜·전자부품. MECH: 금속 표면 클로즈업·모터·기어·축·바퀴. OTHER: 그 외")


class Clues(BaseModel):
    pcb: list[str] = Field(description="전원·충전·회로 관련 증상")
    mech: list[str] = Field(description="바퀴·모터·브러시·소음 등 기계 증상")
    sw: list[str] = Field(description="펌웨어·앱·연결 등 소프트웨어 증상")


class Candidate(BaseModel):
    cause: str = Field(description="고장 원인 한 줄")
    confidence: float = Field(ge=0, le=1)
    explanation: str = Field(description="근거가 된 MCP 결과를 들어 설명")


class Report(BaseModel):
    summary: str
    repairMethod: str
    candidates: list[Candidate] = Field(min_length=1)


def gpt(schema):
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=C.GPT_MODEL, temperature=0).with_structured_output(schema)


async def classify_photo(path: str) -> str:
    """사진 한 장이 PCB / MECH / OTHER 중 무엇인지."""
    if not C.USE_GPT:
        return "PCB" if "pcb" in Path(path).name else "MECH"  # 키 없을 때: 파일 이름으로
    b64 = base64.b64encode(Path(path).read_bytes()).decode()
    msg = [{"role": "user", "content": [
        {"type": "text", "text": "로봇청소기 수리용 부품 사진이다. 흑백·확대 사진일 수 있다. PCB / MECH / OTHER 중 하나로 분류해라."},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
    ]}]
    return (await gpt(PhotoKind).ainvoke(msg)).kind


async def split_text(text: str) -> Clues:
    """증상 문장을 PCB / 기계 / SW 단서로 나눈다."""
    if not C.USE_GPT:
        return Clues(pcb=[w for w in ("전원", "충전", "회로") if w in text],
                     mech=[w for w in ("바퀴", "모터", "브러시", "소음") if w in text],
                     sw=[w for w in ("펌웨어", "앱", "업데이트") if w in text])
    return await gpt(Clues).ainvoke(f"로봇청소기 고장 증상을 단서별로 나눠라. 없으면 빈 목록.\n증상: {text}")


async def write_report(text: str, findings: list[dict]) -> Report:
    """MCP 결과를 근거로 진단 리포트를 쓴다."""
    defects = [d for f in findings for d in f["output"].get("defects", [])]
    if not C.USE_GPT:
        top = max(defects, key=lambda d: d["confidence"])
        return Report(summary=f"{top['type']} 결함 추정", repairMethod="해당 부품 점검 후 교체",
                      candidates=[Candidate(cause=top["type"], confidence=top["confidence"], explanation="MCP 검출 결과")])
    return await gpt(Report).ainvoke(
        f"로봇청소기 수리 기사에게 줄 진단 리포트를 한국어로 써라. 후보는 확신도 높은 순.\n증상: {text}\nMCP 결과: {findings}")
