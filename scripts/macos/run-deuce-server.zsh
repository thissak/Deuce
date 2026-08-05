#!/bin/zsh

set -euo pipefail
umask 077

if (( $# != 3 )); then
  print -u2 "usage: run-deuce-server.zsh <node-bin> <server-root> <env-file>"
  exit 64
fi

node_bin="$1"
server_root="$2"
env_file="$3"

if [[ ! -x "$node_bin" ]]; then
  print -u2 "Deuce Node executable is unavailable"
  exit 69
fi

if [[ ! -f "$server_root/dist/index.js" ]]; then
  print -u2 "Deuce server build output is unavailable"
  exit 66
fi

if [[ ! -f "$env_file" ]]; then
  print -u2 "Deuce server environment file is unavailable"
  exit 66
fi

export HOST="127.0.0.1"
export NODE_ENV="production"

cd "$server_root"
exec "$node_bin" --env-file="$env_file" dist/index.js
