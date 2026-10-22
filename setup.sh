#!/bin/bash
# 처음 한 번: 에이전트·PCB MCP·기계 MCP·업무 MCP·Rag_mcp 파이썬 환경과 프론트 패키지 설치
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
[ -f backend/.env ] || cp backend/.env.example backend/.env
uv sync
(cd mcp_servers/pcb && uv sync)
(cd mcp_servers/mechanical && uv sync)
(cd mcp_servers/business && uv sync)
(cd Rag_mcp && uv sync)
(cd frontend && npm ci)
echo "완료. 레포 맨 위 .env 에 OPENAI_API_KEY 를 넣고 ./run.sh (backend/.env 는 비워 둬도 됨)"
