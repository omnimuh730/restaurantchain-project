# Schema · Tables

The only sub-entity of the restaurant tenant kept as its own collection. Reason: tables carry **operational state** updated concurrently during service (waiter status flips, reservation arrival, kitchen-ready cleanup), and emit per-row realtime events.

Source READMEs:

- `pos/Floor Plan/README.md`
- `pos/Orders/README.md`
- `reservation/Reservation Flow/README.md` (table assignment at check-in)
- `reservation/Dining/README.md` (QR check-in)

## Collection

| Collection | Purpose |
|---|---|
| `tables` | Per-floor tables with shape, position, capacity, status, and occupancy. |

---

## `tables`

```ts
type Table = {
  _id: ObjectId;
  restaurantId: ObjectId;
  floorId: ObjectId;                // -> restaurants.floors[]._id

  name: string;                     // "P1", "T-3"
  seats: number;
  shape: "circle" | "square" | "rect";
  size: { w: number; h: number };
  position: { x: number; y: number };
  z: number;                        // stacking order on the floor canvas

  status: "available" | "reserved" | "occupied" | "needs_cleaning" | "out_of_service";
  occupancy?: {
    reservationId?: ObjectId | null; // -> reservations
    orderId?: ObjectId | null;       // -> orders
    seatedAt: Date;                  // exact seating timestamp
    partySize?: number;
  };

  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};
```

### Indexes

- `{ restaurantId: 1, floorId: 1 }`
- `{ restaurantId: 1, status: 1 }`
- `{ "occupancy.reservationId": 1 }`
- `{ "occupancy.orderId": 1 }`

### State diagram

```text
available ─reserve──▶ reserved ─arrive──▶ occupied ─bill paid──▶ needs_cleaning ─clean──▶ available
available ─arrive──▶ occupied
occupied ─void/abandoned──▶ needs_cleaning
any ─manager toggle──▶ out_of_service ─manager toggle──▶ available
```

### Realtime channels

- `table.updated` — emitted on any field change (status, occupancy).
- `table.created` / `table.deleted` — emitted on layout edits.

---

## Cross-document rules

- A reservation moving to `arrived` flips this table to `occupied` and sets `occupancy.reservationId` and `occupancy.orderId` in one update.
- Layout edits in the Floor Plan editor batch-replace tables for that floor; tables not present in the request are soft-deleted (`deletedAt` set).
- Floor renaming is performed on `restaurants.floors[i].name`; tables continue to point at `floorId`.
