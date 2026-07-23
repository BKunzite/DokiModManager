sleep 3
set -euo pipefail

PACKAGE="$1"

case "$PACKAGE" in
  /home/*/.cache/dokimodmanager/*.deb)
    exec /usr/bin/apt install -y "$PACKAGE"
    ;;
  /home/*/.cache/dokimodmanager/*.rpm)
    if command -v dnf >/dev/null 2>&1; then
      exec /usr/bin/dnf install -y "$PACKAGE"
    elif command -v zypper >/dev/null 2>&1; then
      exec /usr/bin/zypper --non-interactive install "$PACKAGE"
    else
      echo "No supported RPM package manager found." >&2
      exit 1
    fi
    ;;
  *)
    echo "Refusing invalid update-package path." >&2
    exit 1
    ;;
esac