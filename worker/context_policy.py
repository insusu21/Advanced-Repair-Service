"""LLM용 사본의 크기·개인정보·토큰 예산. 원본 사진 근거와 접수 상태는 변경하지 않는다."""
import json
import re
from collections import Counter

from langchain_core.callbacks import BaseCallbackHandler

from . import config as C

# 키/식별자/파일 참조는 진단 계약을 유지한다. 자유 텍스트에만 패턴 마스킹을 적용한다.
MCP_TEXT_MAX_CHARS = 2000  # Rag_mcp normalize_observation / SearchRequest / reference query 계약

REFERENCE_KEYS = frozenset((
    'id', 'eventId', 'taskId', 'repairId', 'executionId', 'correlationId', 'attachmentId',
    'attachmentIds', 'addedAttachmentIds', 'partId', 'requestId', 'requestKey', 'checkpoint',
    'sha256', 'downloadPath', 'path', 'image', 'dentImage', 'annotated_image', 'dent_image',
    'citation', 'source_id', 'document_id', 'sourceUri', 'source_url', 'modelVersion',
))
PATTERNS = (
    ('SECRET', re.compile(r'\b(?:sk-(?:proj-)?|ghp_)[A-Za-z0-9_-]{16,}\b')),
    ('EMAIL', re.compile(r'(?<![A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-])[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}\b')),
    ('RRN', re.compile(r'(?<!\d)\d{6}\s*-\s*[1-8]\d{6}(?!\d)')),
    ('PHONE', re.compile(r'(?<!\d)(?:\+82[- .]?(?:10|2|[3-6]\d)|0(?:1[016789]|2|[3-6]\d))[- .]?\d{3,4}[- .]?\d{4}(?!\d)')),
    ('NAME', re.compile(r'((?:고객명|성명|이름)\s*[:：=]\s*)[^\s,;\n]{2,30}')),
    ('ADDRESS', re.compile(r'((?:주소|배송지)\s*[:：=]\s*)[^;\n]+')),
)


def mask_text(text):
    for kind, pattern in PATTERNS:
        replacement = (lambda m, k=kind: m.group(1) + f'[{k}]') if kind in ('NAME', 'ADDRESS') else f'[{kind}]'
        text = pattern.sub(replacement, text)
    return text


def masked(value, key=''):
    """계약 필드와 원본 객체는 보존하며 자유 텍스트를 마스킹한 사본을 만든다."""
    if key in REFERENCE_KEYS:
        return value
    if isinstance(value, str):
        return mask_text(value)
    if isinstance(value, dict):
        return {k: masked(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [masked(v) for v in value]
    return value


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def text_tokens(text):
    # UTF-8 byte 수는 일반 BPE 텍스트 토큰 수의 보수적 상계. 토크나이저 다운로드 없이 사용한다.
    return len(text.encode('utf-8'))


def note(kind, **counts):
    from .harness import current, record
    budget = current.get()
    if budget:
        budget.context_actions.append({'kind': kind, **counts})
    record('context.prepared', kind=kind, **counts)


def clip(text, limit):
    marker = '\n[문맥 길이 제한으로 일부 생략]'
    if text_tokens(text) <= limit:
        return text
    room = max(0, limit - text_tokens(marker))
    # 앞·뒤 문맥을 남긴다. UTF-8 중간 바이트는 버려 깨진 문자를 만들지 않는다.
    raw = text.encode('utf-8')
    front, back = room * 3 // 4, room - room * 3 // 4
    return raw[:front].decode('utf-8', errors='ignore') + marker + (raw[-back:].decode('utf-8', errors='ignore') if back else '')


def prepare_text(text, purpose='observation'):
    safe = mask_text(text)
    result = clip(safe, C.OBSERVATION_CONTEXT_BYTES)
    if len(result) > MCP_TEXT_MAX_CHARS:
        marker = '\n[문맥 길이 제한으로 일부 생략]'
        room = MCP_TEXT_MAX_CHARS - len(marker)
        front = room * 3 // 4
        result = result[:front] + marker + result[-(room-front):]
    if result != text:
        note(purpose, input_bytes=text_tokens(text), output_bytes=text_tokens(result),
             masked=safe != text, truncated=result != safe)
    return result


def bounded_finding(finding):
    """큰 결과만 구조를 요약한다. 출처·attachmentId·결함 종류/개수·오류를 우선 보존한다."""
    safe = masked(finding)
    if text_tokens(dump(safe)) <= C.TOOL_CONTEXT_BYTES:
        return safe, False
    out = safe['output']
    compact = {k: safe[k] for k in ('source', 'attachmentId', 'found') if k in safe}
    compact['output'] = {k: out[k] for k in ('tool', 'error', 'status', 'failurePolicy', 'errorCode', 'is_defective',
                                              'domain_mismatch', 'diagnosis_confirmed', 'generation_policy') if k in out}
    target = compact['output']
    defects = out.get('defects', [])
    if defects:
        counts = Counter(d['type'] for d in defects)
        target['defect_counts'] = dict(counts)
        target['defects'] = sorted(
            ({'type': kind, 'confidence': max(d['confidence'] for d in defects if d['type'] == kind)} for kind in counts),
            key=lambda d: -d['confidence'])
    # 텍스트 검색·해석 근거의 구조와 source id를 유지하고 본문만 줄인다.
    for key in ('hits', 'observations', 'detections', 'warnings'):
        if key in out:
            target[key] = out[key][:8]
    def short(value, key=''):
        if isinstance(value, str):
            return value if key in REFERENCE_KEYS else clip(value, 600)
        if isinstance(value, dict):
            return {k: short(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [short(v) for v in value]
        return value
    compact = short(compact)
    compact['context_truncated'] = True
    # 최소 핵심 근거조차 한도 안에 들어오지 않으면 조용히 삭제하지 않고 실패한다.
    if text_tokens(dump(compact)) > C.TOOL_CONTEXT_BYTES:
        from .harness import LimitExceeded
        raise LimitExceeded('Essential evidence exceeds context limit', code='CONTEXT_LIMIT')
    return compact, True


def prepare_findings(findings):
    prepared, changed = [], False
    for finding in findings:
        value, trimmed = bounded_finding(finding)
        prepared.append(value)
        changed |= trimmed
    total = text_tokens(dump(prepared))
    if total > C.REPORT_FINDINGS_BYTES:
        # 최근 사진을 먼저 싣되 PCB/MECH/RAG/해석 도구별 근거 하나는 반드시 남긴다.
        buckets = {}
        for i, f in enumerate(prepared):
            buckets[(f['source'], f['output'].get('tool'))] = i
        required = set(buckets.values())
        # 이전 사진만 결함이 있는 경우에도 그 양성 근거와 실패 사실을 버리지 않는다.
        positives = {}
        for i, f in enumerate(prepared):
            if f.get("found"):
                positives[f["source"]] = i
            if f["output"].get("error"):
                required.add(i)
        required.update(positives.values())
        chosen_indices = set(required)
        def with_summary(indices):
            chosen = [prepared[i] for i in sorted(indices)]
            omitted = [f for i, f in enumerate(findings) if i not in indices]
            counts, maxima = Counter(), {}
            for f in omitted:
                for d in f['output'].get('defects', []):
                    key = (f['source'], d['type'])
                    counts[key] += 1
                    maxima[key] = max(maxima.get(key, 0), d['confidence'])
            if omitted:
                chosen.append({'source': 'CONTEXT_SUMMARY', 'attachmentId': None, 'found': False,
                               'output': {'omitted_findings': len(omitted), 'defect_summary': [
                                   {'source': k[0], 'type': k[1], 'count': n, 'max_confidence': maxima[k]}
                                   for k, n in sorted(counts.items())]}})
            return masked(chosen)
        chosen = with_summary(chosen_indices)
        if text_tokens(dump(chosen)) > C.REPORT_FINDINGS_BYTES:
            from .harness import LimitExceeded
            raise LimitExceeded('Essential sources exceed context limit', code='CONTEXT_LIMIT')
        for i in reversed(range(len(prepared))):
            if i not in chosen_indices:
                trial = with_summary(chosen_indices | {i})
                if text_tokens(dump(trial)) <= C.REPORT_FINDINGS_BYTES:
                    chosen_indices.add(i)
                    chosen = trial
        prepared, changed = chosen, True
    if changed:
        note('findings', input_count=len(findings), output_count=len(prepared),
             input_bytes=text_tokens(dump(findings)), output_bytes=text_tokens(dump(prepared)), truncated=True)
    return prepared, changed


def check_event_size(value):
    # journal.encode와 같은 공백 포함 JSON 직렬화로 실제 전송 크기를 계산한다.
    if len(json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()) > C.MAX_EVENT_BYTES:
        from .harness import current, LimitExceeded
        budget = current.get()
        if budget:
            budget.stop("OUTPUT_SIZE_LIMIT", limit=C.MAX_EVENT_BYTES)
        raise LimitExceeded("Output exceeds event size limit", code="OUTPUT_SIZE_LIMIT")
    return value


def reserve_llm(schema, prompt, *, image=False):
    from .harness import current, LimitExceeded
    schema_size = text_tokens(dump(schema.model_json_schema()))
    # 호출 포맷 여유 1,024 + 이미지 별도 예약. 실제 이미지 토큰의 확정값은 아니다.
    requested = text_tokens(prompt) + schema_size + 1024 + C.MAX_OUTPUT_TOKENS
    if image:
        requested += C.IMAGE_TOKEN_RESERVE
    budget = current.get()
    def stop(code, used, limit):
        if budget:
            budget.stop(code, used=used, requested=requested, limit=limit)
        raise LimitExceeded(code, code=code)
    if requested > C.MAX_CONTEXT_TOKENS:
        stop('CONTEXT_LIMIT', 0, C.MAX_CONTEXT_TOKENS)
    if budget:
        used = max(budget.tokens_reserved, budget.llm_usage["total_tokens"])
        if used + requested > C.MAX_RUN_TOKENS:
            stop('TOKEN_BUDGET_EXCEEDED', used, C.MAX_RUN_TOKENS)
        # 실패·재시도도 환급하지 않는다. 병렬 호출은 await 전에 예약한다.
        budget.tokens_reserved = used + requested
        budget.llm_calls += 1
    note('llm_reservation', reserved=requested, image=image)


class UsageTracker(BaseCallbackHandler):
    """Agent 직접 LLM 호출의 응답 사용량만 기록. MCP 내부 LLM 비용은 알 수 없다."""
    run_inline = True
    raise_error = True

    def on_llm_end(self, response, **kwargs):
        from .harness import current, record
        budget = current.get()
        for row in response.generations:
            for generation in row:
                usage = getattr(getattr(generation, 'message', None), 'usage_metadata', None)
                if usage:
                    counts = {k: usage.get(k, 0) for k in ('input_tokens', 'output_tokens', 'total_tokens')}
                    if budget:
                        budget.llm_usage.update(counts)
                        if budget.llm_usage["total_tokens"] > C.MAX_RUN_TOKENS:
                            budget.stop("TOKEN_BUDGET_EXCEEDED", used=budget.llm_usage["total_tokens"],
                                        limit=C.MAX_RUN_TOKENS)
                    record('llm.usage', **counts)
