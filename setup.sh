#!/bin/bash
# 처음 한 번: 파이썬 환경 3개 설치 (에이전트, PCB MCP, 기계 MCP)
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
uv sync
(cd mcp_servers/pcb && uv sync)
(cd mcp_servers/mechanical && uv sync)
echo "완료. .env 에 OPENAI_API_KEY 를 넣고 README의 '실행'을 따라 하세요."
