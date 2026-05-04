# Example documents

One JSON file per collection. Documents use **MongoDB Extended JSON v2** so they can be loaded with `mongoimport` or `mongorestore`:

- `ObjectId` → `{ "$oid": "..." }`
- `Date` → `{ "$date": "..." }`
- `Decimal128` → `{ "$numberDecimal": "..." }`

The same IDs are used across files so the documents cross-reference into a coherent fictional dataset (one restaurant `Sakura Omakase`, two customers `sarah`/`mike`, one staff manager, one reservation, one order, one payment, etc.).

## Files


| File                                 | Collection              |
| ------------------------------------ | ----------------------- |
| `customer_users_example.json`        | `customer_users`        |
| `staff_users_example.json`           | `staff_users`           |
| `restaurants_example.json`           | `restaurants`           |
| `tables_example.json`                | `tables`                |
| `reservations_example.json`          | `reservations`          |
| `orders_example.json`                | `orders`                |
| `payments_example.json`              | `payments`              |
| `wallet_transactions_example.json`   | `wallet_transactions`   |
| `points_ledger_example.json`         | `points_ledger`         |
| `notifications_example.json`         | `notifications`         |
| `support_conversations_example.json` | `support_conversations` |
| `metadata_example.json`              | `metadata`              |


## Shared IDs


| Entity               | `_id`                      |
| -------------------- | -------------------------- |
| Customer Sarah       | `65f0000000000000000c0001` |
| Customer Mike        | `65f0000000000000000c0002` |
| Staff manager Olivia | `65f0000000000000000a0001` |
| Staff chef Jin       | `65f0000000000000000a0002` |
| Restaurant Sakura    | `65f0000000000000000b0001` |
| Floor Main           | `65f0000000000000000f0001` |
| Table P1             | `65f0000000000000000d0001` |
| Reservation          | `65f0000000000000000e0001` |
| Order                | `65f0000000000000000a1001` |
| Payment (deposit)    | `65f0000000000000000e0010` |
| Payment (order bill) | `65f0000000000000000e0011` |
| Wallet top-up tx     | `65f0000000000000000a2001` |
| Points ledger entry  | `65f0000000000000000a3001` |
| Notification         | `65f0000000000000000a4001` |
| Support conv         | `65f0000000000000000a6001` |


## Loading

```bash
# example: import every collection from this folder
for f in *_example.json; do
  coll=$(echo "$f" | sed 's/_example\.json$//')
  mongoimport --uri="$MONGO_URI" --db=catchtable --collection="$coll" --file="$f" --jsonArray
done
```

