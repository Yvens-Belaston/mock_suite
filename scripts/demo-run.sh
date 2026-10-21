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

# ================================================================ BEGIN topdesk (ticket 34)
TOPDESK_AUTH=(-u "ofelia:demo-secret")

step "TOPdesk: look up Sanne de Vries (by email)"
SANNE_PERSONS=$(api GET /tas/api/persons '' -G --data-urlencode "query=email==$GRAPH_USER_UPN" "${TOPDESK_AUTH[@]}")
pause
if [[ -z "$SANNE_PERSONS" ]]; then
  # 204 (no body): she is not in TOPdesk yet, so create her person record first.
  step "TOPdesk: create person Sanne de Vries"
  TOPDESK_SANNE_ID=$(api POST /tas/api/persons "{
  \"firstName\": \"Sanne\",
  \"surName\": \"de Vries\",
  \"email\": \"$GRAPH_USER_UPN\",
  \"networkLoginName\": \"$GRAPH_USER_UPN\",
  \"jobTitle\": \"Business Analist\",
  \"department\": { \"name\": \"Digitalisering\" },
  \"branch\": { \"name\": \"Stadhuis Amstel\" }
}" "${TOPDESK_AUTH[@]}" | json_get id)
  pause
else
  TOPDESK_SANNE_ID=$(printf '%s' "$SANNE_PERSONS" | json_get 0.id)
fi
echo "TOPdesk person Sanne de Vries: $TOPDESK_SANNE_ID"

step "TOPdesk: create laptop change"
LAPTOP_CHANGE_ID=$(api POST /tas/api/operatorChanges "{
  \"requester\": { \"id\": \"$TOPDESK_SANNE_ID\" },
  \"briefDescription\": \"Laptop uitleveren - Sanne de Vries\",
  \"request\": \"Standaard laptop klaarzetten voor indiensttreding op 2026-12-01.\",
  \"changeType\": \"simple\",
  \"category\": { \"name\": \"Werkplek\" },
  \"subcategory\": { \"name\": \"Laptop\" }
}" "${TOPDESK_AUTH[@]}" | json_get id)
echo "Laptop change: $LAPTOP_CHANGE_ID"
pause

step "TOPdesk: laptop change -> In behandeling (start)"
api POST "/tas/api/operatorChanges/$LAPTOP_CHANGE_ID/processingStatusTransitions" \
  '{"from": "simple_notStarted", "action": "start"}' "${TOPDESK_AUTH[@]}" >/dev/null
pause

step "TOPdesk: laptop change -> Afgerond (implement)"
api POST "/tas/api/operatorChanges/$LAPTOP_CHANGE_ID/processingStatusTransitions" \
  '{"from": "simple_inProgress", "action": "implement"}' "${TOPDESK_AUTH[@]}" >/dev/null
pause
# ================================================================ END topdesk

# ================================================================ BEGIN jira (ticket 35)
JIRA_AUTH=(-u "svc-ofelia@${TENANT}:demo-api-token")
JIRA_CASE_LABEL="case-1042"
NOOR_ACCOUNT="712020:5f1c2a7e-0b3d-4c1e-9a6f-1d2e3f4a5b01"
BRAM_ACCOUNT="712020:5f1c2a7e-0b3d-4c1e-9a6f-1d2e3f4a5b02"
JIRA_TRANSITION_DONE="31"

# jira_key: read a create-issue response on stdin, print its "key" (sed, so no jq needed).
jira_key() {
  local key
  key=$(sed -n 's/.*"key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [[ -z "$key" ]]; then echo 'demo-run: no issue key in response' >&2; return 1; fi
  printf '%s' "$key"
}

# jira_issue SUMMARY TEXT ACCOUNT: create an IAM task (ADF description, case label), print its key.
jira_issue() {
  api POST /rest/api/3/issue "{
  \"fields\": {
    \"project\": { \"key\": \"IAM\" },
    \"issuetype\": { \"name\": \"Task\" },
    \"summary\": \"$1\",
    \"description\": { \"type\": \"doc\", \"version\": 1, \"content\": [
      { \"type\": \"paragraph\", \"content\": [{ \"type\": \"text\", \"text\": \"$2\" }] }
    ] },
    \"assignee\": { \"accountId\": \"$3\" },
    \"labels\": [\"$JIRA_CASE_LABEL\"],
    \"duedate\": \"2026-11-27\"
  }
}" "${JIRA_AUTH[@]}" | jira_key
}

step "Jira: create SAP access issue"
SAP_ISSUE_KEY=$(jira_issue "Toegang SAP voor Sanne de Vries" \
  "Rol SAP-Raadpleger toekennen aan Sanne de Vries (indiensttreding 2026-12-01)." "$NOOR_ACCOUNT")
echo "SAP issue: $SAP_ISSUE_KEY"
pause

step "Jira: create Zaaksysteem access issue"
ZAAK_ISSUE_KEY=$(jira_issue "Zaaksysteem-account voor Sanne de Vries" \
  "Account met rol Behandelaar aanmaken voor Sanne de Vries (indiensttreding 2026-12-01)." "$BRAM_ACCOUNT")
echo "Zaaksysteem issue: $ZAAK_ISSUE_KEY"
pause

step "Jira: $SAP_ISSUE_KEY -> Done"
api POST "/rest/api/3/issue/$SAP_ISSUE_KEY/transitions" \
  "{\"transition\": {\"id\": \"$JIRA_TRANSITION_DONE\"}}" "${JIRA_AUTH[@]}"
pause
# ================================================================ END jira

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

# ---------------------------------------------------------------- offboarding: topdesk (ticket 34)
step "TOPdesk: archive person Sanne de Vries"
api PATCH "/tas/api/persons/id/$TOPDESK_SANNE_ID/archive" '' "${TOPDESK_AUTH[@]}" >/dev/null
pause
# ---------------------------------------------------------------- end offboarding: topdesk
# ================================================================ END offboarding

printf '\nDemo run complete.\n'
