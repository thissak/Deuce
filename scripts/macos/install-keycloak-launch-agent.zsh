#!/bin/zsh

set -euo pipefail
umask 077

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This installer must run on macOS"
  exit 69
fi

script_dir="${0:A:h}"
runner_source="$script_dir/run-keycloak.zsh"
template="$script_dir/com.goldenlab.deuce-keycloak.plist"
keycloak_home="${1:-$HOME/Applications/keycloak-26.7.0}"
config_file="${2:-$HOME/Library/Application Support/Deuce/keycloak/keycloak.conf}"
secrets_file="${3:-$HOME/Library/Application Support/Deuce/keycloak/secrets.env}"

if [[ ! -x "$keycloak_home/bin/kc.sh" ]]; then
  print -u2 "Keycloak was not found at $keycloak_home"
  exit 66
fi
keycloak_home="${keycloak_home:A}"

if [[ ! -f "$config_file" ]]; then
  print -u2 "Keycloak configuration was not found at $config_file"
  exit 66
fi
config_file="${config_file:A}"

if [[ ! -f "$secrets_file" ]]; then
  print -u2 "Keycloak secrets were not found at $secrets_file"
  exit 66
fi
secrets_file="${secrets_file:A}"

if [[ "$(stat -f '%Su:%Lp' "$secrets_file")" != "$(id -un):600" ]]; then
  print -u2 "Keycloak secrets must be owned by the current user with mode 600"
  exit 78
fi

launch_agents_dir="$HOME/Library/LaunchAgents"
logs_dir="$HOME/Library/Logs/Deuce/Keycloak"
runtime_dir="${config_file:h}"
runner="$runtime_dir/run-keycloak.zsh"
plist_target="$launch_agents_dir/com.goldenlab.deuce-keycloak.plist"
stdout_log="$logs_dir/keycloak.stdout.log"
stderr_log="$logs_dir/keycloak.stderr.log"

mkdir -p "$launch_agents_dir" "$logs_dir" "$runtime_dir"
chmod 700 "$logs_dir" "$runtime_dir"
chmod 600 "$config_file"
install -m 700 "$runner_source" "$runner"

cp "$template" "$plist_target"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:1 $runner" "$plist_target"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:2 $keycloak_home" "$plist_target"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:3 $config_file" "$plist_target"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:4 $secrets_file" "$plist_target"
plutil -replace WorkingDirectory -string "$keycloak_home" "$plist_target"
plutil -replace StandardOutPath -string "$stdout_log" "$plist_target"
plutil -replace StandardErrorPath -string "$stderr_log" "$plist_target"

if grep -q "__DEUCE_KEYCLOAK_" "$plist_target"; then
  print -u2 "The generated LaunchAgent plist still contains placeholders"
  exit 78
fi

chmod 600 "$plist_target"
plutil -lint "$plist_target"

label="com.goldenlab.deuce-keycloak"
domain="gui/$(id -u)"
service="$domain/$label"

if launchctl print "$service" >/dev/null 2>&1; then
  launchctl bootout "$service"
fi

launchctl bootstrap "$domain" "$plist_target"
launchctl enable "$service"
launchctl kickstart -k "$service"
launchctl print "$service"
