set -eu

PACKAGE="$1"
mytitle="Doki Doki Mod Manager Updater"
bold=$(tput bold)
normal=$(tput sgr0)

echo -e '\033]2;'$mytitle'\007'
clear
echo "${bold}Doki Doki Mod Manager Updater"
echo "By BKunzite"
echo "${normal}"
echo "Update Package"
echo "$PACKAGE"
echo ""

case "$PACKAGE" in
  *.deb)
    echo "Using Debian-Based Updater"
    echo "${bold}SUDO WILL BE REQUIRED TO UPDATE${normal}"
    sleep 3
    clear
    pkexec apt install -y "$PACKAGE"
    sleep 1
    clear
    dpkg -s kunzite-doki-doki-mod-manager
    ;;
  *.rpm)
    echo "RPM Updater Is Untested - You May Have To Manually Download The Update From GitHub"
    sleep 3
    if command -v dnf >/dev/null 2>&1; then
      pkexec /usr/bin/dnf install -y "$PACKAGE"
    elif command -v zypper >/dev/null 2>&1; then
      pkexec /usr/bin/zypper --non-interactive install "$PACKAGE"
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

echo "${bold}Update Success! Launching...${normal} (5s)"
sleep 5
cd ~/
/usr/bin/dokimodmanager &