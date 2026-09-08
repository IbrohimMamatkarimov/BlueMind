#!/usr/bin/env bash
#
# BlueMind deploy. From a laptop:
#
#   ssh bluemind-vps bluemind-deploy
#
# or on the VPS itself:
#
#   bluemind-deploy            # deploy whatever is on origin/main
#   bluemind-deploy --no-pull  # rebuild what is already checked out
#
# bluemind-deploy is a thin wrapper in /usr/local/bin that runs this file,
# so this repo copy is the single source of truth and updates with a pull.
#
# Pulls main, reinstalls dependencies only when the lockfile moved, builds
# into a staging directory so the live site keeps serving the old build the
# whole time, and only swaps the new build in once it compiled. If the site
# fails its health check afterwards the previous build is put back and the
# service restarted, so a bad deploy self-heals instead of leaving the site
# down.
#
# The whole script is wrapped in main() so bash parses it fully before
# running anything -- git pull rewrites this file mid-deploy otherwise.

set -Eeuo pipefail

main() {
  local app_dir staging live backup lock pull=1 arg
  for arg in "$@"; do
    case "$arg" in
      --no-pull) pull=0 ;;
      -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
      *) echo "deploy: unknown option '$arg'" >&2; exit 2 ;;
    esac
  done

  app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  staging="$app_dir/.next-staging"
  live="$app_dir/.next"
  backup="$app_dir/.next-previous"
  lock="/tmp/bluemind-deploy.lock"

  cd "$app_dir"

  # Two deploys at once would fight over .next. Second one waits, briefly.
  exec 9>"$lock"
  if ! flock -w 300 9; then
    echo "deploy: another deploy is already running (waited 5 minutes)" >&2
    exit 1
  fi

  say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
  fail() { printf '\n\033[1;31mdeploy failed: %s\033[0m\n' "$*" >&2; exit 1; }

  # ---------------------------------------------------------------- pull ---
  say "Checking working tree"
  # Only TRACKED changes matter. A fast-forward pull cannot conflict with
  # untracked files, and mock folders are scp'd here before being imported,
  # so refusing on those would block every deploy after a mock upload.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no
    fail "the server has edits to files that git tracks. Deploys only
fast-forward, so resolve these by hand first (git checkout -- <file>
discards one)."
  fi

  local branch lock_before lock_after before after
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "main" ] || fail "server is on branch '$branch', expected main."

  lock_before="$(md5sum package-lock.json | cut -d' ' -f1)"
  before="$(git rev-parse HEAD)"

  if [ "$pull" = "1" ]; then
    git fetch origin main -q

    # Mocks are scp'd here to be imported, and the same files usually get
    # committed later. Git then refuses to fast-forward over its own
    # incoming files ("untracked working tree files would be overwritten").
    # Where the scp'd copy carries the same content git is about to install
    # -- including when only CRLF/LF differs, which is every scp from
    # Windows -- dropping it loses nothing, so clear it and carry on. A copy
    # that genuinely differs is real work nobody has committed: stop.
    local f a b clash=0 dropped=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      git cat-file -e "origin/main:$f" 2>/dev/null || continue   # not incoming
      a="$(git hash-object "$f")"
      b="$(git rev-parse "origin/main:$f")"
      if [ "$a" = "$b" ] \
        || diff -q <(git show "origin/main:$f") <(tr -d '\r' < "$f") >/dev/null 2>&1; then
        rm -f "$f"
        dropped=$((dropped + 1))
      else
        echo "    differs from the committed version: $f" >&2
        clash=1
      fi
    done < <(git ls-files --others --exclude-standard)

    if [ "$clash" = "1" ]; then
      fail "files on the server differ from the versions git is about to
install. Nothing was changed. Copy them somewhere safe, delete them here,
then re-run."
    fi
    [ "$dropped" -eq 0 ] || say "Dropped $dropped uploaded file(s) already committed to git"

    say "Pulling main"
    # --ff-only on purpose: the server is a read-only mirror of main. If this
    # ever refuses, someone committed on the server and that needs a human.
    git merge --ff-only origin/main || fail "server history has diverged from origin/main."
  else
    say "Skipping pull (--no-pull) -- rebuilding what is checked out"
  fi

  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    echo "Already up to date at ${after:0:7} -- nothing new to deploy."
    echo "Restarting anyway so config or .env edits take effect."
  else
    echo "Updated ${before:0:7} -> ${after:0:7}"
    git --no-pager log --oneline "$before..$after" | sed 's/^/    /'
  fi

  # --------------------------------------------------------------- deps ---
  lock_after="$(md5sum package-lock.json | cut -d' ' -f1)"
  if [ "$lock_before" != "$lock_after" ] || [ ! -d node_modules ]; then
    say "Installing dependencies (lockfile changed)"
    npm ci --no-audit --no-fund || fail "npm ci failed."
  else
    say "Dependencies unchanged -- skipping npm ci"
  fi

  # -------------------------------------------------------------- build ---
  say "Building"
  rm -rf "$staging"
  # Build somewhere else entirely: the running site keeps serving .next
  # untouched, so a compile error costs nothing.
  if ! BLUEMIND_DIST_DIR=.next-staging npm run build; then
    rm -rf "$staging"
    fail "build failed. The live site was not touched and is still serving
the previous build."
  fi

  # --------------------------------------------------------------- swap ---
  say "Swapping in the new build"
  rm -rf "$backup"
  [ -d "$live" ] && mv "$live" "$backup"
  mv "$staging" "$live"

  say "Restarting bluemind"
  systemctl restart bluemind

  # ------------------------------------------------------------- verify ---
  say "Waiting for the site to answer"
  local i code=000
  for i in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || true)"
    case "$code" in
      2??|3??) break ;;
    esac
    sleep 2
  done

  case "$code" in
    2??|3??)
      rm -rf "$backup"
      printf '\n\033[1;32m==> Deployed. bluemind.uz is serving %s (HTTP %s)\033[0m\n' "${after:0:7}" "$code"
      ;;
    *)
      printf '\n\033[1;31m==> Site did not come up (HTTP %s). Rolling back.\033[0m\n' "$code" >&2
      if [ -d "$backup" ]; then
        rm -rf "$live"
        mv "$backup" "$live"
        systemctl restart bluemind
        echo "Previous build restored and service restarted." >&2
      else
        echo "No previous build to restore." >&2
      fi
      echo "Recent service logs:" >&2
      journalctl -u bluemind -n 40 --no-pager >&2 || true
      exit 1
      ;;
  esac
}

main "$@"
