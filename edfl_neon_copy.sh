#!/usr/bin/env bash
# EDFL Test -> Neon one-time copy (session lab-neon-plan, 2026-11-22).
# Reads the Supabase TEST database and restores it into the Neon "EDFL Test" project.
# Never touches the live database. Contains no hand-written data changes:
# only pg_dump / pg_restore plus read-only guard checks.
# Needs two environment variables set by Lewis: SOURCE_DB_URL, TARGET_DB_URL.
set -uo pipefail

fail() { echo "STOPPED: $*" | sed -E 's#[^ "]*@[^ "]*#<hidden>#g'; exit 1; }

[ -n "${SOURCE_DB_URL:-}" ] || fail "SOURCE_DB_URL is not set"
[ -n "${TARGET_DB_URL:-}" ] || fail "TARGET_DB_URL is not set"

# --- Shape checks (nothing printed from the addresses) ---
for V in SOURCE_DB_URL TARGET_DB_URL; do
  U="${!V}"
  case "$U" in postgres://*|postgresql://*) ;; *) fail "$V must start with postgresql://";; esac
  AT=$(printf '%s' "$U" | tr -cd '@' | wc -c)
  [ "$AT" = "1" ] || fail "$V has $AT at-signs; it must have exactly 1. The password probably contains an at-sign. Reset it to letters and numbers only."
  case "$U" in *'['*|*']'*) fail "$V still contains [ or ]. Remove the square brackets around the password.";; esac
done

# --- Guards: right source, right target, never live ---
case "$SOURCE_DB_URL$TARGET_DB_URL" in *kghjiqfxmzbpftotkbsf*) fail "a URL points at the LIVE database";; esac
case "$SOURCE_DB_URL" in *gibyhutxggozappfwqds*) ;; *) fail "SOURCE_DB_URL is not the test database (gibyhutxggozappfwqds)";; esac
case "$TARGET_DB_URL" in *neon.tech*) ;; *) fail "TARGET_DB_URL is not a Neon address";; esac
case "$TARGET_DB_URL" in *-pooler*) fail "TARGET_DB_URL is a pooled address; use the direct one (Connection pooling off)";; esac
case "$TARGET_DB_URL" in *supabase*) fail "TARGET_DB_URL points at Supabase";; esac

# --- Postgres 17 client tools ---
SUDO="$(command -v sudo || true)"
PGBIN=/usr/lib/postgresql/17/bin
if [ ! -x "$PGBIN/pg_dump" ]; then
  echo "Installing Postgres 17 client tools..."
  $SUDO apt-get update -qq >/dev/null
  $SUDO apt-get install -y -qq curl ca-certificates gnupg lsb-release >/dev/null
  $SUDO install -d /usr/share/postgresql-common/pgdg
  $SUDO curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | $SUDO tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  $SUDO apt-get update -qq >/dev/null
  $SUDO apt-get install -y -qq postgresql-client-17 >/dev/null || fail "could not install postgresql-client-17"
fi
"$PGBIN/pg_dump" --version

# --- Read-only checks ---
SRC_NAME=$("$PGBIN/psql" "$SOURCE_DB_URL" -Atc "select current_database()" 2>&1) || fail "cannot connect to SOURCE: $(printf '%s' "$SRC_NAME" | sed -E 's/"[^"]*"/<hidden>/g')"
TGT_APP_TABLES=$("$PGBIN/psql" "$TARGET_DB_URL" -Atc "select count(*) from pg_tables where schemaname in ('public','agency','agency_sealed','agency_shadow','edfl_test')" 2>&1) || fail "cannot connect to TARGET: $(printf '%s' "$TGT_APP_TABLES" | sed -E 's/"[^"]*"/<hidden>/g')"
[ "$TGT_APP_TABLES" = "0" ] || fail "TARGET already has $TGT_APP_TABLES app tables; it must be empty"
echo "Source connected ($SRC_NAME). Target connected and empty."

# --- Dump (test database, five app schemas, schema + data) ---
WORK=$(mktemp -d)
DUMP="$WORK/edfl_test.dump"
"$PGBIN/pg_dump" "$SOURCE_DB_URL" -Fc --no-owner \
  -n public -n agency -n agency_sealed -n agency_shadow -n edfl_test \
  -f "$DUMP" 2> "$WORK/dump.log" || { tail -20 "$WORK/dump.log"; fail "pg_dump failed"; }
echo "Dump OK: $(du -h "$DUMP" | cut -f1)"

# --- Restore into Neon (keeps going past expected Supabase-only errors) ---
"$PGBIN/pg_restore" -d "$TARGET_DB_URL" --no-owner "$DUMP" 2> "$WORK/restore.log"
echo "Restore finished (exit $?)."

# --- Report: errors grouped, no connection details printed ---
echo "===== RESTORE ERROR SUMMARY ====="
grep -c "error:" "$WORK/restore.log" | sed 's/^/error lines: /'
grep -A1 "error:" "$WORK/restore.log" | grep -E "error:|Command was" \
  | sed -E 's/postgres(ql)?:\/\/[^ ]+/<url>/g' | cut -c1-220 | head -120
echo "===== COUNTS ON TARGET ====="
"$PGBIN/psql" "$TARGET_DB_URL" -Atc "select 'tables', count(*) from pg_tables where schemaname in ('public','agency','agency_sealed','agency_shadow','edfl_test') union all select 'views', count(*) from pg_views where schemaname in ('public','agency','agency_sealed','agency_shadow','edfl_test') union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','agency','agency_sealed','agency_shadow','edfl_test') union all select 'policies', count(*) from pg_policies where schemaname in ('public','agency','agency_sealed','agency_shadow','edfl_test')"
rm -rf "$WORK"
echo "DONE"
