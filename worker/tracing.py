"""LangSmith opt-in 추적. 원문 입력·출력은 전송하지 않고 실행 관계·사용량을 기록한다."""
import os
from functools import lru_cache
from langsmith import Client, get_current_run_tree, traceable, tracing_context


@lru_cache(maxsize=1)
def client():
    return Client(hide_inputs=True, hide_outputs=True)


def execution_context(metadata):
    enabled = os.getenv("LANGSMITH_TRACING", "false").lower() == "true"
    if enabled and not os.getenv("LANGSMITH_API_KEY"):
        raise ValueError("LANGSMITH_TRACING=true requires LANGSMITH_API_KEY")
    return tracing_context(enabled=enabled, parent=False,
                           client=client() if enabled else None,
                           project_name=os.getenv("LANGSMITH_PROJECT", "repair-agent"),
                           metadata=metadata, tags=["repair-agent"])


def trace_id():
    run = get_current_run_tree()
    return str(run.trace_id) if run else None


@traceable(name="tool.attempt", run_type="tool", process_inputs=lambda _: {},
           process_outputs=lambda _: {})
async def tool_attempt(fn, args, kwargs):
    return await fn(*args, **kwargs)
