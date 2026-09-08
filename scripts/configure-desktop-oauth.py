#!/usr/bin/env python3
"""Import Google's downloaded Desktop app JSON without printing its credentials."""
import json
import os
import re
import sys
from pathlib import Path

source = Path(sys.argv[1]).expanduser()
config = json.loads(source.read_text())
native = config.get('installed', {})
if (not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', native.get('client_id', ''))
        or not native.get('client_secret')):
    sys.exit('Expected Google Desktop app OAuth JSON; Web application JSON is not accepted.')
target = Path(__file__).resolve().parents[1] / 'apps/desktop/build/google-desktop.json'
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.fchmod(fd, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump({'installed': native}, output, indent=2)
    output.write('\n')
print('Desktop OAuth JSON configured. Server GOOGLE_DESKTOP_CLIENT_ID must match this client.')
