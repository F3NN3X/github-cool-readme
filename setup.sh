#!/usr/bin/env bash
# Wires github-cool-readme into your profile repo (<you>/<you>): token secret, workflow, settings,
# first run, README. Run it again to change settings; it asks before changing anything.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/pedrocatalao/github-cool-readme/v1/setup.sh)
#
# Options: --dry-run  show what would happen, change nothing
# Needs: gh (logged in) and git. Works with the bash that ships with macOS.

set -euo pipefail

TOOL_REPO="pedrocatalao/github-cool-readme"
REF="${COOL_README_REF:-v1}"   # the version of the action the workflow uses
WORKFLOW=".github/workflows/cool-readme.yml"
CONFIG="cool-readme.yml"
OUT="stats"
SECRET="CARDS_TOKEN"
START="<!-- cool-readme:start -->"
END="<!-- cool-readme:end -->"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) echo "Usage: setup.sh [--dry-run]  (sets up README cards in your profile repo)"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ------------------------------------------------------------------ output and keys

# Questions are read from the terminal, so this also works when the script comes from a pipe.
# Without a terminal, every question takes its default.
HAVE_TTY=false
if (: < /dev/tty) 2>/dev/null; then HAVE_TTY=true; fi
COLOUR=false
[ -t 1 ] && COLOUR=true
FANCY=false # redraws in place and live timers need both
$HAVE_TTY && $COLOUR && FANCY=true

# The cursor is hidden while the guide runs, shown where you type a line, and always given back:
# on success, on an error, and on Ctrl-C.
cursor() { if $FANCY; then if [ "$1" = on ]; then printf '\033[?25h'; else printf '\033[?25l'; fi; fi; }
WORK=""
cleanup() { cursor on; [ -z "$WORK" ] || rm -rf "$WORK"; }
trap cleanup EXIT
trap 'echo; exit 130' INT TERM
cursor off

INDENT="            " # under the status column
paint() { if $COLOUR; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi; }
section() { printf '\n%s\n' "$(paint 1 "$1")"; }
note() { printf '%s%s\n' "$INDENT" "$*"; }
report() { # report status text: green for done, yellow for skipped, red for what needs you
  local status
  status="$(printf '%-9s' "$1")"
  case "$1" in
    ok | added | set | updated | created | stored | started | generated | pushed) status="$(paint 32 "$status")" ;;
    skipped | kept | "dry run") status="$(paint 33 "$status")" ;;
    missing | failed | old | differs) status="$(paint 31 "$status")" ;;
  esac
  printf '  %s %s\n' "$status" "$2"
}
framed() { # framed colour line...: the lines in a box
  local tone="$1" text width=0 line
  shift
  for text in "$@"; do [ "${#text}" -gt "$width" ] && width="${#text}"; done
  line="$(printf '%*s' $((width + 2)) '' | sed 's/ /─/g')"
  echo
  paint "$tone" "┌${line}┐"; echo
  for text in "$@"; do paint "$tone" "$(printf '│ %-*s │' "$width" "$text")"; echo; done
  paint "$tone" "└${line}┘"; echo
}
die() { # die what [what to do]: a red line, a hint, and stop
  report failed "$1"
  [ -z "${2:-}" ] || note "$2"
  framed 31 "Stopped: nothing after this step was changed."
  exit 1
}
beep() { if $HAVE_TTY; then printf '\a' > /dev/tty; fi; }

yesno() { # yesno "Question" default(y|n) [d]: one key, no Enter. Returns 0 yes, 1 no, 2 show the diff (with d).
  local question="$1" def="$2" hint key answer
  if [ "$def" = y ]; then hint="Y/n"; else hint="y/N"; fi
  [ -z "${3:-}" ] || hint="$hint, d: show the changes"
  if ! $HAVE_TTY; then
    answer=no; [ "$def" = y ] && answer=yes
    printf '%s%s  [%s]  %s\n' "$INDENT" "$question" "$hint" "$(paint 2 "$answer (no terminal)")"
    [ "$def" = y ]
    return
  fi
  printf '%s%s  %s  ' "$INDENT" "$question" "$(paint 2 "[$hint]")"
  while :; do
    IFS= read -rsn1 key < /dev/tty || key=""
    case "$key" in
      y | Y) answer=yes; break ;;
      n | N) answer=no; break ;;
      '') answer=no; [ "$def" = y ] && answer=yes; break ;;
      d | D) [ -n "${3:-}" ] && { answer=diff; break; } ;;
    esac
  done
  if [ "$answer" = diff ]; then echo; else paint 1 "$answer"; echo; fi
  case "$answer" in yes) return 0 ;; no) return 1 ;; *) return 2 ;; esac
}

run() { # run a command that changes something, or just say so in a dry run
  if $DRY_RUN; then report "dry run" "would run: $*"; else "$@"; fi
}

# ------------------------------------------------------------------ settings in cool-readme.yml

# A top-level key, or "parent.child" one level down.
yaml_get() { # yaml_get file key -> value, empty if not set
  awk -v key="$2" '
    BEGIN { n = split(key, k, ".") }
    n == 1 && $0 ~ "^" k[1] ":" { sub("^" k[1] ":[[:space:]]*", ""); sub("[[:space:]]*#.*$", ""); print; exit }
    n == 2 && /^[^[:space:]#]/ { in_parent = ($0 ~ "^" k[1] ":") }
    n == 2 && in_parent && $0 ~ "^[[:space:]]+" k[2] ":" { sub("^[[:space:]]+" k[2] ":[[:space:]]*", ""); sub("[[:space:]]*#.*$", ""); print; exit }
  ' "$1"
}

yaml_set() { # yaml_set file key value: changes only that line, adding it if missing
  local tmp
  tmp="$(mktemp)"
  awk -v key="$2" -v value="$3" '
    BEGIN { n = split(key, k, "."); done = 0 }
    n == 1 && !done && $0 ~ "^" k[1] ":" { print k[1] ": " value; done = 1; next }
    n == 2 && /^[^[:space:]#]/ {
      if (in_parent && !done) { print "  " k[2] ": " value; done = 1 } # the parent block ended without it
      in_parent = ($0 ~ "^" k[1] ":")
    }
    n == 2 && in_parent && !done && $0 ~ "^[[:space:]]+" k[2] ":" {
      match($0, /^[[:space:]]+/); print substr($0, 1, RLENGTH) k[2] ": " value; done = 1; next
    }
    { print }
    END {
      if (done) exit
      if (n == 1) print k[1] ": " value
      else if (in_parent) print "  " k[2] ": " value
      else { print k[1] ":"; print "  " k[2] ": " value }
    }' "$1" > "$tmp" && mv "$tmp" "$1"
}

# The settings screen: one row per setting; its number cycles the value, Enter continues.
# Values are kept in S_STYLE, S_COLOR, S_MATRIX, S_TRANSPARENT, S_PRIVATE, S_ORGS.
ROWS="style color matrix transparent private orgs"
row_name() { case "$1" in style) echo style ;; color) echo colour ;; matrix) echo dots ;; transparent) echo background ;; private) echo "private repos" ;; orgs) echo "org repos" ;; esac; }
row_values() { case "$1" in style) echo "classic oled" ;; color) echo "amber green theme" ;; transparent) echo "false true" ;; *) echo "true false" ;; esac; }
row_label() { # row_label row value: what the value is called on screen
  case "$1:$2" in
    matrix:true) echo round ;; matrix:false) echo square ;;
    transparent:false) echo panel ;; transparent:true) echo transparent ;;
    private:true | orgs:true) echo counted ;; private:false | orgs:false) echo "not counted" ;;
    *) echo "$2" ;;
  esac
}
get_row() { case "$1" in style) echo "$S_STYLE" ;; color) echo "$S_COLOR" ;; matrix) echo "$S_MATRIX" ;; transparent) echo "$S_TRANSPARENT" ;; private) echo "$S_PRIVATE" ;; orgs) echo "$S_ORGS" ;; esac; }
set_row() { case "$1" in style) S_STYLE="$2" ;; color) S_COLOR="$2" ;; matrix) S_MATRIX="$2" ;; transparent) S_TRANSPARENT="$2" ;; private) S_PRIVATE="$2" ;; orgs) S_ORGS="$2" ;; esac; }
cycle_row() { # the next value of a row, wrapping around
  local cur next="" first="" v found=false
  cur="$(get_row "$1")"
  for v in $(row_values "$1"); do
    [ -n "$first" ] || first="$v"
    if $found; then next="$v"; break; fi
    [ "$v" = "$cur" ] && found=true
  done
  set_row "$1" "${next:-$first}"
}
draw_settings() { # one line per setting, then the hint
  local n=1 row v line label oled_only
  for row in $ROWS; do
    oled_only=false
    case "$row" in color | matrix | transparent) [ "$S_STYLE" = oled ] || oled_only=true ;; esac
    line=""
    for v in $(row_values "$row"); do
      label="$(row_label "$row" "$v")"
      if [ "$v" = "$(get_row "$row")" ]; then
        if $oled_only; then line="$line  $(paint 1 "$label")"; else line="$line  $(paint '1;32' "$label")"; fi
      else
        line="$line  $(paint 2 "$label")"
      fi
    done
    $oled_only && line="$line  $(paint 2 '(oled only)')"
    printf '\r\033[K    %s  %s%s\n' "$(paint 1 "$n")" "$(printf '%-13s' "$(row_name "$row")")" "$line"
    n=$((n + 1))
  done
  printf '\r\033[K%s%s\n' "$INDENT" "$(paint 2 'press 1-6 to change, Enter to continue')"
}
settings_screen() {
  local key row n
  if ! $FANCY; then
    for row in $ROWS; do note "$(printf '%-13s %s' "$(row_name "$row")" "$(row_label "$row" "$(get_row "$row")")")"; done
    return
  fi
  draw_settings
  while :; do
    IFS= read -rsn1 key < /dev/tty || break
    [ -n "$key" ] || break
    n=1
    for row in $ROWS; do
      [ "$key" = "$n" ] && cycle_row "$row"
      n=$((n + 1))
    done
    printf '\033[7A'
    draw_settings
  done
}

# ------------------------------------------------------------------ prerequisites

section "github-cool-readme setup"
$DRY_RUN && note "$(paint 33 'dry run: nothing will be changed')"

command -v gh >/dev/null || die "the GitHub CLI (gh) is not installed" "install it from https://cli.github.com"
command -v git >/dev/null || die "git is not installed"
gh auth status >/dev/null 2>&1 || die "gh is not logged in" "run: gh auth login"
LOGIN="$(gh api user --jq .login)"
PROFILE="$LOGIN/$LOGIN"
report ok "gh, logged in as $LOGIN"

# Pushing a workflow file over HTTPS needs the "workflow" scope; over SSH it doesn't.
PROTOCOL="$(gh config get git_protocol -h github.com 2>/dev/null || echo https)"
if [ "$PROTOCOL" = ssh ]; then
  report ok "git, over SSH"
else
  SCOPES="$(gh api -i user 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}')"
  case ", $SCOPES," in
    *", workflow,"*) report ok "git, over HTTPS with the workflow scope" ;;
    *)
      if [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
        die "gh uses GH_TOKEN/GITHUB_TOKEN, which lacks the \"workflow\" scope needed to add a workflow" \
          "unset it to use your gh login, or use a token with that scope"
      fi
      report missing "the \"workflow\" scope on your gh login, needed to add a workflow over HTTPS"
      yesno "Grant it now? (opens the browser)" y || die "cannot add the workflow without it"
      cursor on; gh auth refresh -h github.com -s workflow; cursor off
      report added "the workflow scope"
      ;;
  esac
fi

# ------------------------------------------------------------------ profile repo

section "Profile repo"
if gh repo view "$PROFILE" >/dev/null 2>&1; then
  report ok "$PROFILE"
else
  report missing "$PROFILE: its README is what GitHub shows on your profile page"
  yesno "Create it as a public repo?" y || die "nothing to set up without a profile repo"
  run gh repo create "$PROFILE" --public --add-readme --description "My GitHub profile"
  if $DRY_RUN; then framed 33 "Dry run: stopping here, the rest needs the repo to exist."; exit 0; fi
  report created "$PROFILE"
fi

# ------------------------------------------------------------------ token

section "Token"
set_token=true
if gh secret list -R "$PROFILE" 2>/dev/null | awk '{print $1}' | grep -qx "$SECRET"; then
  report ok "$SECRET is set (it needs the repo, read:org and read:user scopes)"
  yesno "Replace it?" n || set_token=false
else
  report missing "$SECRET: a classic token with the repo, read:org and read:user scopes"
  note "it lets the cards count your private and organization work"
fi
if $set_token && $DRY_RUN; then
  report "dry run" "would ask for a token and store it as $SECRET"
elif $set_token; then
  $HAVE_TTY || die "pasting the token needs a terminal" "run this script in one"
  url="https://github.com/settings/tokens/new?scopes=repo,read:org,read:user&description=README%20cards%20($PROFILE)"
  note "Create one here; the scopes are filled in, pick an expiry, then Generate token:"
  note "$(paint 4 "$url")"
  if command -v open >/dev/null; then open "$url"; elif command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1 || true; fi
  while :; do
    printf '%s%s ' "$INDENT" "Paste the token (hidden), then Enter:"
    cursor on; IFS= read -r -s TOKEN < /dev/tty; cursor off; echo
    [ -n "$TOKEN" ] || continue
    headers="$(curl -sS -o /dev/null -D - -H "Authorization: token $TOKEN" https://api.github.com/user | tr -d '\r')"
    status="$(printf '%s\n' "$headers" | awk 'NR==1{print $2}')"
    scopes="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}')"
    if [ "$status" != 200 ]; then report failed "GitHub rejected that token (HTTP $status); try again"; continue; fi
    case "$TOKEN" in
      github_pat_*)
        report differs "that's a fine-grained token; only classic ones are tested, organization work may be missed"
        yesno "Use it anyway?" n || continue ;;
      *)
        case ", $scopes," in
          *", repo,"*) ;;
          *) report missing "the repo scope (the token has: ${scopes:-none}); try again"; continue ;;
        esac
        case ", $scopes," in
          *", read:user,"*|*", user,"*) ;;
          *) report missing "the read:user scope; without it GitHub hides your private work; try again"; continue ;;
        esac
        case ", $scopes," in
          *", read:org,"*|*", admin:org,"*|*", write:org,"*) ;;
          *) report missing "the read:org scope; organization work may be missed"; yesno "Use it anyway?" n || continue ;;
        esac ;;
    esac
    break
  done
  printf '%s' "$TOKEN" | gh secret set "$SECRET" -R "$PROFILE"
  unset TOKEN
  report stored "the token as $SECRET"
fi

# ------------------------------------------------------------------ settings and workflow

WORK="$(mktemp -d)"
gh repo clone "$PROFILE" "$WORK/repo" -- --quiet --depth 1
cd "$WORK/repo"

section "Settings"
if [ -f "$CONFIG" ]; then
  cur_private="$(yaml_get "$CONFIG" include.private)"; cur_orgs="$(yaml_get "$CONFIG" include.orgs)"
  cur_style="$(yaml_get "$CONFIG" style)"; cur_color="$(yaml_get "$CONFIG" color)"; cur_matrix="$(yaml_get "$CONFIG" matrix)"
  cur_transparent="$(yaml_get "$CONFIG" transparent)"
else
  cur_private=""; cur_orgs=""; cur_style=""; cur_color=""; cur_matrix=""; cur_transparent=""
fi
S_PRIVATE="${cur_private:-true}"; S_ORGS="${cur_orgs:-true}"; S_STYLE="${cur_style:-classic}"
S_COLOR="${cur_color:-amber}"; S_MATRIX="${cur_matrix:-true}"; S_TRANSPARENT="${cur_transparent:-false}"
settings_screen

changes=""
change() { # change key current new label: write the setting if it changed, and note it
  if [ "$3" != "$2" ]; then
    yaml_set "$CONFIG" "$1" "$3"
    changes="${changes:+$changes, }$4: $(row_label "${1#include.}" "$3")"
  fi
}
if [ -f "$CONFIG" ]; then
  change include.private "${cur_private:-true}" "$S_PRIVATE" "private repos"
  change include.orgs "${cur_orgs:-true}" "$S_ORGS" "org repos"
  change style "${cur_style:-classic}" "$S_STYLE" style
  change color "${cur_color:-amber}" "$S_COLOR" colour
  change matrix "${cur_matrix:-true}" "$S_MATRIX" dots
  change transparent "${cur_transparent:-false}" "$S_TRANSPARENT" background
  if [ -n "$changes" ]; then report updated "$changes"; else report ok "$CONFIG unchanged"; fi
else
  {
    echo "# Settings: https://github.com/$TOOL_REPO#settings"
    echo "user: $LOGIN"
    echo "style: $S_STYLE"
    if [ "$S_STYLE" = oled ]; then echo "color: $S_COLOR"; echo "matrix: $S_MATRIX"; echo "transparent: $S_TRANSPARENT"; fi
    echo "include:"
    echo "  private: $S_PRIVATE"
    echo "  orgs: $S_ORGS"
  } > "$CONFIG"
  report added "$CONFIG"
fi
note "$(paint 2 "more settings (languages, titles, ...): edit $CONFIG; see github.com/$TOOL_REPO#settings")"
# OLED cards are all one size, shown 400 wide; classic ones are a wide and a narrow card per row.
if grep -Eq '^style:[[:space:]]*oled' "$CONFIG"; then WIDE=400; NARROW=400; else WIDE=450; NARROW=350; fi

section "Workflow"
wanted="$(mktemp)"
gh api "repos/$TOOL_REPO/contents/examples/profile-workflow.yml?ref=$REF" -H "Accept: application/vnd.github.raw" \
  | sed "s#$TOOL_REPO@[A-Za-z0-9._-]*#$TOOL_REPO@$REF#" > "$wanted"
mkdir -p "$(dirname "$WORKFLOW")"
NEW_SETUP=false
if [ ! -f "$WORKFLOW" ]; then
  NEW_SETUP=true
  cp "$wanted" "$WORKFLOW"
  report added "$WORKFLOW, on $REF: runs daily, and on demand"
elif cmp -s "$wanted" "$WORKFLOW"; then
  report ok "$WORKFLOW, on $REF"
else
  report differs "$WORKFLOW differs from the template for $REF"
  if yesno "Update it?" y; then cp "$wanted" "$WORKFLOW"; report updated "$WORKFLOW, on $REF"; else report kept "your $WORKFLOW"; fi
fi

WAITED=false
commit_and_push() { # commit_and_push "message": asks first; d shows exactly what would be committed
  local answer
  git add -A
  git diff --cached --quiet && return 1
  if $DRY_RUN; then
    git --no-pager diff --cached --stat | sed "s/^/$INDENT/"
    git --no-pager diff --cached
    report "dry run" "would commit \"$1\" and push"
    git commit --quiet -m "$1" # only in the throwaway clone, so the next step shows just its own changes
    return 0
  fi
  # After the long wait for the first run, beep so the question doesn't go unnoticed.
  $WAITED && beep
  while :; do
    answer=0
    yesno "Commit \"$1\" and push?" y d || answer=$?
    [ "$answer" = 2 ] || break
    git --no-pager -c color.ui="$($COLOUR && echo always || echo never)" diff --cached
  done
  [ "$answer" = 0 ] || die "nothing was pushed" "run this again when you're ready"
  git commit --quiet -m "$1"
  git push --quiet
  report pushed "$1"
}
if $NEW_SETUP; then msg="Add README cards workflow"; else msg="Update README cards workflow and settings"; fi
commit_and_push "$msg" || true

# ------------------------------------------------------------------ first run

section "First run"
wait_with_timer() { # wait_with_timer pid label: a spinner and the time taken, until pid ends; its exit status
  local pid="$1" start="$SECONDS" i=0 s
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  if $FANCY; then
    while kill -0 "$pid" 2>/dev/null; do
      s=$((SECONDS - start))
      printf '\r  %s %s %d:%02d\033[K' "$(paint 36 "${frames[$((i % 10))]}")" "$2" $((s / 60)) $((s % 60))
      i=$((i + 1))
      sleep 0.2
    done
    printf '\r\033[K'
  fi
  wait "$pid"
}
if $DRY_RUN; then
  report "dry run" "would run the workflow and wait for the cards"
else
  wf="$(basename "$WORKFLOW")"
  runs() { gh run list -R "$PROFILE" -w "$wf" -L 20 --json databaseId --jq '.[].databaseId' 2>/dev/null || true; }
  before="$(runs)" # earlier runs, so the one started below can be told apart from them
  start_run() {
    # GitHub needs a moment to register a new workflow before it can be started; the run, to show up.
    local id
    for _ in 1 2 3 4 5 6; do gh workflow run "$wf" -R "$PROFILE" >/dev/null 2>&1 && break; sleep 5; done
    for _ in $(seq 1 20); do
      sleep 3
      for id in $(runs); do printf '%s\n' "$before" | grep -qx "$id" || { echo "$id" > "$WORK/run"; return 0; }; done
    done
    return 1
  }
  start_run & pid=$!
  wait_with_timer "$pid" "starting the workflow" \
    || die "the workflow didn't start" "start it from the Actions tab of $PROFILE"
  run_id="$(cat "$WORK/run")"
  report started "the workflow"
  gh run watch "$run_id" -R "$PROFILE" --exit-status >/dev/null 2>&1 & pid=$!
  wait_with_timer "$pid" "generating the cards, usually 1-3 minutes" \
    || die "the workflow failed" "see: gh run view $run_id -R $PROFILE --log-failed"
  git pull --quiet
  report generated "the cards, in $OUT/"
  WAITED=true
fi

# ------------------------------------------------------------------ README

section "README"
picture() { # picture card width alt
  printf '<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="%s/%s-dark.svg">\n  <img src="%s/%s-light.svg" width="%s" alt="%s">\n</picture>\n' \
    "$OUT" "$1" "$OUT" "$1" "$2" "$3"
}
block="$(mktemp)"
{
  echo "$START"
  echo '<p align="center">'
  picture summary "$WIDE" "GitHub stats"
  picture languages "$NARROW" "Most used languages"
  echo '</p>'
  echo '<p align="center">'
  picture contributions "$WIDE" "Notable contributions"
  picture weekly "$NARROW" "Weekly rhythm"
  echo '</p>'
  echo "$END"
} > "$block"

touch README.md
if grep -qF "$START" README.md && grep -qF "$END" README.md; then
  # Replace only what's between the markers.
  awk -v start="$START" -v end="$END" -v block="$block" '
    $0 == start { while ((getline line < block) > 0) print line; skip = 1; next }
    $0 == end { skip = 0; next }
    !skip { print }' README.md > README.md.new
  mv README.md.new README.md
  where="between the cool-readme markers"
else
  { [ -s README.md ] && echo; cat "$block"; } >> README.md
  where="at the end; move the marked block wherever you like"
fi
if git diff --quiet README.md; then
  report ok "the cards $where"
else
  report updated "the cards $where, ${WIDE} and ${NARROW} wide"
fi
if grep -q 'github-readme-stats' README.md; then
  note "$(paint 33 'README.md still has github-readme-stats images; remove them if these cards replace them')"
fi
commit_and_push "Show README cards" || true

# ------------------------------------------------------------------ done

if $DRY_RUN; then
  framed 33 "Dry run: nothing was changed."
else
  framed 32 "Done: https://github.com/$LOGIN" \
    "The cards update daily; run this again to change the settings." \
    "To refresh now: gh workflow run $(basename "$WORKFLOW") -R $PROFILE"
fi
