#!/usr/bin/env bash
#
# Interactive API Test Scenarios for Escape Room Booking API
# Requires: curl, jq, and a running server at localhost:3000
#
# Usage: ./scripts/test-api.sh
#

set -eo pipefail

BASE_URL="http://localhost:3000"
PASS=0
FAIL=0

# ─── Helpers ────────────────────────────────────────────────────────────────

green()  { printf "\033[32m%s\033[0m" "$1"; }
red()    { printf "\033[31m%s\033[0m" "$1"; }
yellow() { printf "\033[33m%s\033[0m" "$1"; }
bold()   { printf "\033[1m%s\033[0m" "$1"; }

header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  bold "  $1"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  $(green "PASS") $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  $(red "FAIL") $label — expected HTTP $expected, got HTTP $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local label="$1" json="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$json" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$actual" = "$expected" ]; then
    echo "  $(green "PASS") $label ($field = \"$actual\")"
    PASS=$((PASS + 1))
  else
    echo "  $(red "FAIL") $label — expected $field = \"$expected\", got \"$actual\""
    FAIL=$((FAIL + 1))
  fi
}

# Fetch N available slot IDs and store in SLOT_IDS array
fetch_available_slots() {
  local count="$1"
  local rooms_json
  rooms_json=$(curl -sf "$BASE_URL/api/rooms")
  SLOT_IDS=()
  while IFS= read -r id; do
    SLOT_IDS+=("$id")
  done < <(
    echo "$rooms_json" \
      | jq -r '[.[].timeSlots[] | select(.status == "available")] | .[0:'"$count"'] | .[].id'
  )
  if [ "${#SLOT_IDS[@]}" -lt "$count" ]; then
    echo "$(red "ERROR:") Not enough available slots (need $count, found ${#SLOT_IDS[@]})."
    echo "  Try re-seeding: npx prisma db seed"
    exit 1
  fi
}

# Make a request and capture both the HTTP status and body
# Usage: do_request METHOD URL [DATA]
#   Sets: RESP_STATUS, RESP_BODY
do_request() {
  local method="$1" url="$2" data="${3:-}"
  local tmp
  tmp=$(mktemp)
  if [ -n "$data" ]; then
    RESP_STATUS=$(curl -s -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    RESP_STATUS=$(curl -s -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url")
  fi
  RESP_BODY=$(cat "$tmp")
  rm -f "$tmp"
}

# ─── Preflight check ───────────────────────────────────────────────────────

echo ""
bold "Escape Room Booking API — Interactive Test Scenarios"
echo ""
echo "Checking server at $BASE_URL ..."
if ! curl -sf "$BASE_URL/api/rooms" > /dev/null 2>&1; then
  echo "$(red "ERROR:") Server not reachable at $BASE_URL"
  echo "  Start it with: npm run dev"
  exit 1
fi
echo "$(green "OK") Server is running."

# Grab enough available slots for all scenarios
fetch_available_slots 5
echo "$(green "OK") Found ${#SLOT_IDS[@]} available slots for testing."

# ─── Scenario 1: Happy path — hold, confirm, verify ────────────────────────

header "Scenario 1: Happy path — hold, confirm, verify"

SLOT_ID="${SLOT_IDS[0]}"
echo "  Using slot: $SLOT_ID"

# Alice creates a hold
echo ""
echo "  $(yellow "→") Alice creates a hold ..."
do_request POST "$BASE_URL/api/holds" \
  "{\"timeSlotId\": \"$SLOT_ID\", \"playerName\": \"Alice\", \"playerEmail\": \"alice@test.com\"}"
assert_status "Create hold" 201 "$RESP_STATUS"
HOLD_ID=$(echo "$RESP_BODY" | jq -r '.id')
echo "  Hold ID: $HOLD_ID"

# Alice confirms her hold
echo ""
echo "  $(yellow "→") Alice confirms her hold ..."
do_request POST "$BASE_URL/api/holds/$HOLD_ID/confirm" \
  '{"playerEmail": "alice@test.com"}'
assert_status "Confirm hold" 201 "$RESP_STATUS"

# Verify the slot now shows as "booked"
echo ""
echo "  $(yellow "→") Verifying slot status ..."
ROOMS_JSON=$(curl -sf "$BASE_URL/api/rooms")
SLOT_STATUS=$(echo "$ROOMS_JSON" | jq -r "[.[].timeSlots[] | select(.id == \"$SLOT_ID\")] | .[0].status")
if [ "$SLOT_STATUS" = "booked" ]; then
  echo "  $(green "PASS") Slot status is \"booked\""
  PASS=$((PASS + 1))
else
  echo "  $(red "FAIL") Expected slot status \"booked\", got \"$SLOT_STATUS\""
  FAIL=$((FAIL + 1))
fi

# Save this slot for Scenario 5
BOOKED_SLOT_ID="$SLOT_ID"

# ─── Scenario 2: Unauthorized confirm — wrong email ────────────────────────

header "Scenario 2: Unauthorized confirm — wrong email"

SLOT_ID="${SLOT_IDS[1]}"
echo "  Using slot: $SLOT_ID"

# Alice creates a hold
echo ""
echo "  $(yellow "→") Alice creates a hold ..."
do_request POST "$BASE_URL/api/holds" \
  "{\"timeSlotId\": \"$SLOT_ID\", \"playerName\": \"Alice\", \"playerEmail\": \"alice@test.com\"}"
assert_status "Create hold" 201 "$RESP_STATUS"
HOLD_ID=$(echo "$RESP_BODY" | jq -r '.id')

# Bob tries to confirm Alice's hold
echo ""
echo "  $(yellow "→") Bob tries to confirm Alice's hold ..."
do_request POST "$BASE_URL/api/holds/$HOLD_ID/confirm" \
  '{"playerEmail": "bob@test.com"}'
assert_status "Bob gets 403" 403 "$RESP_STATUS"

# Alice confirms her own hold (should work)
echo ""
echo "  $(yellow "→") Alice confirms her own hold ..."
do_request POST "$BASE_URL/api/holds/$HOLD_ID/confirm" \
  '{"playerEmail": "alice@test.com"}'
assert_status "Alice gets 201" 201 "$RESP_STATUS"

# ─── Scenario 3: Unauthorized delete — wrong email ─────────────────────────

header "Scenario 3: Unauthorized delete — wrong email"

SLOT_ID="${SLOT_IDS[2]}"
echo "  Using slot: $SLOT_ID"

# Alice creates a hold
echo ""
echo "  $(yellow "→") Alice creates a hold ..."
do_request POST "$BASE_URL/api/holds" \
  "{\"timeSlotId\": \"$SLOT_ID\", \"playerName\": \"Alice\", \"playerEmail\": \"alice@test.com\"}"
assert_status "Create hold" 201 "$RESP_STATUS"
HOLD_ID=$(echo "$RESP_BODY" | jq -r '.id')

# Bob tries to release Alice's hold
echo ""
echo "  $(yellow "→") Bob tries to release Alice's hold ..."
do_request DELETE "$BASE_URL/api/holds/$HOLD_ID" \
  '{"playerEmail": "bob@test.com"}'
assert_status "Bob gets 403" 403 "$RESP_STATUS"

# Alice releases her own hold
echo ""
echo "  $(yellow "→") Alice releases her own hold ..."
do_request DELETE "$BASE_URL/api/holds/$HOLD_ID" \
  '{"playerEmail": "alice@test.com"}'
assert_status "Alice gets 200" 200 "$RESP_STATUS"

# Verify slot is available again
echo ""
echo "  $(yellow "→") Verifying slot status ..."
ROOMS_JSON=$(curl -sf "$BASE_URL/api/rooms")
SLOT_STATUS=$(echo "$ROOMS_JSON" | jq -r "[.[].timeSlots[] | select(.id == \"$SLOT_ID\")] | .[0].status")
if [ "$SLOT_STATUS" = "available" ]; then
  echo "  $(green "PASS") Slot status is \"available\""
  PASS=$((PASS + 1))
else
  echo "  $(red "FAIL") Expected slot status \"available\", got \"$SLOT_STATUS\""
  FAIL=$((FAIL + 1))
fi

# ─── Scenario 4: Double-hold conflict ──────────────────────────────────────

header "Scenario 4: Double-hold conflict"

SLOT_ID="${SLOT_IDS[3]}"
echo "  Using slot: $SLOT_ID"

# Alice holds the slot
echo ""
echo "  $(yellow "→") Alice holds the slot ..."
do_request POST "$BASE_URL/api/holds" \
  "{\"timeSlotId\": \"$SLOT_ID\", \"playerName\": \"Alice\", \"playerEmail\": \"alice@test.com\"}"
assert_status "Alice gets 201" 201 "$RESP_STATUS"

# Bob tries to hold the same slot
echo ""
echo "  $(yellow "→") Bob tries to hold the same slot ..."
do_request POST "$BASE_URL/api/holds" \
  "{\"timeSlotId\": \"$SLOT_ID\", \"playerName\": \"Bob\", \"playerEmail\": \"bob@test.com\"}"
assert_status "Bob gets 409" 409 "$RESP_STATUS"
assert_json_field "Conflict message" "$RESP_BODY" '.error' "Time slot is already held"

# ─── Scenario 5: Hold after booking — slot is locked ───────────────────────

header "Scenario 5: Hold after booking — slot is locked"

echo "  Using booked slot from Scenario 1: $BOOKED_SLOT_ID"

echo ""
echo "  $(yellow "→") Bob tries to hold a booked slot ..."
do_request POST "$BASE_URL/api/holds" \
  "{\"timeSlotId\": \"$BOOKED_SLOT_ID\", \"playerName\": \"Bob\", \"playerEmail\": \"bob@test.com\"}"
assert_status "Bob gets 409" 409 "$RESP_STATUS"
assert_json_field "Booked message" "$RESP_BODY" '.error' "Time slot is already booked"

# ─── Scenario 6: Missing fields / bad requests ─────────────────────────────

header "Scenario 6: Missing fields / bad requests"

# Missing playerEmail on confirm
echo ""
echo "  $(yellow "→") Missing playerEmail on confirm ..."
do_request POST "$BASE_URL/api/holds/fake-id/confirm" ""
assert_status "Missing email → 400" 400 "$RESP_STATUS"
assert_json_field "Error message" "$RESP_BODY" '.error' "playerEmail is required"

# Missing required fields on hold creation
echo ""
echo "  $(yellow "→") Missing required fields on hold creation ..."
do_request POST "$BASE_URL/api/holds" '{"timeSlotId": "something"}'
assert_status "Missing fields → 400" 400 "$RESP_STATUS"

# Non-existent hold
echo ""
echo "  $(yellow "→") Confirm non-existent hold ..."
do_request POST "$BASE_URL/api/holds/nonexistent/confirm" \
  '{"playerEmail": "alice@test.com"}'
assert_status "Not found → 404" 404 "$RESP_STATUS"
assert_json_field "Not found message" "$RESP_BODY" '.error' "Hold not found"

# Non-existent time slot for hold creation
echo ""
echo "  $(yellow "→") Hold non-existent time slot ..."
do_request POST "$BASE_URL/api/holds" \
  '{"timeSlotId": "nonexistent", "playerName": "Alice", "playerEmail": "alice@test.com"}'
assert_status "Not found → 404" 404 "$RESP_STATUS"

# Missing playerEmail on delete
echo ""
echo "  $(yellow "→") Missing playerEmail on delete ..."
do_request DELETE "$BASE_URL/api/holds/fake-id" ""
assert_status "Missing email on delete → 400" 400 "$RESP_STATUS"

# ─── Summary ───────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bold "  Results"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  $(green "PASSED:") $PASS"
echo "  $(red "FAILED:") $FAIL"
echo "  Total:  $((PASS + FAIL))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  $(red "Some tests failed!")"
  exit 1
else
  echo "  $(green "All tests passed!")"
  exit 0
fi
