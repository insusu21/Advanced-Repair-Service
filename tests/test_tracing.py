import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from langsmith import Client
from langgraph.graph import StateGraph, START, END
from worker import harness, tracing
from test_integration import command, fixture_tools


def test_disabled_never_constructs_client(monkeypatch):
    monkeypatch.setenv('LANGSMITH_TRACING', 'false')
    monkeypatch.setattr(tracing, 'client', lambda: pytest.fail('must not create client'))
    metrics = {}
    result = asyncio.run(harness.invoke(SimpleNamespace(ainvoke=AsyncMock(return_value={'ok': True})),
                                        command(), AsyncMock(), metrics))
    assert result == {'ok': True} and metrics['trace_id'] is None


def test_enabled_requires_key(monkeypatch):
    monkeypatch.setenv('LANGSMITH_TRACING', 'true')
    monkeypatch.delenv('LANGSMITH_API_KEY', raising=False)
    with pytest.raises(ValueError, match='LANGSMITH_API_KEY'):
        asyncio.run(harness.invoke(None, command(), AsyncMock()))


def test_graph_tool_retries_share_root(monkeypatch):
    monkeypatch.setenv('LANGSMITH_TRACING', 'true')
    monkeypatch.setenv('LANGSMITH_API_KEY', 'test-not-a-real-key')
    client = MagicMock(spec=Client)
    monkeypatch.setattr(tracing, 'client', lambda: client)
    monkeypatch.setattr(harness.asyncio, 'sleep', AsyncMock())
    calls = []
    @harness.guarded()
    async def lookup():
        calls.append(1)
        if len(calls) == 1:
            raise ConnectionError('temporary')
        return 'ok'
    async def node(state):
        await lookup()
        return {'done': True}
    builder = StateGraph(dict)
    builder.add_node('lookup_node', node)
    builder.add_edge(START, 'lookup_node')
    builder.add_edge('lookup_node', END)
    metrics = {}
    asyncio.run(harness.invoke(builder.compile(), command(), AsyncMock(), metrics))
    from langchain_core.tracers.langchain import wait_for_all_tracers
    wait_for_all_tracers()
    runs = [c.kwargs for c in client.create_run.call_args_list]
    root = next(r for r in runs if r['name'] == 'repair.diagnosis')
    assert str(root['id']) == metrics['trace_id']
    assert root['inputs'] == {}
    attempts = [r for r in runs if r['name'] == 'lookup']
    assert len(attempts) == 2
    assert all(str(r['trace_id']) == metrics['trace_id'] for r in runs)
    assert any(r['name'] == 'lookup_node' for r in runs)
    assert metrics['retries'] == 1
    assert any(c.kwargs.get('error') for c in client.update_run.call_args_list)


def test_concurrent_events_have_separate_traces(monkeypatch):
    monkeypatch.setenv('LANGSMITH_TRACING', 'true')
    monkeypatch.setenv('LANGSMITH_API_KEY', 'test-not-a-real-key')
    client = MagicMock(spec=Client)
    monkeypatch.setattr(tracing, 'client', lambda: client)
    async def graph(*args, **kwargs):
        await asyncio.sleep(0)
        return {'ok': True}
    first, second = {}, {}
    async def run():
        await asyncio.gather(*[harness.invoke(SimpleNamespace(ainvoke=graph), command(), AsyncMock(), m)
                               for m in (first, second)])
    asyncio.run(run())
    assert first['trace_id'] and second['trace_id']
    assert first['trace_id'] != second['trace_id']


def test_client_hides_payloads(monkeypatch):
    factory = MagicMock()
    monkeypatch.setattr(tracing, 'Client', factory)
    tracing.client.cache_clear()
    try:
        tracing.client()
        factory.assert_called_once_with(hide_inputs=True, hide_outputs=True)
    finally:
        tracing.client.cache_clear()


def test_report_keeps_trace_id(fixture_tools, monkeypatch):
    from worker import graph, report
    monkeypatch.setenv('LANGSMITH_TRACING', 'true')
    monkeypatch.setenv('LANGSMITH_API_KEY', 'test-not-a-real-key')
    monkeypatch.setattr(tracing, 'client', lambda: MagicMock(spec=Client))
    metrics = {}
    cmd = command()
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock(), metrics))
    path = report.save(cmd, state['result'], metrics)
    import json
    saved = json.loads(path.with_suffix('.json').read_text())
    assert saved['result']['eventType'] == 'DIAGNOSIS_COMPLETED'
    assert saved['execution']['trace_id'] == metrics['trace_id']
    assert metrics['trace_id'] in path.read_text()
