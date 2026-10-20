"""진단 그래프. 위에서 아래로 실행 순서대로 적었다.

  classify_photos → split_text → [pcb_mcp, mech_mcp, rag_mcp 중 필요한 것 동시에] → judge
      judge → report(완료) | request_photo(사진 요청) | fail(실패) → 끝

노드는 state(바구니)를 읽고, 바꿀 값만 dict로 돌려준다.
Spring에 진행 상황을 알릴 땐 emit(config, 이벤트종류, 내용)을 부른다.
"""

import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph

from . import config as C
from . import tools


class State(TypedDict, total=False):
    command: dict  # Kafka로 받은 명령 원문
    text: str  # 증상 + 기사 설명
    photos: list[dict]  # [{attachmentId, path, kind: PCB|MECH|OTHER}]
    clues: dict  # {pcb: [], mech: [], sw: [], errorCodes: []}
    findings: Annotated[list[dict], operator.add]  # MCP 결과. 동시에 돌아도 덮어쓰지 않고 이어 붙인다
    decision: str  # COMPLETE | PHOTO | FAIL
    result: dict  # Spring에 보낼 마지막 이벤트 {eventType, payload}


async def emit(config, event_type: str, payload: dict):
    await config["configurable"]["emit"](event_type, payload)


# ── 1. 사진 분류 ─────────────────────────────────────────


async def classify_photos(state: State, config) -> dict:
    await emit(config, "DIAGNOSIS_PROGRESS", {"stage": "CLASSIFYING_PHOTOS"})
    photos = tools.load_photos(state["command"])  # Spring에서 받거나, 못 받으면 예시 2장
    for p in photos:
        p["kind"] = await tools.classify_photo(p["path"])
    return {"photos": photos}


# ── 2. 글 분리 ───────────────────────────────────────────


async def split_text(state: State, config) -> dict:
    await emit(config, "DIAGNOSIS_PROGRESS", {"stage": "SPLITTING_TEXT"})
    repair = state["command"]["payload"]["repair"]
    text = f"{repair.get('symptom') or ''} {repair.get('user_input', {}).get('customerDescription', '')}".strip()
    clues = (await tools.split_text(text)).model_dump()
    clues["errorCodes"] = repair.get("error_codes") or []
    return {"text": text, "clues": clues}


# ── 3. MCP 고르기 + 호출 (동시에) ────────────────────────


def pick_mcps(state: State) -> list[str]:
    """부를 MCP 노드 이름 목록. 여러 개면 LangGraph가 동시에 실행한다."""
    kinds = {p["kind"] for p in state["photos"]}
    clues = state["clues"]
    picked = []
    if "PCB" in kinds:
        picked.append("pcb_mcp")
    if "MECH" in kinds:
        picked.append("mech_mcp")
    if clues["sw"] or clues["errorCodes"]:
        picked.append("rag_mcp")
    return picked or ["rag_mcp"]


async def run_photo_mcp(state, config, kind: str, call, tool: str, agent_type: str, server: str) -> dict:
    """kind 사진마다 MCP를 부르고, Spring에 TOOL_EXECUTED를 알린다. pcb_mcp·mech_mcp가 같이 쓴다."""
    findings = []
    for p in [p for p in state["photos"] if p["kind"] == kind]:
        try:
            out = await call(p["path"])
        except Exception as e:  # MCP 꺼짐 등. 멈추지 않고 '못 찾음'으로 넘긴다
            out = {"error": str(e)[:200]}
        await emit(config, "TOOL_EXECUTED", {"tool": tool, "toolVersion": "1", "agentType": agent_type,
                                             "mcpServer": server, "input": {"path": p["path"]}, "output": out})
        findings.append({"source": kind, "attachmentId": p["attachmentId"], "found": bool(out.get("is_defective")), "output": out})
    return {"findings": findings}


async def pcb_mcp(state: State, config) -> dict:
    return await run_photo_mcp(state, config, "PCB", tools.call_pcb_mcp, "analyze_pcb_image", "PCB", "pcb-detector")


async def mech_mcp(state: State, config) -> dict:
    return await run_photo_mcp(state, config, "MECH", tools.call_mech_mcp, "detect_surface_defects", "MOTOR", "mechanical-mcp")


async def rag_mcp(state: State, config) -> dict:
    codes = state["clues"]["errorCodes"]
    out = await tools.call_rag_mcp(codes)
    await emit(config, "TOOL_EXECUTED", {"tool": "search_manual", "toolVersion": "1", "agentType": "RAG",
                                         "mcpServer": "rag-mcp(가짜)", "input": {"errorCodes": codes}, "output": out})
    return {"findings": [{"source": "RAG", "attachmentId": None, "found": False, "output": out}]}


# ── 4. 판단 ──────────────────────────────────────────────


def decide(findings: list[dict], photo_round: int) -> str:
    """근거가 충분한가? TODO(오케스트레이션): GPT 판단으로 바꿀 수 있다."""
    if any(f["found"] for f in findings):
        return "COMPLETE"  # 사진에서 결함을 하나라도 찾음
    if photo_round < C.MAX_PHOTO_ROUNDS:
        return "PHOTO"  # 못 찾음 + 아직 요청 가능
    return "FAIL"  # 3번 요청했는데도 못 찾음


async def judge(state: State, config) -> dict:
    await emit(config, "DIAGNOSIS_PROGRESS", {"stage": "JUDGING"})
    return {"decision": decide(state["findings"], state["command"]["payload"]["round"])}


# ── 5. 끝: 리포트 / 사진 요청 / 실패 ─────────────────────


async def report(state: State, config) -> dict:
    r = await tools.write_report(state["text"], state["findings"])  # GPT는 글만 쓴다
    candidates = [{"rank": i + 1, **c.model_dump()} for i, c in enumerate(r.candidates)]
    evidence = []  # 근거는 코드가 MCP 결과에서 직접 만든다 (GPT가 사진 번호를 지어내지 않게)
    for f in state["findings"]:
        if f["found"]:
            e = {"type": "PHOTO", "annotation": {"defects": f["output"]["defects"], "image": f["output"]["annotated_image"]}}
            if f["output"].get("dent_image"):  # 기계 사진은 찌그러짐 박스 사진이 하나 더 있다
                e["annotation"]["dentImage"] = f["output"]["dent_image"]
            if f["attachmentId"]:  # 예시 사진은 Spring 첨부가 아니라 번호가 없다
                e["attachmentId"] = f["attachmentId"]
            evidence.append(e)
        if f["source"] == "RAG":
            evidence += [{"type": "MANUAL", **h} for h in f["output"]["hits"]]
    payload = {"summary": r.summary, "modelVersion": C.MODEL_VERSION, "repairMethod": r.repairMethod,
               "candidates": candidates, "recommendedParts": [], "evidence": evidence}
    # TODO: recommendedParts는 Spring DB에 있는 partId만 가능 → product_snapshot의 부품 목록에서 고른다
    return {"result": {"eventType": "DIAGNOSIS_COMPLETED", "payload": payload}}


async def request_photo(state: State, config) -> dict:
    cmd = state["command"]
    payload = {"round": cmd["payload"]["round"] + 1, "bodyPart": "wheel",  # TODO: GPT가 부위·설명을 고른다
               "description": "결함 부위를 가까이에서 밝게 다시 찍어 주세요", "checkpoint": f"task-{cmd['taskId']}"}
    return {"result": {"eventType": "PHOTO_REQUESTED", "payload": payload}}  # requestKey는 main.py가 붙인다


async def fail(state: State, config) -> dict:
    return {"result": {"eventType": "DIAGNOSIS_FAILED", "payload": {"errorCode": "INCONCLUSIVE_AFTER_THIRD_PHOTO"}}}


# ── 조립 ────────────────────────────────────────────────


def build_graph():
    g = StateGraph(State)
    for fn in (classify_photos, split_text, pcb_mcp, mech_mcp, rag_mcp, judge, report, request_photo, fail):
        g.add_node(fn.__name__, fn)

    g.add_edge(START, "classify_photos")
    g.add_edge("classify_photos", "split_text")
    g.add_conditional_edges("split_text", pick_mcps, ["pcb_mcp", "mech_mcp", "rag_mcp"])  # 여기서 갈라져서 동시 실행
    for mcp in ("pcb_mcp", "mech_mcp", "rag_mcp"):
        g.add_edge(mcp, "judge")  # 다 끝나면 judge에서 합류
    g.add_conditional_edges("judge", lambda s: s["decision"], {"COMPLETE": "report", "PHOTO": "request_photo", "FAIL": "fail"})
    for end in ("report", "request_photo", "fail"):
        g.add_edge(end, END)
    return g.compile()
