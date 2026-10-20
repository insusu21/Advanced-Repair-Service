"""설정값 모음. 전부 환경변수로 바꿀 수 있다. 키·토큰은 .env에만 넣는다."""

import os
from pathlib import Path

from dotenv import dotenv_values

HERE = Path(__file__).parent
ROOT = HERE.parent  # 레포 맨 위
for k, v in dotenv_values(ROOT / ".env").items():
    if v:  # .env에 값이 있으면 셸에 남은 옛 키보다 우선. 빈 칸은 무시
        os.environ[k] = v

# Kafka: contract/INTEGRATION.md 계약 그대로 (backend 레포에서 복사)
KAFKA = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
COMMANDS_TOPIC = "diagnosis.commands.v2"  # Spring → 우리
EVENTS_TOPIC = "diagnosis.events.v2"  # 우리 → Spring
DLT_TOPIC = "diagnosis.commands.v2.dlt"  # 처리 못 한 명령
GROUP_ID = os.getenv("GROUP_ID", "langgraph-diagnosis-v2")

# Spring 내부 API (사진 다운로드)
SPRING_URL = os.getenv("SPRING_BASE_URL", "http://localhost:8080")
SPRING_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "")

# Spring에서 사진을 못 받으면 쓰는 예시 사진 2장
SAMPLE_PHOTOS = [str(HERE / "samples/pcb_sample.jpg"), str(HERE / "samples/mech_sample.jpg")]

# MCP 서버
MECH_MCP_URL = os.getenv("MECH_MCP_URL", "http://127.0.0.1:9104/mcp")  # mechanical-mcp, 미리 켜 둔다
RAG_MCP_URL = os.getenv("RAG_MCP_URL", "http://127.0.0.1:8014/mcp")  # Rag_mcp 레포의 rag 서버. 꺼져 있으면 검색 없이 진행
PCB_MCP_SERVER = str(ROOT / "mcp_servers/pcb/mcp_server.py")  # stdio, 부를 때마다 실행
PCB_MCP_PYTHON = str(ROOT / "mcp_servers/pcb/.venv/bin/python")  # setup.sh가 만든다

# GPT (OPENAI_API_KEY가 없으면 규칙으로 대신한다)
GPT_MODEL = os.getenv("GPT_MODEL", "gpt-4o-mini")
USE_GPT = bool(os.getenv("OPENAI_API_KEY"))

MAX_PHOTO_ROUNDS = 3  # 추가 사진 요청 최대 횟수 (계약)
MAX_RETRY = 2  # 그래프 실패 시 재시도 횟수
MODEL_VERSION = "skeleton-0.2"
