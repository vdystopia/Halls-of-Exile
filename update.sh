#!/usr/bin/env bash
#
# Update the deployed archive on Linux: back up, pull, rebuild, health-check,
# roll back on failure. The Linux twin of update.ps1, written for pc2 (Ubuntu,
# Docker Engine) and usable on any Linux host running the compose project.
#
#   ./update.sh                       # the normal case
#   ./update.sh --skip-backup         # only on an instance with no data yet
#   ./update.sh --health-timeout 300  # seconds to wait for healthy (default 150)
#
# Run this instead of `docker compose up -d --build`. It refuses to run with
# uncommitted changes to tracked files, takes a consistent backup, records the
# current commit and image so a bad build can be undone, and only reports
# success once /api/health answers from inside the new container. On pc2 no
# host port is published, so the probe runs through `docker compose exec`
# rather than from the host; that works the same wherever the port is.
#
# Which compose files apply comes from COMPOSE_FILE in .env, which docker
# compose reads by itself. On pc2:
#   COMPOSE_FILE=docker-compose.yml:docker-compose.pc2.yml

set -Eeuo pipefail

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

SERVICE=halls
IMAGE=halls-of-exile
ROLLBACK_IMAGE="${IMAGE}:rollback"
SKIP_BACKUP=0
HEALTH_TIMEOUT=150

usage() { sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; }

while (($#)); do
  case "$1" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --health-timeout)
      [[ ${2:-} =~ ^[0-9]+$ ]] || { echo "--health-timeout needs a number of seconds" >&2; exit 2; }
      HEALTH_TIMEOUT=$2
      shift
      ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

if [[ -t 1 ]]; then
  CYAN=$'\e[36m' GREY=$'\e[90m' RED=$'\e[31m' RESET=$'\e[0m'
else
  CYAN='' GREY='' RED='' RESET=''
fi
step() { printf '%s==> %s%s\n' "$CYAN" "$*" "$RESET"; }
note() { printf '%s    %s%s\n' "$GREY" "$*" "$RESET"; }
bad() { printf '%s!!! %s%s\n' "$RED" "$*" "$RESET" >&2; }
die() { bad "$*"; exit 1; }

# A setting from the environment, else from .env. Only used to decide which
# checks to run; docker compose reads .env on its own.
setting() {
  local name=$1 value=${!1:-}
  if [[ -z $value && -f .env ]]; then
    value=$(sed -n "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*//p" .env | tail -n 1)
    value=${value%$'\r'}
    value=${value#[\"\']}
    value=${value%[\"\']}
  fi
  printf '%s' "$value"
}

# /api/health as seen from inside the running container. Prints the JSON and
# succeeds only when it reports status ok.
probe_health() {
  local body
  body=$(docker compose exec -T "$SERVICE" node -e \
    "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))" \
    2>/dev/null) || return 1
  [[ $body == *'"status":"ok"'* ]] || return 1
  printf '%s' "$body"
}

wait_healthy() {
  local deadline=$((SECONDS + $1)) body
  while ((SECONDS < deadline)); do
    if body=$(probe_health); then
      printf '%s' "$body"
      return 0
    fi
    sleep 3
  done
  return 1
}

field() { grep -o "\"$1\":[0-9]*" <<<"$2" | cut -d: -f2; }

rollback() {
  bad 'Update failed. Rolling back.'
  git reset --hard --quiet "$PREVIOUS_COMMIT"
  if ((HAD_IMAGE)); then
    docker tag "$ROLLBACK_IMAGE" "$IMAGE"
    # --no-build: rebuilding here would rebuild the old commit's source, not
    # restore the image that was running. --force-recreate: the tag moved, the
    # compose config did not, so compose would otherwise keep the new container.
    if docker compose up -d --no-build --force-recreate "$SERVICE" >/dev/null 2>&1 && wait_healthy 90 >/dev/null; then
      note "Restored commit ${PREVIOUS_COMMIT:0:7} and the previous image; it reports healthy."
    else
      bad "Restored commit ${PREVIOUS_COMMIT:0:7} and the previous image, but it is not reporting healthy either."
      note 'Check: docker compose ps; docker compose logs --tail 80'
    fi
  else
    docker compose down >/dev/null 2>&1 || true
    note "Restored commit ${PREVIOUS_COMMIT:0:7}. There was no previous image to restore."
  fi
}

# --- preconditions -----------------------------------------------------------
[[ -f docker-compose.yml ]] || die 'No docker-compose.yml here. Run this from the repository folder.'
command -v docker >/dev/null || die 'docker is not installed.'
command -v flock >/dev/null || die 'flock is missing (util-linux).'
docker compose version >/dev/null 2>&1 || die 'The docker compose plugin is missing: sudo apt install docker-compose-plugin'

# Only tracked changes matter: rollback resets tracked files and leaves
# untracked ones (stray backups, notes) alone.
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
  die 'There are uncommitted changes to tracked files. Commit or discard them first - this script resets the tree on failure.'
fi

# Catches a typo in .env or an override before anything is touched.
docker compose config --quiet || die 'docker compose rejected the configuration above. Nothing was changed.'

# Only one update at a time. Two concurrent runs race on the git index and on
# the compose project, and a rollback from the loser can undo the winner's
# deploy. The lock is flock(2) on an open descriptor, not a PID file, so a
# killed run leaves nothing stale: the kernel drops the lock with the process.
# backup.sh waits on the same lock, so a nightly backup never lands mid-deploy.
# The file is opened read-only, so it does not matter which user created it.
LOCK=.update.lock
[[ -e $LOCK ]] || : >"$LOCK"
exec 9<"$LOCK"
flock -n 9 || die 'An update or backup is already running. Wait for it to finish, then re-run.'

# pc2's override bind-mounts a host directory and joins an external network.
# Both have to exist before compose starts, and each fails in a confusing way
# if not, so they are checked here with the command that fixes each.
if [[ $(setting COMPOSE_FILE) == *docker-compose.pc2.yml* ]]; then
  DATA_DIR=$(setting HALLS_DATA_DIR)
  DATA_DIR=${DATA_DIR:-/srv/data/halls}
  [[ -d $DATA_DIR ]] || die "$DATA_DIR does not exist. Create it: sudo install -d -o 1000 -g 1000 -m 750 $DATA_DIR"
  owner=$(stat -c %u "$DATA_DIR")
  [[ $owner == 1000 ]] ||
    die "$DATA_DIR belongs to uid $owner, but the container runs as uid 1000. Fix: sudo chown -R 1000:1000 $DATA_DIR"
  docker network inspect proxy >/dev/null 2>&1 ||
    die "The external docker network 'proxy' does not exist. Create it (docker network create proxy) or start the reverse proxy first."
fi

PREVIOUS_COMMIT=$(git rev-parse HEAD)
HAD_IMAGE=0
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  HAD_IMAGE=1
  docker tag "$IMAGE" "$ROLLBACK_IMAGE"
fi

# --- backup ------------------------------------------------------------------
if ((SKIP_BACKUP)); then
  step 'Skipping backup (requested)'
elif [[ -z $(docker compose ps -q --status running "$SERVICE" 2>/dev/null) ]]; then
  step 'Nothing running yet, so no backup to take'
else
  step 'Backing up the archive'
  docker compose exec -T "$SERVICE" node scripts/backup.mjs /data/backups ||
    die 'Backup failed. Refusing to update. Re-run with --skip-backup only if you accept losing the current data.'
fi

# --- pull --------------------------------------------------------------------
step 'Fetching the latest code'
git pull --ff-only || die 'git pull failed. Resolve it by hand, then re-run.'
NEW_COMMIT=$(git rev-parse HEAD)
[[ $NEW_COMMIT != "$PREVIOUS_COMMIT" ]] || note 'Already up to date. Rebuilding anyway to pick up any local changes.'

# --- art ---------------------------------------------------------------------
# public/ is copied into the image, so the art on disk when the image is built
# is the art the container serves. Fetching it afterwards changes nothing until
# the next rebuild, which is exactly the trap this check exists to catch.
if command -v python3 >/dev/null; then
  art=$(python3 - <<'PY'
import json, pathlib
root = pathlib.Path(".")
index = json.loads((root / "src/lib/games/poe1/item-art-index.json").read_text(encoding="utf-8"))
paths = {entry["art"] for group in ("bases", "uniques") for entry in index.get(group, {}).values() if entry.get("art")}
wanted = len(paths)
overrides = root / "src/lib/games/poe1/art-overrides.json"
if overrides.exists():
    # An override with an empty value is a path the image CDN does not serve at
    # all (Ancient Skull's). Counting it would warn on every deploy forever.
    data = json.loads(overrides.read_text(encoding="utf-8"))
    wanted -= sum(1 for key, value in data.items() if not key.startswith("_") and not value)
have = sum(1 for _ in (root / "public/items").rglob("*.png"))
print(have, wanted)
PY
  ) || art=''
  if [[ -n $art ]]; then
    read -r have wanted <<<"$art"
    if ((have < wanted)); then
      bad "Item art is $((wanted - have)) images short of the catalogue ($have of $wanted)."
      note 'Run npm run art:fetch and deploy again; the images are baked into the image at build time.'
    else
      step "Item art is complete ($have images)"
    fi
  fi
else
  note 'python3 not found; skipping the item art count.'
fi
if [[ ! -f public/ascendancy.webp ]]; then
  bad 'The ascendancy emblem sheet is missing.'
  note 'Run npm run art:fetch and deploy again; character cards show no emblem without it.'
fi

# --- build and start ---------------------------------------------------------
step 'Building and starting the container'
if ! docker compose up -d --build "$SERVICE"; then
  rollback
  die 'Build failed. The previous version is running again.'
fi

# --- verify ------------------------------------------------------------------
step "Waiting for /api/health (up to ${HEALTH_TIMEOUT}s)"
if ! HEALTH=$(wait_healthy "$HEALTH_TIMEOUT"); then
  bad 'The new container never reported healthy. Last 40 log lines:'
  docker compose logs --tail 40 "$SERVICE" || true
  rollback
  die 'Update rolled back.'
fi

step 'Live'
note "commit     ${NEW_COMMIT:0:7}"
note "players    $(field users "$HEALTH")"
note "characters $(field characters "$HEALTH")"
note "leagues    $(field leagues "$HEALTH")"
((HAD_IMAGE)) && note "The previous image is kept as $ROLLBACK_IMAGE if you need it."
exit 0
