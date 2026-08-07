#!/bin/zsh

set -euo pipefail
umask 077

if (( $# != 3 )); then
  print -u2 "usage: run-keycloak.zsh <keycloak-home> <config-file> <secrets-file>"
  exit 64
fi

keycloak_home="$1"
config_file="$2"
secrets_file="$3"
java_home="/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home"

if [[ ! -x "$java_home/bin/java" ]]; then
  print -u2 "OpenJDK 25 is unavailable"
  exit 69
fi

if [[ ! -x "$keycloak_home/bin/kc.sh" ]]; then
  print -u2 "Keycloak is unavailable"
  exit 69
fi

if [[ ! -f "$config_file" ]]; then
  print -u2 "Keycloak configuration is unavailable"
  exit 66
fi

if [[ ! -f "$secrets_file" ]]; then
  print -u2 "Keycloak secrets are unavailable"
  exit 78
fi

if [[ "$(stat -f '%Su:%Lp' "$secrets_file")" != "$(id -un):600" ]]; then
  print -u2 "Keycloak secrets must be owned by the current user with mode 600"
  exit 78
fi

KC_DB_PASSWORD="$(
  awk -F= '$1 == "KC_DB_PASSWORD" { sub(/^[^=]*=/, ""); print; exit }' \
    "$secrets_file"
)"
if [[ -z "$KC_DB_PASSWORD" ]]; then
  print -u2 "Keycloak database password is unavailable"
  exit 78
fi

export JAVA_HOME="$java_home"
export PATH="$JAVA_HOME/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export KC_DB_PASSWORD
export JAVA_OPTS_KC_HEAP="-Xms256m -Xmx768m"

cd "$keycloak_home"
exec "$keycloak_home/bin/kc.sh" \
  --config-file="$config_file" \
  start --optimized
