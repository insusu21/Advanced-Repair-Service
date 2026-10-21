"""프론트 대역: 추가 사진 요청(WAITING_INPUT)에 지정 사진을 자동으로 올리고 진단을 재개한다.

프론트에 추가 사진 화면이 생기기 전까지 쓰는 임시 장치. 실제 프론트와 같은 Spring API를 쓴다.
  1) GET  /api/repairs?status=WAITING_INPUT
  2) POST /api/repairs/{id}/attachments?requestId=..&target=PCB|MOTOR   (지정 사진 업로드)
  3) POST /api/repairs/{id}/diagnosis/resume  {requestId, submissionKey, attachmentIds}

실행: DEV_PASSWORD가 있는 셸에서 python3 integration/auto_photo.py  (Ctrl+C로 종료)
요청 후 AUTO_PHOTO_GRACE초(기본 60) 동안은 기다린다. 그 안에 프론트에서 올리면 대역은 넘어간다.
지정 사진: integration/designated/{PCB,MOTOR}.jpg  (GENERAL 요청이면 둘 다 올린다)
"""
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from demo import Client, BASE  # 같은 폴더의 로그인·호출 도우미

DESIGNATED = Path(__file__).parent / "designated"
GRACE = int(os.environ.get("AUTO_PHOTO_GRACE", "60"))  # 이 시간(초) 안에 프론트에서 사람이 올리면 대역은 손대지 않는다


def upload(c, repair, request_id, target):
    path = DESIGNATED / f"{target}.jpg"
    b = "b-" + uuid.uuid4().hex
    body = b"".join([f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\nContent-Type: image/jpeg\r\n\r\n'.encode(),
                     path.read_bytes(), f"\r\n--{b}--\r\n".encode()])
    out = c.call("POST", f"/api/repairs/{repair}/attachments?requestId={request_id}&target={target}", body,
                 "multipart/form-data; boundary=" + b)
    return str(out["attachmentId"])


def answer(c, repair):
    detail = c.call("GET", f"/api/repairs/{repair}")
    now = datetime.now(timezone.utc)
    for req in [r for r in detail.get("photoRequests", []) if r.get("submitted_at") is None]:
        if (now - datetime.fromisoformat(req["created_at"].replace("Z", "+00:00"))).total_seconds() < GRACE:
            continue
        # 에이전트가 부위 이름(wheel 등)으로 요청할 수 있다. PCB 외 부위는 기계 사진으로, GENERAL은 둘 다
        t = req["target"]
        targets = ["PCB", "MOTOR"] if t == "GENERAL" else ["PCB"] if t == "PCB" else ["MOTOR"]
        ids = [upload(c, repair, req["id"], t) for t in targets]
        c.call("POST", f"/api/repairs/{repair}/diagnosis/resume",
               {"requestId": req["id"], "submissionKey": str(uuid.uuid4()), "attachmentIds": ids})
        print(f"[대역] 접수 {repair} · {req['round_no']}차 요청({req['target']}) → 지정 사진 {targets} 제출, 재개", flush=True)


def watch(interval=2):
    c = Client("tech1")
    print(f"[대역] 추가 사진 요청 감시 시작 ({BASE})", flush=True)
    while True:
        page = c.call("GET", "/api/repairs?status=WAITING_INPUT&size=50")
        for row in page.get("items") or page.get("content") or []:
            answer(c, row["id"])
        time.sleep(interval)


if __name__ == "__main__":
    watch()
