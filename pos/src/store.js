function oid() {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function nowIso() {
  return new Date().toISOString();
}

export function createPosStore() {
  const tablesByFloor = new Map();
  const orders = new Map();
  const payments = new Map();

  const RID = '65f0000000000000000b0001';
  const FLOOR = '65f0000000000000000f0001';
  const tid = '65f0000000000000000t0001';

  const key = `${RID}:${FLOOR}`;
  tablesByFloor.set(key, [
    {
      id: tid,
      restaurantId: RID,
      floorId: FLOOR,
      name: 'P1',
      seats: 4,
      shape: 'rect',
      size: { w: 2, h: 2 },
      position: { x: 10, y: 10 },
      z: 0,
      status: 'available',
      qrCode: {
        payload: 'qr-demo',
        payloadHash: 'hash-demo',
        rotationVersion: 1,
        validFrom: nowIso(),
        validUntil: null,
        issuedBy: 'staff-demo-1',
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ]);

  return {
    RID,
    FLOOR,
    tablesByFloor,
    orders,
    payments,
    oid,
    nowIso,
  };
}
