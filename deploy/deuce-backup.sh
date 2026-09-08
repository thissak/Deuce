#!/usr/bin/env bash
# DB와 첨부를 VM 밖에 보존한다. 버킷 객체 생성·조회만 허용하고 삭제 권한은 주지 않는다.
set -euo pipefail
umask 077
BACKUP_DIR=/var/backups/deuce
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
: "${DEUCE_BACKUP_BUCKET:?Set DEUCE_BACKUP_BUCKET to your private gs:// bucket URL}"
[[ "$DEUCE_BACKUP_BUCKET" == gs://* ]] || { echo 'Expected a gs:// backup bucket' >&2; exit 1; }
DEST="${DEUCE_BACKUP_BUCKET%/}/$STAMP"
install -d -m 0700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || exit 0
WORK=$(mktemp -d "$BACKUP_DIR/run.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

# 현재 첨부는 생성 뒤 수정되지 않으며 사용자 삭제도 소프트 삭제다.
# DB 스냅샷 이후 파일을 수집해 스냅샷이 참조하는 첨부를 포함한다.
sudo -u postgres pg_dump -Fc --no-owner --no-acl deuce > "$WORK/deuce.dump"
pg_restore --list "$WORK/deuce.dump" > /dev/null
tar -C /var/lib/deuce -czf "$WORK/uploads.tar.gz" uploads
tar -tzf "$WORK/uploads.tar.gz" > /dev/null
# 복구에 필요한 로그인 설정·세션 키도 비공개 백업에 포함한다.
tar -C /etc/deuce -czf "$WORK/config.tar.gz" deuce.env
cp /opt/deuce/current/DEPLOYMENT.json "$WORK/DEPLOYMENT.json"
(cd "$WORK" && sha256sum deuce.dump uploads.tar.gz config.tar.gz DEPLOYMENT.json > SHA256SUMS)
for name in deuce.dump uploads.tar.gz config.tar.gz DEPLOYMENT.json; do
  gcloud storage cp "$WORK/$name" "$DEST/$name" --quiet
done
# 마지막에 기록되는 manifest가 완전한 백업의 표시다.
gcloud storage cp "$WORK/SHA256SUMS" "$DEST/SHA256SUMS" --quiet
echo "Deuce backup complete: $DEST"
