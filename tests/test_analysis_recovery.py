"""사진별 실패 격리, 입력별 라우팅, 3회 재입력 계약을 검증한다."""
import asyncio
import copy
import json
import uuid
from unittest.mock import AsyncMock
import pytest
from worker import graph, harness, tools, main, report
from worker.journal import Journal, VALIDATOR
from test_integration import command, fixture_tools, Producer


def test_first_photo_failure_keeps_later_photo_and_other_branch(fixture_tools):
    tools.call_pcb_mcp.side_effect = [ConnectionError(), fixture_tools]
    tools.call_mech_mcp.return_value = fixture_tools
    cmd = command()
    cmd['payload']['attachments'] += [{'id': '2', 'target': 'PCB'}, {'id': '3', 'target': 'MOTOR'}]
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    assert tools.call_pcb_mcp.await_count == 2 and tools.call_mech_mcp.await_count == 1
    assert tools.call_rag_mcp.await_count == 1
    result = state['result']
    assert result['eventType'] == 'PHOTO_REQUESTED'
    assert result['payload']['bodyPart'] == 'PCB'
    rows = result['payload']['analysisResults']
    assert sum(r['status']=='DETECTED' for r in rows) == 2
    assert sum(r['status']=='ERROR' for r in rows) == 1
    tools.write_report.assert_not_awaited()


@pytest.mark.parametrize('target,pcb,mech', [('PCB',1,0),('MOTOR',0,1)])
def test_routing_uses_photo_target_not_text(fixture_tools, target, pcb, mech):
    cmd = command()
    cmd['payload']['attachments'][0]['target'] = target
    cmd['payload']['repair']['symptom'] = 'PCB 전원과 모터 바퀴 모두 의심'
    asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    assert tools.call_pcb_mcp.await_count == pcb
    assert tools.call_mech_mcp.await_count == mech


def test_text_only_skips_image_models(fixture_tools):
    cmd = command()
    cmd['payload']['attachments'] = []
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    tools.call_pcb_mcp.assert_not_awaited()
    tools.call_mech_mcp.assert_not_awaited()
    tools.call_rag_mcp.assert_awaited_once()
    assert state['result']['payload']['bodyPart'] == 'GENERAL'


def test_classification_failure_still_searches_and_requests_input(fixture_tools, monkeypatch):
    monkeypatch.setattr(tools, 'classify_photo', AsyncMock(side_effect=ConnectionError()))
    cmd = command()
    cmd['payload']['attachments'][0]['target'] = 'GENERAL'
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    tools.call_rag_mcp.assert_awaited_once()
    assert state['result']['eventType'] == 'PHOTO_REQUESTED'
    assert any(r['source']=='CLASSIFICATION' and r['status']=='ERROR'
               for r in state['result']['payload']['analysisResults'])


@pytest.mark.parametrize('recover', [True, False])
def test_error_three_rounds_then_recovery_or_manual_result(fixture_tools, tmp_path, recover):
    tools.call_pcb_mcp.side_effect = ConnectionError('private endpoint')
    async def run():
        cmd, producer = command(), Producer()
        journal = Journal(tmp_path/'recovery.db')
        try:
            for round_no in range(4):
                if round_no == 3 and recover:
                    tools.call_pcb_mcp.side_effect = None
                result = await main.handle(cmd, producer, journal)
                if round_no == 3:
                    assert result['eventType'] == ('DIAGNOSIS_COMPLETED' if recover else 'DIAGNOSIS_FAILED')
                    if not recover:
                        assert result['payload']['errorCode']=='INCONCLUSIVE_AFTER_THIRD_PHOTO'
                        assert len([r for r in result['payload']['analysisResults'] if r['status']=='ERROR']) == 4
                    break
                assert result['eventType']=='PHOTO_REQUESTED'
                cmd = copy.deepcopy(cmd)
                cmd.update(eventId=str(uuid.uuid4()), executionId=str(uuid.uuid4()),
                           eventType='DIAGNOSIS_RESUMED', inputRevision=round_no+2)
                photo = {**cmd['payload']['attachments'][0], 'id': str(round_no+2),
                         'downloadPath': f'/internal/attachments/{round_no+2}', 'sha256': f'new-{round_no}'}
                cmd['payload']['attachments'].append(photo)
                cmd['payload']['attachmentIds'].append(photo['id'])
                cmd['payload']['addedAttachmentIds'] = [photo['id']]
                cmd['payload']['requestId'] = str(round_no+1)
                for key in ('round','requestKey','checkpoint'):
                    cmd['payload'][key]=result['payload'][key]
            assert sum(e['eventType']=='PHOTO_REQUESTED' for e in producer.events)==3
            for e in producer.events:
                VALIDATOR.validate(e)
            path=report.OUT/f"task-{cmd['taskId']}_revision-4_고장리포트.json"
            assert json.loads(path.read_text())['result']==result
            assert path.with_suffix('.md').exists()
            assert 'private endpoint' not in json.dumps(producer.events)
        finally:
            journal.close()
    asyncio.run(run())


@pytest.mark.parametrize('broken,working', [('call_mech_mcp', 'PCB'), ('call_pcb_mcp', 'MECH')])
def test_third_round_reports_with_remaining_evidence_when_one_tool_stays_broken(fixture_tools, broken, working):
    """3회 재요청을 다 쓴 뒤에도 한 도구가 실패하면, 성공한 분석만으로 리포트를 낸다."""
    found = {**fixture_tools, 'is_defective': True, 'defects': [{'type': 'short', 'confidence': .8}]}
    tools.call_pcb_mcp.return_value = found
    tools.call_mech_mcp.return_value = found
    getattr(tools, broken).side_effect = ConnectionError('still down')
    cmd = command()
    cmd['payload']['attachments'] += [{'id': '2', 'target': 'MOTOR'}]
    cmd['payload']['round'] = 3
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    result = state['result']
    assert result['eventType'] == 'DIAGNOSIS_COMPLETED'
    rows = result['payload']['analysisResults']
    assert sum(r['status'] == 'ERROR' for r in rows) == 1
    assert sum(r['status'] == 'DETECTED' for r in rows) == 1
    assert '근거 제한' in result['payload']['summary']


def test_third_round_fails_when_no_successful_evidence(fixture_tools):
    """성공한 근거가 하나도 없으면 3회 후에도 실패로 끝낸다."""
    tools.call_pcb_mcp.side_effect = ConnectionError('still down')
    tools.call_mech_mcp.side_effect = ConnectionError('still down')
    cmd = command()
    cmd['payload']['attachments'] += [{'id': '2', 'target': 'MOTOR'}]
    cmd['payload']['round'] = 3
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    assert state['result']['eventType'] == 'DIAGNOSIS_FAILED'
    assert state['result']['payload']['errorCode'] == 'INCONCLUSIVE_AFTER_THIRD_PHOTO'


def test_text_only_reports_after_rounds_exhausted(fixture_tools):
    """3회까지 사진이 없으면 소견·검색 근거만으로 리포트를 낸다."""
    tools.call_rag_mcp.return_value = {'hits': [{'kind': 'CASE', 'citation': 'case:1',
                                                 'sourceUri': 'https://example.invalid/1', 'excerpt': '유사 사례'}],
                                       'status': 'ok'}
    cmd = command()
    cmd['payload']['attachments'] = []
    cmd['payload']['round'] = 3
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    result = state['result']
    assert result['eventType'] == 'DIAGNOSIS_COMPLETED'
    tools.call_pcb_mcp.assert_not_awaited()
    assert '사진 근거 없이' in result['payload']['summary']


def test_text_only_without_any_evidence_still_fails(fixture_tools):
    """사진도 없고 검색·소견 근거도 없으면 3회 후 실패로 끝낸다."""
    tools.call_rag_mcp.return_value = {'hits': [], 'status': 'no_candidates'}
    cmd = command()
    cmd['payload']['attachments'] = []
    cmd['payload']['round'] = 3
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    assert state['result']['eventType'] == 'DIAGNOSIS_FAILED'


def test_text_only_still_asks_for_photos_before_last_round(fixture_tools):
    """0~2차에는 텍스트 근거가 있어도 사진을 계속 요청한다."""
    tools.call_rag_mcp.return_value = {'hits': [{'kind': 'CASE', 'citation': 'case:1',
                                                 'sourceUri': 'https://example.invalid/1', 'excerpt': '유사 사례'}],
                                       'status': 'ok'}
    cmd = command()
    cmd['payload']['attachments'] = []
    cmd['payload']['round'] = 2
    state = asyncio.run(harness.invoke(graph.build_graph(), cmd, AsyncMock()))
    assert state['result']['eventType'] == 'PHOTO_REQUESTED'
