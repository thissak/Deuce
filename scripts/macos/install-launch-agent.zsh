#!/bin/zsh

set -euo pipefail
umask 077

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This installer must run on macOS"
  exit 69
fi

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"
server_root="$repo_root/apps/server"
runner="$script_dir/run-deuce-server.zsh"
template="$script_dir/com.goldenlab.deuce-server.plist"
env_file="${1:-$HOME/Library/Application Support/Deuce/server.env}"
node_bin="${DEUCE_NODE_BIN:-$(command -v node || true)}"

if [[ -z "$node_bin" || ! -x "$node_bin" ]]; then
  print -u2 "Node was not found; set DEUCE_NODE_BIN to its absolute path"
  exit 69
fi
node_bin="${node_bin:A}"

if ! "$node_bin" --help | grep -q -- "--env-file"; then
  print -u2 "The installed Node does not support --env-file"
  exit 69
fi

if [[ ! -f "$server_root/dist/index.js" ]]; then
  print -u2 "Build the server with npm run build before installing the agent"
  exit 66
fi

if [[ ! -f "$env_file" ]]; then
  print -u2 "Create the server environment file before installing the agent"
  exit 66
fi
env_file="${env_file:A}"

if ! HOST="127.0.0.1" NODE_ENV="production" \
  "$node_bin" --env-file="$env_file" \
  -e 'if (!process.env.DEUCE_DATABASE_URL) process.exit(78)'; then
  print -u2 "The Deuce server environment file is invalid"
  exit 78
fi

app_support_dir="${env_file:h}"
launch_agents_dir="$HOME/Library/LaunchAgents"
logs_dir="$HOME/Library/Logs/Deuce"
plist_target="$launch_agents_dir/com.goldenlab.deuce-server.plist"
stdout_log="$logs_dir/server.stdout.log"
stderr_log="$logs_dir/server.stderr.log"

mkdir -p "$app_support_dir" "$launch_agents_dir" "$logs_dir"
chmod 700 "$app_support_dir" "$logs_dir"
chmod 600 "$env_file"

cp "$template" "$plist_target"
plutil -replace ProgramArguments.1 -string "$runner" "$plist_target"
plutil -replace ProgramArguments.2 -string "$node_bin" "$plist_target"
plutil -replace ProgramArguments.3 -string "$server_root" "$plist_target"
plutil -replace ProgramArguments.4 -string "$env_file" "$plist_target"
plutil -replace WorkingDirectory -string "$server_root" "$plist_target"
plutil -replace StandardOutPath -string "$stdout_log" "$plist_target"
plutil -replace StandardErrorPath -string "$stderr_log" "$plist_target"
plutil -lint "$plist_target"

label="com.goldenlab.deuce-server"
domain="gui/$(id -u)"
service="$domain/$label"

if launchctl print "$service" >/dev/null 2>&1; then
  launchctl bootout "$service"
fi

launchctl bootstrap "$domain" "$plist_target"
launchctl enable "$service"
launchctl kickstart -k "$service"
launchctl print "$service"
