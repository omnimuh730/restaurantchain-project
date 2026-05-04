export function mountPublicRoutes(app, ctx) {
  const { store } = ctx;
  const { RID, FLOOR_MAIN } = store;

  function restaurantCard() {
    return {
      id: RID,
      name: 'Sakura Omakase',
      slug: 'sakura-omakase-gangnam',
      cuisine: ['japanese', 'omakase'],
      priceLevel: 4,
      thumbnailUrl: 'https://cdn.catchtable.example/r/sakura/cover.jpg',
      rating: { average: 4.8, count: 412 },
      address: {
        line1: '12 Apgujeong-ro 60-gil',
        line2: 'B1F',
        city: 'Seoul',
        country: 'KR',
        postalCode: '06010',
      },
      location: { lat: 37.5172, lng: 127.0473 },
      flags: { isNew: true, isCatchOnly: false, isEditorChoice: true },
      amenities: ['wifi', 'private', 'vegan'],
    };
  }

  function fullRestaurant() {
    return {
      ...restaurantCard(),
      description: '12-course omakase from chef Hiro.',
      imageUrls: ['https://cdn.catchtable.example/r/sakura/1.jpg'],
      status: 'active',
      tier: 'pro',
      contact: { primaryPhone: '+8225551234', websiteUrl: 'https://example.com' },
      settings: {
        general: {
          deposit: {
            moneyType: 'domestic',
            amountPerGuest: { amount: '30000', currency: 'KRW' },
          },
          gracePeriodMinutes: 15,
          operatingHours: [
            { day: 1, open: '18:00', close: '23:00', closed: false },
            { day: 5, open: '18:00', close: '00:00', closed: false },
          ],
        },
        security: {
          passwordPolicy: { minLength: 8, requireUppercase: true, requireNumber: true },
          notificationsMuted: false,
        },
        features: { reservations: true, qrPay: true, delivery: false },
      },
      phones: [],
      floors: [{ id: FLOOR_MAIN, name: 'Main', sortOrder: 0, isPublished: true }],
      menu: {
        categories: [
          {
            id: '65f0000000000000000b1001',
            name: 'Appetizers',
            sortOrder: 0,
            isActive: true,
            subcategories: [],
          },
        ],
        items: [
          {
            id: '65f0000000000000000b2001',
            categoryId: '65f0000000000000000b1001',
            name: 'Chef selection sashimi',
            price: { amount: '45000', currency: 'KRW' },
            pool: 'domestic',
            modifiers: [],
            availability: { isAvailable: true },
            isActive: true,
            createdAt: store.nowIso(),
          },
        ],
      },
      depositCards: [],
      pendingStaff: [],
      createdAt: store.nowIso(),
      updatedAt: store.nowIso(),
    };
  }

  app.get('/discover', (req, res) => {
    const lat = req.query.lat;
    const lng = req.query.lng;
    if (!lat || !lng) {
      res.status(422).json({
        type: 'https://errors.catchtable.example/validation_failed',
        title: 'Location required',
        status: 422,
        code: 'location_required',
        detail: 'lat,lng or areaId is required',
      });
      return;
    }
    res.json({
      sections: [
        { kind: 'near_me', title: 'Near you', items: [restaurantCard()] },
        { kind: 'top_rated', title: 'Top rated', items: [restaurantCard()] },
      ],
    });
  });

  app.get('/restaurants', (req, res) => {
    const q = (req.query.q || '').toString().toLowerCase();
    const items = [restaurantCard()].filter((r) => !q || r.name.toLowerCase().includes(q));
    res.json({ items, page: 1, pageSize: 20, total: items.length });
  });

  app.get('/restaurants/:restaurantId', (req, res) => {
    if (req.params.restaurantId !== RID) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    res.json(fullRestaurant());
  });

  app.get('/restaurants/:restaurantId/menu', (req, res) => {
    if (req.params.restaurantId !== RID) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    res.json(fullRestaurant().menu);
  });

  app.get('/restaurants/:restaurantId/availability', (req, res) => {
    if (req.params.restaurantId !== RID) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const date = (req.query.date || '2026-05-10').toString();
    res.json({
      restaurantId: RID,
      date,
      slots: [
        { date, time: '18:00', available: true, partySizeUpTo: 4 },
        { date, time: '18:30', available: true, partySizeUpTo: 4 },
        { date, time: '19:00', available: false, partySizeUpTo: 0 },
      ],
    });
  });

  const metadataCatalogs = {
    security_questions: { id: 'security_questions', version: 1, items: [{ code: 'pet', text: 'First pet name?' }] },
    amenities: { id: 'amenities', version: 1, items: ['wifi', 'private'] },
    reservation_preferences: { id: 'reservation_preferences', version: 1, items: [] },
  };

  app.get('/metadata/:catalog', (req, res) => {
    const catalog = req.params.catalog;
    const doc = metadataCatalogs[catalog];
    if (!doc) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Unknown catalog', status: 404 });
      return;
    }
    const etag = `"v${doc.version}"`;
    if (req.get('if-none-match') === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('ETag', etag);
    res.json(doc);
  });

  app.get('/realtime/channels', (_req, res) => {
    res.json({
      note: 'Stub catalog of server-push channels; wire WebSocket gateway per project-docs/workflows/23-realtime-channels.mmd',
      channels: [
        'reservation.created',
        'reservation.updated',
        'order.updated',
        'table.updated',
        'payment.captured',
        'notification.created',
      ],
    });
  });
}
