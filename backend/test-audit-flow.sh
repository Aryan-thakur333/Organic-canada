#!/bin/bash
set -euo pipefail

BASE="http://localhost:9000"
PASS=0
FAIL=0

assert() {
  if [ "$1" = "true" ] || [ "$1" = "0" ]; then
    echo "  PASS: $2"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $2"
    FAIL=$((FAIL+1))
  fi
}

echo "═══ Inventory Audit Log Test ═══"
echo ""

# ── 1. Admin Login ──────────────────────────────────
echo "1. Admin Login"
ADMIN_RESP=$(curl -s "$BASE/auth/user/emailpass?returnAccessToken=true" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@admin.com","password":"TestAdmin123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log(j.access_token||j.token||'')}catch{e=>console.log('')}})")
assert "$([ -n "$ADMIN_TOKEN" ] && echo true || echo false)" "Admin logged in"

# ── 2. Register Vendor ──────────────────────────────
echo ""
echo "2. Register Vendor"
UUID=$(date +%s | md5sum | head -c 8)
VENDOR_EMAIL="audit-vendor-$UUID@eatsie.test"
VENDOR_PASS="VendorTest123!"
REG_RESP=$(curl -s "$BASE/vendor/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Audit Vendor $UUID\",\"store_name\":\"Audit Store $UUID\",\"email\":\"$VENDOR_EMAIL\",\"password\":\"$VENDOR_PASS\"}")
VENDOR_ID=$(echo "$REG_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).vendor?.id||'')}catch{e=>console.log('')}})")
assert "$([ -n "$VENDOR_ID" ] && echo true || echo false)" "Vendor registered: $VENDOR_ID"

# ── 3. Admin Approves Vendor ────────────────────────
echo ""
echo "3. Admin Approves Vendor"
APPROVE_RESP=$(curl -s -X POST "$BASE/admin/vendors/$VENDOR_ID/approve" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_TOKEN")
APPROVE_STATUS=$(echo "$APPROVE_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).message||'')}catch{e=>console.log('')}})")
assert "$([ -n "$APPROVE_STATUS" ] && echo true || echo false)" "Vendor approved"

# ── 4. Vendor Login ─────────────────────────────────
echo ""
echo "4. Vendor Login"
LOGIN_RESP=$(curl -s "$BASE/vendor/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$VENDOR_EMAIL\",\"password\":\"$VENDOR_PASS\"}")
VENDOR_TOKEN=$(echo "$LOGIN_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).token||'')}catch{e=>console.log('')}})")
assert "$([ -n "$VENDOR_TOKEN" ] && echo true || echo false)" "Vendor logged in"

# ── 5. Create Product ───────────────────────────────
echo ""
echo "5. Create Product"
PROD_RESP=$(curl -s "$BASE/vendor/products" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -d "{\"title\":\"Audit Test Product $UUID\",\"price\":19.99}")
PRODUCT_ID=$(echo "$PROD_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).product?.id||JSON.parse(d).id||'')}catch{e=>console.log('')}})")
assert "$([ -n "$PRODUCT_ID" ] && echo true || echo false)" "Product created: $PRODUCT_ID"

# ── 6. Create inventory for the product via medusa exec ──
echo ""
echo "6. Creating inventory items for vendor products..."
SETUP_OUTPUT=$(npx medusa exec ./src/scripts/setup-vendor-inventory.ts 2>&1)
echo "  $SETUP_OUTPUT" | tail -1

# ── 7. Get Inventory Levels ─────────────────────────
echo ""
echo "7. Get Inventory Levels"
INV_RESP=$(curl -s "$BASE/vendor/inventory" \
  -H "Authorization: Bearer $VENDOR_TOKEN")
INV_COUNT=$(echo "$INV_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log((j.inventory||[]).length)}catch{e=>console.log('0')}})")
assert "$([ "$INV_COUNT" -gt 0 ] && echo true || echo false)" "Has $INV_COUNT inventory items"

if [ "$INV_COUNT" -eq 0 ]; then
  echo ""
  echo "  No inventory items found. Dumping details for debugging..."
  echo "  Vendor ID: $VENDOR_ID"
  echo "  Product ID: $PRODUCT_ID"
  echo "  Skipping remaining tests."
  FAIL=$((FAIL+1))
  echo ""
  echo "═══ Results: $PASS passed, $FAIL failed ═══"
  exit 1
fi

# Parse inventory level info
LEVEL_ID=$(echo "$INV_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).inventory[0]?.level_id||'')}catch{e=>console.log('')}})")
CURRENT_QTY=$(echo "$INV_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).inventory[0]?.stocked_quantity||0)}catch{e=>console.log('0')}})")
assert "$([ -n "$LEVEL_ID" ] && echo true || echo false)" "Level ID: $LEVEL_ID, current: $CURRENT_QTY"

# ── 8. Update Stock (Increase) ──────────────────────
echo ""
echo "8. Update Stock (increase $CURRENT_QTY -> $((CURRENT_QTY + 50)))"
UPDATE_RESP=$(curl -s -X POST "$BASE/vendor/inventory" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -d "{\"level_id\":\"$LEVEL_ID\",\"stocked_quantity\":$((CURRENT_QTY + 50))}")
UPDATE_STATUS=$(echo "$UPDATE_RESP" | node -e "process.stdin.on('data',d=>{try{const r=JSON.parse(d);console.log(r.inventory_level?'ok':'fail')}catch{e=>console.log('fail')}})")
assert "$([ "$UPDATE_STATUS" = "ok" ] && echo true || echo false)" "Stock increased successfully"

# ── 9. Update Stock (Decrease) ──────────────────────
echo ""
echo "9. Update Stock (decrease $((CURRENT_QTY + 50)) -> $((CURRENT_QTY + 40)))"
UPDATE2_RESP=$(curl -s -X POST "$BASE/vendor/inventory" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -d "{\"level_id\":\"$LEVEL_ID\",\"stocked_quantity\":$((CURRENT_QTY + 40))}")
UPDATE2_STATUS=$(echo "$UPDATE2_RESP" | node -e "process.stdin.on('data',d=>{try{const r=JSON.parse(d);console.log(r.inventory_level?'ok':'fail')}catch{e=>console.log('fail')}})")
assert "$([ "$UPDATE2_STATUS" = "ok" ] && echo true || echo false)" "Stock decreased successfully"

# ── 10. Check Audit Log ─────────────────────────────
echo ""
echo "10. GET /vendor/inventory/audit"
AUDIT_RESP=$(curl -s "$BASE/vendor/inventory/audit" \
  -H "Authorization: Bearer $VENDOR_TOKEN")
ENTRY_COUNT=$(echo "$AUDIT_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log((j.entries||[]).length)}catch{e=>console.log('0')}})")
assert "$([ "$ENTRY_COUNT" -ge 2 ] && echo true || echo false)" "Audit has $ENTRY_COUNT entries (>=2)"

# Check first entry fields
FIRST_ENTRY=$(echo "$AUDIT_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);const e=j.entries[0];console.log(JSON.stringify({id:!!e.id,vendorMatch:e.vendor_id==='$VENDOR_ID',levelMatch:e.level_id==='$LEVEL_ID',hasPrev:typeof e.previous_stocked_quantity==='number',hasNew:typeof e.new_stocked_quantity==='number',type:e.change_type,source:e.source,actor:e.actor_type,created:!!e.created_at}))}catch{e=>console.log('{}')}})")
echo "  Entry details: $FIRST_ENTRY"

HAS_RESTOCK=$(echo "$AUDIT_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);const has=j.entries.some(e=>e.level_id==='$LEVEL_ID'&&e.change_type==='restock');console.log(has?'true':'false')}catch{e=>console.log('false')}})")
HAS_MANUAL=$(echo "$AUDIT_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);const has=j.entries.some(e=>e.level_id==='$LEVEL_ID'&&e.change_type==='manual_update');console.log(has?'true':'false')}catch{e=>console.log('false')}})")
assert "$HAS_RESTOCK" "Has restock entry (increase)"
assert "$HAS_MANUAL" "Has manual_update entry (decrease)"

# ── 11. Filter by Level ID ──────────────────────────
echo ""
echo "11. Filter audit by level_id"
FILTER_RESP=$(curl -s "$BASE/vendor/inventory/audit?level_id=$LEVEL_ID&limit=5" \
  -H "Authorization: Bearer $VENDOR_TOKEN")
FILTER_COUNT=$(echo "$FILTER_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log((j.entries||[]).length)}catch{e=>console.log('0')}})")
assert "$([ "$FILTER_COUNT" -gt 0 ] && echo true || echo false)" "Filtered by level_id: $FILTER_COUNT entries"

ALL_MATCH=$(echo "$FILTER_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);const ok=j.entries.every(e=>e.level_id==='$LEVEL_ID');console.log(ok?'true':'false')}catch{e=>console.log('false')}})")
assert "$ALL_MATCH" "All filtered entries match level_id"

# ── 12. Pagination ─────────────────────────────────
echo ""
echo "12. Pagination (limit=1, offset=0)"
PAGE_RESP=$(curl -s "$BASE/vendor/inventory/audit?limit=1&offset=0" \
  -H "Authorization: Bearer $VENDOR_TOKEN")
PAGE_COUNT=$(echo "$PAGE_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log((j.entries||[]).length)}catch{e=>console.log('0')}})")
PAGE_LIMIT=$(echo "$PAGE_RESP" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).limit)}catch{e=>console.log('0')}})")
assert "$([ "$PAGE_COUNT" -le 1 ] && echo true || echo false)" "Page size: $PAGE_COUNT (<=1)"
assert "$([ "$PAGE_LIMIT" -eq 1 ] && echo true || echo false)" "limit=$PAGE_LIMIT"

# ── 13. Admin Audit Overview ────────────────────────
echo ""
echo "13. GET /admin/inventory-audit"
ADMIN_AUDIT_RESP=$(curl -s "$BASE/admin/inventory-audit" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
ADMIN_COUNT=$(echo "$ADMIN_AUDIT_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log((j.entries||[]).length)}catch{e=>console.log('0')}})")
assert "$([ "$ADMIN_COUNT" -gt 0 ] && echo true || echo false)" "Admin sees $ADMIN_COUNT audit entries"

# Admin filter by vendor_id
ADMIN_FILTER_RESP=$(curl -s "$BASE/admin/inventory-audit?vendor_id=$VENDOR_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
ADMIN_FILTER_COUNT=$(echo "$ADMIN_FILTER_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log((j.entries||[]).length)}catch{e=>console.log('0')}})")
ADMIN_FILTER_OK=$(echo "$ADMIN_FILTER_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);const ok=j.entries.every(e=>e.vendor_id==='$VENDOR_ID');console.log(ok?'true':'false')}catch{e=>console.log('false')}})")
assert "$([ "$ADMIN_FILTER_COUNT" -gt 0 ] && echo true || echo false)" "Admin filtered by vendor: $ADMIN_FILTER_COUNT entries"
assert "$ADMIN_FILTER_OK" "All admin filtered entries match vendor_id"

# ── 14. Ownership Isolation ─────────────────────────
echo ""
echo "14. Ownership isolation"
ALL_OWN=$(echo "$AUDIT_RESP" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);const ok=j.entries.every(e=>e.vendor_id==='$VENDOR_ID');console.log(ok?'true':'false')}catch{e=>console.log('false')}})")
assert "$ALL_OWN" "All vendor audit entries belong to this vendor"

# ── Summary ─────────────────────────────────────────
echo ""
echo "═══ Results: $PASS passed, $FAIL failed ═══"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
