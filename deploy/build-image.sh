#!/usr/bin/env bash
# Build the image on your Mac and get it onto the Pi.
#
#   ./deploy/build-image.sh pi.lan            # push to the node's registry
#   ./deploy/build-image.sh pi.lan --tarball  # ship it over ssh instead
#
# The node is arm64, so the image must be arm64. On Apple Silicon that is the
# native build and costs nothing; on an Intel Mac it needs emulation and takes
# a while, which is why the architecture is checked rather than assumed.
set -euo pipefail

NODE="${1:?usage: build-image.sh <pi-host> [--tarball]}"
MODE="${2:-registry}"
TAG="localhost:32000/meal-planner:0.1.0"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v podman >/dev/null || { echo "podman not found (brew install podman)"; exit 1; }
podman machine inspect >/dev/null 2>&1 || { echo "podman machine is not running: podman machine start"; exit 1; }

host_arch="$(uname -m)"
if [[ "$host_arch" != "arm64" && "$host_arch" != "aarch64" ]]; then
  echo "note: building arm64 on $host_arch — this uses emulation and will be slow."
fi

echo "==> building $TAG for linux/arm64"
podman build --platform linux/arm64 -f "$REPO_ROOT/deploy/Containerfile" -t "$TAG" "$REPO_ROOT"

# A native-module image that was built for the wrong architecture fails at
# runtime with "exec format error", long after the push has succeeded. Check now.
got="$(podman image inspect "$TAG" --format '{{.Architecture}}')"
[[ "$got" == "arm64" ]] || { echo "built $got, expected arm64 — refusing to ship it"; exit 1; }
echo "    architecture: $got"

if [[ "$MODE" == "--tarball" ]]; then
  echo "==> shipping over ssh (no registry needed)"
  podman save "$TAG" | ssh "$NODE" 'microk8s ctr image import -'
  ssh "$NODE" "microk8s ctr images ls | grep meal-planner" || true
else
  echo "==> pushing to $NODE:32000"
  echo "    (the Deployment refers to localhost:32000/... — that is correct:"
  echo "     containerd resolves it on the node, where the registry is local.)"
  remote="${TAG/localhost:32000/$NODE:32000}"
  podman tag "$TAG" "$remote"
  podman push --tls-verify=false "$remote"
fi

echo "==> done"
