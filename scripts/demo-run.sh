#!/usr/bin/env bash
# Replays the demo sequence (spec section 9) against the mock suite with curl, so a presenter
# can rehearse without Bonita. Run the server with BONITA_ENABLED=false and keep the screens open.
#
#   BASE   mock-suite base URL (default http://localhost:8090)
#   PAUSE  seconds to wait after each call, so people can watch the screens (default 2)
#
# Any failing call (non-2xx, connection refused) stops the script with a non-zero exit.
# Layout: helpers, then one delimited section per system (BEGIN/END markers), then the
# `offboarding` section last. Later steps add their own section before `offboarding` and
# their own block inside it.
set -euo pipefail

BASE="${BASE:-http://localhost:8090}"
PAUSE="${PAUSE:-2}"
TENANT="demo-amsterdam.onmicrosoft.com"

# ---------------------------------------------------------------- helpers

# step "text": announce the next call.
step() { printf '\n==> %s\n' "$1"; }

# pause: give the audience time to see the effect on screen.
pause() { sleep "$PAUSE"; }

# api METHOD PATH [JSON] [curl args...]: JSON call against $BASE, prints the response body.
api() {
  local method="$1" path="$2" body="${3:-}"
  shift $(( $# < 3 ? $# : 3 ))
  local args=(-fsS -X "$method" "$BASE$path" -H 'Accept: application/json' "$@")
  if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' --data "$body"); fi
  curl "${args[@]}"
}

# json_get FIELD: read JSON on stdin, print a top-level (or dotted, e.g. a.b) field.
json_get() {
  node -e '
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      const v = process.argv[1].split(".").reduce((o, k) => (o == null ? o : o[k]), JSON.parse(s));
      if (v == null) { console.error(`demo-run: field ${process.argv[1]} missing`); process.exit(1); }
      process.stdout.write(String(v));
    });' "$1"
}

# ================================================================ BEGIN entra (ticket 33)
GRAPH_USER_UPN="sanne.devries@${TENANT}"
PIETER_ID="7d2f0c1a-0001-4b6e-9c3d-000000000001"
GROUP_DIGITALISERING="5a8e3b9d-0001-4c2f-8e1a-000000000001"
GROUP_VPN="5a8e3b9d-0005-4c2f-8e1a-000000000005"
SKU_M365_E3="05e9a617-0261-4cee-bb44-138d3ef5d965"

step "Entra: token (client credentials)"
TOKEN=$(curl -fsS -X POST "$BASE/$TENANT/oauth2/v2.0/token" \
  --data-urlencode grant_type=client_credentials \
  --data-urlencode client_id=ofelia-demo \
  --data-urlencode client_secret=demo-secret \
  --data-urlencode scope=https://graph.microsoft.com/.default | json_get access_token)
GRAPH_AUTH=(-H "Authorization: Bearer $TOKEN")
pause

step "Entra: create Sanne de Vries"
SANNE_ID=$(api POST /v1.0/users "{
  \"accountEnabled\": true,
  \"displayName\": \"Sanne de Vries\",
  \"givenName\": \"Sanne\",
  \"surname\": \"de Vries\",
  \"mailNickname\": \"sanne.devries\",
  \"userPrincipalName\": \"$GRAPH_USER_UPN\",
  \"jobTitle\": \"Business Analist\",
  \"department\": \"Digitalisering\",
  \"employeeHireDate\": \"2026-12-01T00:00:00Z\",
  \"usageLocation\": \"NL\",
  \"passwordProfile\": { \"forceChangePasswordNextSignIn\": true, \"password\": \"Welkom-2026!\" }
}" "${GRAPH_AUTH[@]}" | json_get id)
echo "Sanne de Vries: $SANNE_ID"
pause

step "Entra: manager -> Pieter Bakker"
api PUT "/v1.0/users/$SANNE_ID/manager/\$ref" \
  "{\"@odata.id\": \"https://graph.microsoft.com/v1.0/users/$PIETER_ID\"}" "${GRAPH_AUTH[@]}"
pause

step "Entra: add to GG-Digitalisering"
api POST "/v1.0/groups/$GROUP_DIGITALISERING/members/\$ref" \
  "{\"@odata.id\": \"https://graph.microsoft.com/v1.0/directoryObjects/$SANNE_ID\"}" "${GRAPH_AUTH[@]}"
pause

step "Entra: add to GG-VPN-Gebruikers"
api POST "/v1.0/groups/$GROUP_VPN/members/\$ref" \
  "{\"@odata.id\": \"https://graph.microsoft.com/v1.0/directoryObjects/$SANNE_ID\"}" "${GRAPH_AUTH[@]}"
pause

step "Entra: assign licence M365_E3"
api POST "/v1.0/users/$SANNE_ID/assignLicense" \
  "{\"addLicenses\": [{\"skuId\": \"$SKU_M365_E3\"}], \"removeLicenses\": []}" "${GRAPH_AUTH[@]}" >/dev/null
pause
# ================================================================ END entra

# (tickets 34-36: BEGIN/END topdesk, jira and teams sections go here, in that order)

# ================================================================ BEGIN offboarding
printf '\n######## offboarding ########\n'

# ---------------------------------------------------------------- offboarding: entra (ticket 33)
step "Entra: disable Sanne de Vries"
api PATCH "/v1.0/users/$SANNE_ID" '{"accountEnabled": false}' "${GRAPH_AUTH[@]}"
pause

step "Entra: revoke sign-in sessions"
api POST "/v1.0/users/$SANNE_ID/revokeSignInSessions" '' "${GRAPH_AUTH[@]}" >/dev/null
pause

step "Entra: remove from GG-VPN-Gebruikers"
api DELETE "/v1.0/groups/$GROUP_VPN/members/$SANNE_ID/\$ref" '' "${GRAPH_AUTH[@]}"
pause
# ---------------------------------------------------------------- end offboarding: entra

# (ticket 34: `offboarding: topdesk` block (PATCH person archive) goes here)
# ================================================================ END offboarding

printf '\nDemo run complete.\n'
