#!/usr/bin/env python3
"""저장한 듀스 연결 파일로 Codex/Claude Code MCP를 등록한다. 키는 명령 인자에 넣지 않는다."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--connection', type=Path, required=True)
    parser.add_argument('--name', default='deuce-requirements')
    parser.add_argument('--client', choices=['codex', 'claude', 'both'], default='both')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,60}', args.name): parser.error('name must use lowercase letters, digits, hyphens')
    root = Path(__file__).resolve().parent.parent
    entry = root / 'apps/mcp/dist/main.js'
    if not entry.exists(): parser.error('Run pnpm --filter @deuce/mcp build first')
    node = shutil.which('node')
    if not node: parser.error('Node.js is required')
    clients = ['codex', 'claude'] if args.client == 'both' else [args.client]
    for client in clients:
        if not shutil.which(client): parser.error(f'{client} CLI is not installed')
    for client in clients:
        existing = subprocess.run([client, 'mcp', 'get', args.name], cwd=root, capture_output=True, timeout=30)
        if existing.returncode == 0: parser.error(f'{client} already has MCP {args.name}; choose a different --name')
    data = json.loads(args.connection.read_text())
    if not isinstance(data, dict) or not isinstance(data.get('token'), str) or not re.fullmatch(r'deuce_[A-Za-z0-9_-]{43}', data['token']):
        parser.error('invalid connection file')
    directory = Path.home() / '.config/deuce'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = directory / f'{args.name}.json'
    if target.exists(): parser.error(f'{target} already exists; choose a different --name or remove the old connection explicitly')
    with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        json.dump({'baseUrl': data['baseUrl'], 'token': data['token']}, f)
    for client in clients:
        cmd = [client, 'mcp', 'add', args.name]
        if client == 'claude': cmd += ['--scope', 'local']
        subprocess.run(cmd + ['--', node, str(entry), '--config', str(target)], cwd=root, check=True)
    print('MCP registered. Start a new Codex/Claude Code session to use it. Keep the connection file private.')


if __name__ == '__main__':
    main()
