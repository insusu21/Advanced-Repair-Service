"""체크포인터: 같은 작업의 상태가 라운드를 넘어 남는지 확인한다."""
import asyncio
import copy
import uuid
from unittest.mock import AsyncMock

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from worker import graph, harness
from worker.harness import thread_id
from test_integration import command, fixture_tools, Producer  # noqa: F401


def test_thread_id_prefers_returned_checkpoint():
    cmd = command()
    assert thread_id(cmd) == str(cmd["taskId"])          # 최초 요청은 작업 ID
    cmd["payload"]["checkpoint"] = "task-7:abc"
    assert thread_id(cmd) == "task-7:abc"                # 재개는 돌려받은 값을 따른다


def test_same_thread_keeps_earlier_findings_without_duplicates(fixture_tools):
    async def run():
        async with AsyncSqliteSaver.from_conn_string(":memory:") as saver:
            app = graph.build_graph(saver)
            first = await harness.invoke(app, command(), AsyncMock())
            again = copy.deepcopy(command())
            again["eventId"] = str(uuid.uuid4())         # 같은 작업의 다음 이벤트
            second = await harness.invoke(app, again, AsyncMock())
            return first, second

    first, second = asyncio.run(run())
    # 같은 사진을 다시 분석해도 결과가 쌓이지 않는다
    assert len(second["findings"]) == len(first["findings"])
    keys = [graph.finding_key(f) for f in second["findings"]]
    assert len(keys) == len(set(keys))


def test_without_checkpointer_each_run_starts_empty(fixture_tools):
    async def run():
        app = graph.build_graph()                        # 체크포인터 없음
        return await harness.invoke(app, command(), AsyncMock())

    state = asyncio.run(run())
    assert state["findings"], "체크포인터가 없어도 한 번의 실행은 정상 동작해야 한다"
