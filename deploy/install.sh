#!/usr/bin/env bash
# Run this ON THE PI. Idempotent: safe to re-run after fixing whatever it
# complains about.
#
#   ./install.sh preflight   # check the node before changing anything
#   ./install.sh operator    # install the 1Password operator + token secret
#   ./install.sh deploy      # apply the manifests
#   ./install.sh seed        # copy the database onto the volume
#   ./install.sh status      # what is actually running
set -euo pipefail

K="microk8s kubectl"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS=meal-planner
OPNS=onepassword

die() { echo "ERROR: $*" >&2; exit 1; }
ok()  { echo "  ok    $*"; }
warn(){ echo "  WARN  $*"; }

preflight() {
  echo "==> node"
  arch="$(uname -m)"
  [[ "$arch" == "aarch64" || "$arch" == "arm64" ]] || die "expected arm64, found $arch"
  ok "architecture $arch"

  [[ "$(getconf LONG_BIT)" == "64" ]] || die "32-bit userland — the node:22 arm64 image needs a 64-bit OS"
  ok "64-bit userland"

  # On a Pi the memory cgroup is off unless it was turned on in the boot
  # cmdline. Without it, any pod carrying a memory limit — this one does — is
  # killed at startup with a cgroup error that does not mention the Pi at all.
  if [[ -f /sys/fs/cgroup/memory.max || -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]]; then
    ok "memory cgroup enabled"
  else
    cmdline=/boot/firmware/cmdline.txt
    [[ -f $cmdline ]] || cmdline=/boot/cmdline.txt
    die "memory cgroup is off. Add to $cmdline (one line, no newline) then reboot:
         cgroup_enable=memory cgroup_memory=1"
  fi

  command -v microk8s >/dev/null || die "microk8s not installed"
  microk8s status --wait-ready --timeout 60 >/dev/null || die "microk8s is not ready"
  ok "microk8s ready"

  echo "==> storage"
  microk8s status | grep -q "hostpath-storage: enabled" \
    || warn "hostpath-storage is not enabled yet (the next step enables it)"

  # The whole point of this node was the SSD. hostpath-storage writes under the
  # snap common dir, which is on the root filesystem — if root is the SD card,
  # two years of purchase history land on the SD card and so does every SQLite
  # write.
  store=/var/snap/microk8s/common/default-storage
  mkdir -p "$store" 2>/dev/null || true
  dev="$(df --output=source "$store" 2>/dev/null | tail -1)"
  echo "    storage path : $store"
  echo "    backing dev  : $dev"
  if [[ "$dev" == *mmcblk* ]]; then
    warn "that is the SD card. SQLite in WAL mode will be slow and will wear it out."
    warn "Point the storage elsewhere, or bind-mount the SSD at $store, before seeding."
  else
    ok "not an SD card"
  fi

  echo "==> free space"
  avail="$(df -h --output=avail "$store" | tail -1 | tr -d ' ')"
  echo "    $avail available"
}

operator() {
  echo "==> addons"
  microk8s enable helm3 hostpath-storage >/dev/null
  ok "helm3, hostpath-storage"

  echo "==> helm repo"
  microk8s helm3 repo add 1password https://1password.github.io/connect-helm-charts >/dev/null 2>&1 || true
  microk8s helm3 repo update >/dev/null
  ok "1password chart repo"

  $K get namespace "$OPNS" >/dev/null 2>&1 || $K create namespace "$OPNS" >/dev/null
  ok "namespace $OPNS"

  if $K -n "$OPNS" get secret onepassword-service-account >/dev/null 2>&1; then
    ok "service account token already present (delete the secret to replace it)"
  else
    echo
    echo "Paste the 1Password service account token. It is not echoed, and it"
    echo "does not go into your shell history."
    read -rs OP_TOKEN
    [[ -n "${OP_TOKEN:-}" ]] || die "no token given"
    [[ "$OP_TOKEN" == ops_* ]] || warn "that does not start with ops_ — check you pasted a service account token"
    $K -n "$OPNS" create secret generic onepassword-service-account \
      --from-literal=token="$OP_TOKEN" >/dev/null
    unset OP_TOKEN
    ok "token stored"
  fi

  echo "==> operator"
  microk8s helm3 upgrade --install onepassword 1password/connect \
    --namespace "$OPNS" \
    --set connect.create=false \
    --set operator.create=true \
    --set operator.watchNamespace="{$NS}" >/dev/null
  ok "chart applied"

  # The chart's value for a service-account credential has moved between
  # versions, so rather than trust a flag, check whether the operator actually
  # got the variable and set it if not.
  deploy="$($K -n "$OPNS" get deploy -o name | grep -i operator | head -1)"
  [[ -n "$deploy" ]] || die "operator deployment not found; check: microk8s helm3 -n $OPNS list"
  if $K -n "$OPNS" get "$deploy" -o yaml | grep -q OP_SERVICE_ACCOUNT_TOKEN; then
    ok "OP_SERVICE_ACCOUNT_TOKEN is set"
  else
    warn "chart did not set OP_SERVICE_ACCOUNT_TOKEN — setting it directly"
    $K -n "$OPNS" set env "$deploy" \
      OP_SERVICE_ACCOUNT_TOKEN="$($K -n "$OPNS" get secret onepassword-service-account -o jsonpath='{.data.token}' | base64 -d)" >/dev/null
    ok "set"
  fi

  $K -n "$OPNS" rollout status "$deploy" --timeout=120s
}

deploy_app() {
  echo "==> helm"
  microk8s helm3 upgrade --install meal-planner "$HERE/charts/meal-planner" \
    --namespace "$NS" --create-namespace --wait --timeout 5m || {
      echo
      echo "  rollout did not finish. Usually the secrets have not synced:"
      $K -n "$NS" get pod -o wide || true
      $K -n "$OPNS" logs deploy/onepassword-connect-operator --tail=20 2>/dev/null || true
      die "helm install failed"
    }
  ok "release installed"

  for want in kroger-credentials slack-credentials; do
    $K -n "$NS" get secret "$want" >/dev/null 2>&1 && ok "$want synced" || {
      echo
      echo "  $want never appeared. Almost always one of:"
      echo "    - the item is still in the Private vault (a service account cannot read it)"
      echo "    - the service account was not granted the tynet vault"
      echo "    - the item name does not match the itemPath in values.yaml"
      $K -n "$OPNS" logs deploy/onepassword-connect-operator --tail=20 2>/dev/null || true
      die "secrets did not sync"
    }
  done
}

seed() {
  echo "==> seeding the volume"
  for f in claude-grocery.db kroger-token.json week-events.json; do
    [[ -f "$HERE/seed/$f" ]] || die "put $f in $HERE/seed/ first (see README step 4)"
  done
  $K -n "$NS" get pvc meal-planner-data >/dev/null 2>&1 \
    || die "no volume yet — run ./install.sh deploy first, then seed"

  # Stop the writer before touching its database. Scaling to zero is not a
  # violation of the one-replica rule; running two copies would be.
  had_pod=0
  if $K -n "$NS" get deploy meal-planner >/dev/null 2>&1; then
    had_pod=1
    $K -n "$NS" scale deploy/meal-planner --replicas=0 >/dev/null
    $K -n "$NS" wait --for=delete pod -l app.kubernetes.io/name=meal-planner --timeout=90s >/dev/null 2>&1 || true
    ok "stopped the running pod"
  fi

  $K -n "$NS" delete pod seed --ignore-not-found >/dev/null 2>&1 || true
  $K -n "$NS" apply -f - >/dev/null <<'POD'
apiVersion: v1
kind: Pod
metadata: { name: seed, namespace: meal-planner }
spec:
  restartPolicy: Never
  securityContext: { fsGroup: 1000 }
  containers:
    - name: seed
      image: busybox
      command: ["sh", "-c", "sleep 600"]
      volumeMounts: [{ name: d, mountPath: /data }]
  volumes:
    - name: d
      persistentVolumeClaim: { claimName: meal-planner-data }
POD
  $K -n "$NS" wait --for=condition=Ready pod/seed --timeout=120s >/dev/null

  # A first start may have created an empty database. Its WAL and shm would be
  # read alongside the real file and give a torn view of it.
  $K -n "$NS" exec seed -- sh -c 'rm -f /data/claude-grocery.db-wal /data/claude-grocery.db-shm' || true

  for f in claude-grocery.db kroger-token.json week-events.json; do
    $K -n "$NS" cp "$HERE/seed/$f" "seed:/data/$f"
    ok "copied $f"
  done
  $K -n "$NS" exec seed -- ls -l /data
  $K -n "$NS" delete pod seed >/dev/null

  if [[ $had_pod -eq 1 ]]; then
    $K -n "$NS" scale deploy/meal-planner --replicas=1 >/dev/null
    $K -n "$NS" rollout status deploy/meal-planner --timeout=120s
  fi
  ok "volume seeded"
}

backup() {
  # The image has no sqlite3, so there is no online .backup to lean on. Stop the
  # writer, copy the file cold, start it again — the pod is down for seconds and
  # the copy is guaranteed consistent.
  out="${2:-/tmp}/claude-grocery-$(date +%Y%m%d-%H%M%S).db"
  echo "==> cold backup to $out"

  running=0
  if [[ "$($K -n "$NS" get deploy meal-planner -o jsonpath='{.spec.replicas}' 2>/dev/null)" == "1" ]]; then
    running=1
    $K -n "$NS" scale deploy/meal-planner --replicas=0 >/dev/null
    $K -n "$NS" wait --for=delete pod -l app.kubernetes.io/name=meal-planner --timeout=90s >/dev/null 2>&1 || true
    ok "stopped the writer"
  fi

  $K -n "$NS" delete pod backup --ignore-not-found >/dev/null 2>&1 || true
  $K -n "$NS" apply -f - >/dev/null <<'POD'
apiVersion: v1
kind: Pod
metadata: { name: backup, namespace: meal-planner }
spec:
  restartPolicy: Never
  containers:
    - name: backup
      image: busybox
      command: ["sh", "-c", "sleep 300"]
      volumeMounts: [{ name: d, mountPath: /data, readOnly: true }]
  volumes:
    - name: d
      persistentVolumeClaim: { claimName: meal-planner-data }
POD
  $K -n "$NS" wait --for=condition=Ready pod/backup --timeout=120s >/dev/null
  $K -n "$NS" cp "backup:/data/claude-grocery.db" "$out"
  $K -n "$NS" delete pod backup >/dev/null

  if [[ $running -eq 1 ]]; then
    $K -n "$NS" scale deploy/meal-planner --replicas=1 >/dev/null
    $K -n "$NS" rollout status deploy/meal-planner --timeout=120s
  fi
  ls -lh "$out"
  ok "backed up"
}

status() {
  $K -n "$NS" get pod,pvc,onepassworditem,secret 2>/dev/null || true
  echo
  $K -n "$NS" logs deploy/meal-planner --tail=30 2>/dev/null || echo "(no pod logs yet)"
}

case "${1:?usage: install.sh preflight|operator|deploy|seed|status|backup}" in
  preflight) preflight ;;
  operator)  preflight; operator ;;
  deploy)    deploy_app ;;
  install)   deploy_app ;;
  seed)      seed ;;
  status)    status ;;
  backup)    backup "$@" ;;
  *) die "unknown step: $1" ;;
esac
