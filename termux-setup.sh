#!/data/data/com.termux/files/usr/bin/bash
# Run Nebula's Build mode on this phone. One time:  bash termux-setup.sh
set -e
cd "$(dirname "$0")"
echo "== Nebula on this phone =="
if ! command -v pkg >/dev/null 2>&1; then
  echo "This script is for Termux (install it from F-Droid or GitHub, not the Play Store)."; exit 1
fi
pkg update -y
FREE_MB="$(df -Pm "${PREFIX:-$HOME}" 2>/dev/null | awk 'NR==2{print $4}')"; FREE_MB="${FREE_MB:-99999}"
echo "Free space: ${FREE_MB} MB"
pkg install -y nodejs zip unzip curl openssl
if [ "$FREE_MB" -lt 1500 ]; then
  echo "Not enough free space for Python (it needs about 1 GB). Skipping it: web apps and APIs still work."
  echo "Free some space and run this script again to add Python for documents."
  WANT_PY=n
else
  read -r -p "Install Python for documents (PDF, PowerPoint, Word, Excel)? Needs about 700 MB. [Y/n] " WANT_PY
fi
case "$WANT_PY" in
  n|N) echo "Skipping Python." ;;
  *) if pkg install -y python; then pkg install -y python-numpy python-pillow poppler >/dev/null 2>&1 || true
     else echo "Python could not be installed (probably out of space). Continuing without it."; fi ;;
esac
pkg clean >/dev/null 2>&1 || true
node -v; python -V 2>/dev/null || echo "(Python not installed)"

CONF="$HOME/.nebula"; mkdir -p "$CONF"
if [ ! -f "$CONF/phone.env" ]; then
  TOKEN="$(openssl rand -hex 24)"
  read -r -p "Your web app address (for example https://my-nebula.vercel.app), or press Enter to use only http://localhost:3000: " ORIGIN
  { echo "BUILD_TOKEN=$TOKEN"; echo "BUILD_REMOTE_ORIGINS=${ORIGIN%/}"; } > "$CONF/phone.env"
  chmod 600 "$CONF/phone.env"
fi

cat > start-phone.sh <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
set -a; . "$HOME/.nebula/phone.env"; set +a
termux-wake-lock 2>/dev/null || true
export NEBULA_BUILD=1 PORT="${PORT:-3000}"
if [ -n "$BUILD_REMOTE_ORIGINS" ]; then
  export BUILD_REMOTE_UNSAFE=1
  echo
  echo "Build server address:  http://localhost:$PORT"
  echo "Build token:           $BUILD_TOKEN"
  echo "(paste both on the Build screen of $BUILD_REMOTE_ORIGINS)"
  echo
  if command -v termux-clipboard-set >/dev/null 2>&1; then printf %s "$BUILD_TOKEN" | termux-clipboard-set && echo "(token copied to the clipboard)"; fi
else
  unset BUILD_TOKEN BUILD_REMOTE_ORIGINS
  echo
  echo "Open http://localhost:$PORT in your browser and use Build mode there."
  echo
fi
exec node server.js
EOS
chmod +x start-phone.sh
echo
echo "Done. Start it any time with:  ./start-phone.sh"
