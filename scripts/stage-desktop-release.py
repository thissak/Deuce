#!/usr/bin/env python3
"""Build a download directory from completed electron-builder artifacts; never publish partial builds."""
import hashlib, json, shutil, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'apps/desktop/package.json').read_text())['version']
target = Path(sys.argv[1])
target.mkdir(parents=True, exist_ok=False)
expected = [f'Deuce-{version}-mac-{arch}.{ext}' for arch in ['arm64', 'x64'] for ext in ['dmg', 'zip']]
expected += [f'Deuce-{version}-win-x64.exe', 'latest-mac.yml', 'latest.yml']
for name in expected:
    sources = [root / 'apps/desktop' / folder / name for folder in ['release', 'release-windows']]
    source = next((p for p in sources if p.is_file()), None)
    if source is None: raise SystemExit(f'Missing artifact: {name}')
    shutil.copyfile(source, target / name)
    blockmap = Path(str(source) + '.blockmap')
    if blockmap.is_file(): shutil.copyfile(blockmap, target / blockmap.name)
(target / 'index.html').write_text(f'''<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>듀스 앱 다운로드</title>
<style>body{{font:16px/1.7 system-ui,sans-serif;background:#f6f5fa;color:#222;margin:0}}main{{max-width:850px;margin:60px auto;padding:24px}}h1{{font-size:42px;letter-spacing:-1px}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}article{{background:white;border:1px solid #dedbea;border-radius:16px;padding:24px}}a{{color:#5149ad}}.button{{display:block;background:#5b50bc;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none}}small{{color:#666}}footer{{margin-top:32px}}code{{overflow-wrap:anywhere}}</style>
<main><small>DEUCE · 데스크톱 {version}</small><h1>대화를 앱에서 이어가세요.</h1>
<p>채널에서 사람과 AI가 함께 대화하고 자료를 공유하세요. 기존 듀스 계정으로 로그인합니다.</p>
<section class="cards">
<article><h2>Mac</h2><p>Apple Silicon<br><small>M 시리즈 칩</small></p><a class="button" href="Deuce-{version}-mac-arm64.dmg">Mac 앱 다운로드</a><p><small>Developer ID 서명 · Apple 공증 완료</small></p></article>
<article><h2>Mac</h2><p>Intel<br><small>Intel 프로세서</small></p><a class="button" href="Deuce-{version}-mac-x64.dmg">Intel Mac 다운로드</a><p><small>Developer ID 서명 · Apple 공증 완료</small></p></article>
<article><h2>Windows</h2><p>64비트 PC<br><small>x64 설치 프로그램</small></p><a class="button" href="Deuce-{version}-win-x64.exe">Windows 다운로드</a><p><small>현재 배포본은 코드서명이 없어 Windows에서 게시자 확인 경고가 나올 수 있습니다.</small></p></article>
</section><h2>설치하고 로그인하기</h2><ol><li>Mac은 DMG를 열고 Deuce를 Applications로 옮깁니다. Windows는 내려받은 설치 프로그램을 실행합니다.</li><li>앱에서 Google로 로그인을 누릅니다. 기본 브라우저에서 Google 로그인을 완료하면 앱으로 돌아갑니다.</li><li>참여한 채널에서 대화를 시작하세요. 창을 닫아도 트레이에서 실행되며, 완전히 종료하려면 Deuce 메뉴의 종료를 선택하세요.</li></ol>
<p>인터넷 연결과 허용된 Google 계정이 필요합니다. 앱은 실행할 때와 4시간마다 새 버전을 확인합니다. 알림에서 다운로드를 선택하고, 완료 후 재시작하고 설치를 누르세요. Deuce 메뉴의 업데이트 확인으로 직접 확인할 수도 있습니다.</p>
<footer><a href="/chat">웹에서 계속 사용하기</a> · <a href="SHA256SUMS">파일 SHA-256 확인</a></footer></main></html>''')
files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(target.iterdir()) if p.is_file()}
(target / 'SHA256SUMS').write_text(''.join(f'{digest}  {name}\n' for name, digest in files.items()))
print(json.dumps({'version':version,'files':len(files)+1,'bytes':sum(p.stat().st_size for p in target.iterdir())}))
