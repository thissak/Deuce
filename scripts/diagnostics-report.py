#!/usr/bin/env python3
"""서버 JSONL과 브라우저 진단을 결합한다. 원문 로그·메시지·인증 정보는 출력하지 않는다."""
import argparse
import json
import math
import subprocess
from pathlib import Path


def summarize(values):
    values = sorted(values)
    if not values:
        return {"count": 0}
    return {"count": len(values), "p50Ms": round(values[math.ceil(len(values) * .5) - 1], 2),
            "p95Ms": round(values[math.ceil(len(values) * .95) - 1], 2), "maxMs": round(values[-1], 2)}


def analyze(rows, client=None, report_id=None):
    # event 필드가 없는 과거 요청 로그는 OAuth query 등을 포함할 수 있어 반환하지 않는다.
    server_fields = {"time", "event", "traceId", "requestId", "route", "method", "status", "durationMs",
                     "dbCount", "dbMs", "messageId", "reportId", "count", "dropped", "rssBytes",
                     "heapUsedBytes", "eventLoopP99Ms", "eventLoopMaxMs", "sockets", "rooms", "transport"}
    requests = [r for r in rows if r.get("event") == "http.completed"]
    report_rows = [r for r in rows if r.get("event") == "diagnostic.report"]
    if report_id is None and client is None and report_rows:
        report_id = report_rows[-1]["reportId"]
    events = client.get("events", []) if client else [r["client"] for r in rows
             if r.get("event") == "diagnostic.client" and r.get("reportId") == report_id]
    metadata = next((r for r in report_rows if r.get("reportId") == report_id), None)
    trace_ids = {e.get("traceId") for e in events if e.get("traceId")}
    matched = [r for r in requests if r.get("traceId") in trace_ids]
    http = []
    messages = []
    for trace_id in sorted(trace_ids):
        chain = [e for e in events if e.get("traceId") == trace_id]
        start = next((e for e in chain if e["event"] == "http.start"), None)
        headers = next((e for e in chain if e["event"] == "http.headers"), None)
        body = next((e for e in chain if e["event"] == "http.body"), None)
        if start and headers:
            end = body or headers
            http.append({"traceId": trace_id, "route": start.get("route"), "status": headers.get("status"),
                         "headersMs": round(headers["mono"] - start["mono"], 2),
                         "throughBodyMs": round(end["mono"] - start["mono"], 2),
                         "serverMs": headers.get("serverMs"), "dbMs": headers.get("dbMs")})
        submit = next((e for e in chain if e["event"] in ("ui.submit", "ui.retry")), None)
        message_id = next((e.get("messageId") for e in chain if e.get("messageId")), None)
        if submit and message_id:
            observation = {"traceId": trace_id, "messageId": message_id}
            for name, field in [("socket.event", "submitToSocketMs"), ("message.dom", "submitToDomMs"),
                                ("message.frame", "submitToFrameOpportunityMs")]:
                event = next((e for e in events if e["event"] == name and e.get("messageId") == message_id
                              and e["mono"] >= submit["mono"]), None)
                if event:
                    observation[field] = round(event["mono"] - submit["mono"], 2)
                    if name == 'message.dom':
                        observation["visible"] = event.get("visible")
                        observation["inViewport"] = event.get("inViewport")
            messages.append(observation)
    routes = {}
    for r in requests:
        key = f"{r.get('method')} {r.get('route')}"
        routes.setdefault(key, []).append(r["durationMs"])
    return {"reportId": report_id, "clientEventCount": len(events),
            "reportComplete": len(events) == metadata["count"] if metadata else None,
            "dropped": client.get("dropped", 0) if client else metadata.get("dropped", 0) if metadata else None,
            "clientTimeline": events,
            "requestsByRoute": {k: summarize(v) for k, v in sorted(routes.items())},
            "http": http, "messages": messages,
            "serverRequests": [{k: v for k, v in r.items() if k in server_fields} for r in matched],
            "serviceMetrics": [{k: v for k, v in r.items() if k in server_fields}
                               for r in rows if r.get("event") == "service.metrics"],
            "serverEventCounts": {kind: sum(r.get("event") == kind for r in rows)
                                  for kind in ("http.error", "socket.rejected", "socket.connected",
                                               "socket.disconnected", "service.ready", "service.stopping")},
            "clientErrorCounts": {kind: sum(e["event"] == kind for e in events)
                                  for kind in ("js.error", "http.error", "query.error", "mutation.error", "socket.error", "longtask")},
            "notes": ["브라우저 mono끼리만 차이를 계산한다. 서버·클라이언트 시계는 직접 빼지 않는다.",
                      "DB 시간은 Prisma 호출 합계로, 병렬 호출 시 요청 전체 시간보다 클 수 있다.",
                      "frame은 렌더링 기회 근사치이며 실제 픽셀 표시 시각은 아니다.",
                      "클라이언트 기록은 사용자 제공 관측값이다. 서버 기록과 구분해서 판단한다."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--server", type=Path, help="journalctl -o cat JSONL 파일")
    source.add_argument("--vm", metavar="INSTANCE", help="지정한 GCP VM에서 IAP로 최근 2시간 로그 읽기")
    parser.add_argument("--project", help="VM의 GCP 프로젝트 ID")
    parser.add_argument("--zone", help="VM의 GCP 존")
    parser.add_argument("--client", type=Path, help="브라우저에서 저장한 deuce-diagnostics.json")
    parser.add_argument("--report-id", help="서버로 보낸 접수 번호; 생략 시 최근 보고서")
    args = parser.parse_args()
    if args.vm:
        if not args.project or not args.zone: parser.error('--vm requires --project and --zone')
        result = subprocess.run(["gcloud", "compute", "ssh", args.vm, f"--project={args.project}",
                                 f"--zone={args.zone}", "--tunnel-through-iap", "--quiet",
                                 "--command=sudo journalctl -u deuce --since '2 hours ago' -o cat --no-pager"],
                                capture_output=True, text=True, check=True)
        raw = result.stdout
    else:
        raw = args.server.read_text()
    rows = []
    for line in raw.splitlines():
        try:
            row = json.loads(line)
            if isinstance(row, dict): rows.append(row)
        except ValueError:
            pass
    client = json.loads(args.client.read_text()) if args.client else None
    print(json.dumps(analyze(rows, client, args.report_id), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
