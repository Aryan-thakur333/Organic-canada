# Organic Apples Inventory Diagnosis

## Root Cause

`ZERO_AVAILABLE_QUANTITY`.

Organic Apples variant `variant_01KVSFB75GZJ4N0B9SY6BXDTZC` is linked to
inventory item `iitem_01KVSFB7672TYVZNVRY306DPWS`. Its Canada warehouse level
is `0 stocked`, `0 reserved`, and `0 available`. The variant manages inventory
and does not allow backorders.

## Comparison

| Product | Available inventory |
| --- | ---: |
| Organic Apples | 0 |
| chocolate | 965 and 100 across two locations |
| Organic OIL | 95 and 97 across two locations |

The cart error, `Some variant does not have the required inventory`, is
consistent with this data. It is not a missing inventory item, level, regional
price, or currency issue.

## Safe Remediation

The approval file is [organic-apples-inventory-remediation.csv](D:\eatsie-project\backend\reports\organic-apples-inventory-remediation.csv).
Its proposed quantity is blank and `approved=false`.

Run the read-only plan with:

```powershell
cd D:\eatsie-project\backend
npm.cmd exec medusa exec ./src/scripts/remediate-organic-apples-inventory.ts dry-run
```

No inventory apply was run. A merchant must approve a specific stock quantity
and location before an apply implementation can be authorized.

## Writes

- Price writes: 0
- Catalog writes: 0
- Inventory writes: 0
