"""Kafka 워커. 실행: uv run python -m worker.main

1) diagnosis.commands.v2 에서 명령을 받는다
2) 그래프를 돌린다 (중간 진행 상황은 바로바로 diagnosis.events.v2 로 보낸다)
3) 마지막 결과(완료/사진요청/실패)를 보낸다
4) 그다음에야 Kafka에 '처리했다'(commit)를 기록한다 → 중간에 죽으면 다시 받는다
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from . import config as C
from . import report
from .graph import build_graph

log = logging.getLogger("worker")
GRAPH = build_graph()
done = set()  # 처리한 명령 eventId. TODO(하네스): 재시작해도 남게 DB로 (무슨 말이지)


def make_emit(command: dict, producer: AIOKafkaProducer):
    """이 명령 전용 '결과 보내기' 함수를 만든다.

    Spring 규칙: 결과는 명령의 id들을 그대로 돌려주고, sequence는 1부터 계속 커져야 한다.
    """
    seq = 0

    async def emit(event_type: str, payload: dict):
        nonlocal seq # spring에 보낼때마다 +1상승 시킴
        seq += 1
        event = {
            #spring에서 건내준 목록을 그대로 유지
            **{k: command[k] for k in ("schemaVersion", "repairId", "taskId", "correlationId", "inputRevision", "executionId")},
            "eventId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{command['eventId']}:{seq}")),  # 다시 보내도 같은 id
            "eventType": event_type,
            "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "sequence": seq,
            "payload": payload,# json넣는 상자
        }
        await producer.send_and_wait(C.EVENTS_TOPIC, json.dumps(event, ensure_ascii=False).encode(), key=command["taskId"].encode())

    return emit


async def handle(command: dict, producer: AIOKafkaProducer):
    """명령 하나 처리. 실패하면 MAX_RETRY번 다시, 그래도 안 되면 FAILED + DLT."""
    emit = make_emit(command, producer)  # 재시도해도 같은 emit → sequence가 이어진다
    await emit("DIAGNOSIS_STARTED", {"stage": "STARTED"})
    for attempt in range(C.MAX_RETRY + 1):
        try:
            state = await GRAPH.ainvoke({"command": command}, {"configurable": {"emit": emit}})
            result = state["result"]
            if result["eventType"] == "PHOTO_REQUESTED":
                result["payload"]["requestKey"] = str(uuid.uuid5(uuid.NAMESPACE_URL, command["eventId"] + ":photo"))
            await emit(result["eventType"], result["payload"])
            path = report.save(command, result)  # 사람이 읽는 고장 리포트.md
            log.info("task %s → %s (리포트: %s)", command["taskId"], result["eventType"], path)
            return
        except Exception:
            log.exception("task %s %d번째 실패", command["taskId"], attempt + 1)
            await asyncio.sleep(2**attempt)
    await emit("DIAGNOSIS_FAILED", {"errorCode": "AGENT_ERROR"})
    await producer.send_and_wait(C.DLT_TOPIC, json.dumps(command).encode(), key=command["taskId"].encode())
# 한줄요약: 시작하고, 반복해서 그래프돌려 결과를 보낸다. 

#  Kafka 우체국 창구
async def run():
    consumer = AIOKafkaConsumer(C.COMMANDS_TOPIC, bootstrap_servers=C.KAFKA, group_id=C.GROUP_ID,
                                enable_auto_commit=False, auto_offset_reset="earliest")
    producer = AIOKafkaProducer(bootstrap_servers=C.KAFKA, acks="all", enable_idempotence=True)
    await consumer.start()
    await producer.start()
    log.info("대기 중: %s @ %s (GPT %s)", C.COMMANDS_TOPIC, C.KAFKA, "켜짐" if C.USE_GPT else "꺼짐: 규칙으로 대신")
    try:
        async for msg in consumer:
            try:
                command = json.loads(msg.value)
                ok = command.get("eventType") in ("DIAGNOSIS_REQUESTED", "DIAGNOSIS_RESUMED")
            except ValueError:
                ok = False
            if not ok:  # 깨진 메시지·모르는 명령 → DLT
                await producer.send_and_wait(C.DLT_TOPIC, msg.value, key=msg.key)
            elif command["eventId"] not in done:  # 같은 명령이 또 오면 건너뜀
                await handle(command, producer)
                done.add(command["eventId"])
            await consumer.commit()
    finally:
        await consumer.stop()
        await producer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    logging.getLogger("aiokafka").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)  # MCP 호출마다 찍히는 HTTP 로그 끄기
    asyncio.run(run())
