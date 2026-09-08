#!/usr/bin/env python3
"""실제 웹 빌드에 지연된 API 응답을 주입하는 localhost 전용 진단 검증 도구."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'apps/web/dist'
SCRIPT = r"""
<script>
(() => {
  const nativeFetch = window.fetch.bind(window);
  const user = {id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.com',name:'검증 사용자',avatarUrl:null};
  const conversation = {id:'00000000-0000-4000-8000-000000000002',type:'GROUP',title:'진단 검증',displayName:'진단 검증',members:[user],lastMessage:null,unreadCount:0,mutedAt:null,pinnedMessage:null};
  const messages = [];
  window.__diagnosticHarness = {delayMs:600, report:null};
  window.fetch = async (input, init={}) => {
    const url = new URL(String(input),location.href);
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return nativeFetch(input,init);
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    const responseHeaders = {'content-type':'application/json','x-request-id':crypto.randomUUID(),'x-deuce-trace-id':headers.get('x-deuce-trace-id') || crypto.randomUUID(),'server-timing':'app;dur=10, db;dur=4'};
    let data, status=200;
    if (url.pathname==='/auth/me') data=user;
    else if (url.pathname==='/api/diagnostics' && method==='POST') {
      window.__diagnosticHarness.report=JSON.parse(init.body);
      data={reportId:crypto.randomUUID()}; status=201;
    }
    else if (url.pathname==='/api/conversations') data=[conversation];
    else if (url.pathname.endsWith('/messages') && method==='POST') {
      await new Promise(resolve=>setTimeout(resolve,window.__diagnosticHarness.delayMs));
      data={id:crypto.randomUUID(),conversationId:conversation.id,author:user,body:JSON.parse(init.body).body,deleted:false,replyTo:null,reactions:[],mentions:[],attachments:[],createdAt:new Date().toISOString(),editedAt:null,pinnedAt:null};
      messages.unshift(data); status=201;
    }
    else if (url.pathname.endsWith('/messages')) data={items:messages,nextCursor:null};
    else if (url.pathname.endsWith('/read')) data={conversationId:conversation.id,lastReadMessageId:messages[0]?.id || null};
    else if (url.pathname==='/api/conversations/'+conversation.id) data=conversation;
    else if (url.pathname==='/api/presence') data={};
    else if (['/api/users','/api/activity','/api/search'].includes(url.pathname) || url.pathname.endsWith('/attachments')) data=[];
    else {data={error:'fixture route unavailable'};status=404;}
    return new Response(JSON.stringify(data),{status,headers:responseHeaders});
  };
})();
</script>
"""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith('/socket.io'):
            self.send_error(404)
        elif self.path.startswith(('/assets/', '/favicon')):
            super().do_GET()
        else:
            data = (ROOT / 'index.html').read_text().replace('<head>', '<head>' + SCRIPT).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    assert (ROOT / 'index.html').exists(), 'pnpm --filter @deuce/web build 먼저 실행'
    print('http://127.0.0.1:5473/chat/00000000-0000-4000-8000-000000000002?diagnostics=1', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 5473), Handler).serve_forever()
