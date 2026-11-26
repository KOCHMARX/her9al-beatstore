import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enteredPriceCents,
  claimFreeLicense,
  createStaffLicense,
  downloadMaster,
  handleCheckout,
} from '../lib/beatstore-routes.ts';
import { fakeDb } from './fake-db.ts';

const BUYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BEAT = '33333333-3333-4333-8333-333333333333';
const LICENSE = '44444444-4444-4444-8444-444444444444';
const ITEM = '55555555-5555-4555-8555-555555555555';
const FREE_LICENSE = {
  id: LICENSE,
  beat_id: BEAT,
  name: 'Free download',
  price_cents: 0,
  active: true,
  beat: { id: BEAT, published: true, master_path: 'masters/owner.wav' },
};

test('entered price keeps empty fields license-free but creates a zero-cent license when 0 is entered', () => {
  assert.equal(enteredPriceCents(''), null);
  assert.equal(enteredPriceCents(null), null);
  assert.equal(enteredPriceCents(undefined), null);
  assert.equal(enteredPriceCents('   '), null);
  assert.equal(enteredPriceCents('0'), 0);
  assert.equal(enteredPriceCents(0), 0);
  assert.equal(enteredPriceCents('00.00'), 0);
  assert.equal(enteredPriceCents('29.99'), 2999);
  assert.equal(enteredPriceCents('-1'), null);
  assert.equal(enteredPriceCents('abc'), null);
});

test('claim-free creates a paid zero-cent entitlement and ignores client price/amount', async () => {
  const db = fakeDb({
    licenses: [{ ...FREE_LICENSE }],
    beats: [{ id: BEAT }],
    orders: [],
    order_items: [],
  });
  const result = await claimFreeLicense({
    db,
    user: { id: BUYER, role: 'customer' },
    body: { license_id: LICENSE, price: 9900, amount: 9900, price_cents: 9900 },
  });
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.item_id, 'string');
  assert.deepEqual(db.tables.orders.map((row: any) => ({ status: row.status, provider: row.provider, total_cents: row.total_cents })), [
    { status: 'paid', provider: 'free', total_cents: 0 },
  ]);
  assert.deepEqual(db.tables.order_items.map((row: any) => ({ price_cents: row.price_cents, license_id: row.license_id })), [
    { price_cents: 0, license_id: LICENSE },
  ]);
});

test('claim-free is idempotent for an already-owned paid item', async () => {
  const db = fakeDb({
    licenses: [{ ...FREE_LICENSE }],
    beats: [{ id: BEAT }],
    orders: [{ id: '66666666-6666-4666-8666-666666666666', user_id: BUYER, status: 'paid', provider: 'free', total_cents: 0 }],
    order_items: [{ id: ITEM, license_id: LICENSE, order: { user_id: BUYER, status: 'paid' } }],
  });
  const result = await claimFreeLicense({ db, user: { id: BUYER }, body: { license_id: LICENSE } });
  assert.equal(result.status, 200);
  assert.equal(result.body.item_id, ITEM);
  assert.equal(result.body.existing, true);
  assert.equal(db.calls.filter(call => call.op === 'insert').length, 0);
});

test('claim-free rejects paid licenses and creates no order', async () => {
  const db = fakeDb({
    licenses: [{ ...FREE_LICENSE, price_cents: 2900 }],
    beats: [{ id: BEAT }],
    orders: [],
    order_items: [],
  });
  const result = await claimFreeLicense({ db, user: { id: BUYER }, body: { license_id: LICENSE } });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'not_free');
  assert.equal(db.tables.orders.length, 0);
});

test('claim-free rejects a missing private master with 409 and creates no order', async () => {
  const db = fakeDb({
    licenses: [{ ...FREE_LICENSE, beat: { id: BEAT, published: true, master_path: '' } }],
    beats: [{ id: BEAT }],
    orders: [],
    order_items: [],
  });
  const result = await claimFreeLicense({ db, user: { id: BUYER }, body: { license_id: LICENSE } });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'master_unavailable');
  assert.equal(db.tables.orders.length, 0);
});

test('claim-free requires login and cleans up its order if the item insert fails', async () => {
  const anonymous = await claimFreeLicense({ db: fakeDb({}), user: null, body: { license_id: LICENSE } });
  assert.equal(anonymous.status, 401);

  const db = fakeDb(
    { licenses: [{ ...FREE_LICENSE }], beats: [{ id: BEAT }], orders: [], order_items: [] },
    { fail: (op, table) => op === 'insert' && table === 'order_items' ? { code: 'mock_insert_failed' } : undefined },
  );
  const result = await claimFreeLicense({ db, user: { id: BUYER }, body: { license_id: LICENSE } });
  assert.equal(result.status, 500);
  assert.equal(db.tables.orders.length, 0, 'the freshly created order must be removed');
  assert.ok(db.calls.some(call => call.op === 'delete' && call.table === 'orders'));
});

test('staff-only license repair validates price, beat and duplicates', async () => {
  const anonymous = await createStaffLicense({ db: fakeDb({}), user: null, body: {} });
  assert.equal(anonymous.status, 401);
  const customer = await createStaffLicense({ db: fakeDb({}), user: { id: BUYER, role: 'customer' }, body: {} });
  assert.equal(customer.status, 403);

  const db = fakeDb({
    beats: [{ id: BEAT }],
    licenses: [{ id: LICENSE, beat_id: BEAT, name: 'Standard', price_cents: 2900, active: true }],
  });
  const badPrice = await createStaffLicense({
    db, user: { id: BUYER, role: 'owner' },
    body: { beat_id: BEAT, name: 'Free download', price: 1.5, file_format: 'WAV' },
  });
  assert.equal(badPrice.status, 400);
  const duplicate = await createStaffLicense({
    db, user: { id: BUYER, role: 'owner' },
    body: { beat_id: BEAT, name: ' standard ', price: 0, file_format: 'WAV' },
  });
  assert.equal(duplicate.status, 409);
  const created = await createStaffLicense({
    db, user: { id: BUYER, role: 'admin' },
    body: { beat_id: BEAT, name: 'Free download', price: 0, file_format: 'WAV' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.license.price_cents, 0);
  assert.equal(created.body.license.active, true);
});

function paidItem(status: string, userId = BUYER, masterPath = 'masters/owner.wav') {
  return {
    id: ITEM,
    beat: { master_path: masterPath },
    order: { user_id: userId, status },
  };
}

test('paid download only signs a private master for the owner of a paid order', async () => {
  for (const status of ['pending', 'cancelled', 'refunded']) {
    const db = fakeDb({ order_items: [paidItem(status)] });
    const result = await downloadMaster({ db, user: { id: BUYER }, itemId: ITEM });
    assert.equal(result.status, 404, `status ${status} must not authorize delivery`);
    assert.equal(db.storageCalls.length, 0);
  }

  const otherUser = fakeDb({ order_items: [paidItem('paid', OTHER)] });
  assert.equal((await downloadMaster({ db: otherUser, user: { id: BUYER }, itemId: ITEM })).status, 404);
  assert.equal(otherUser.storageCalls.length, 0);

  const missing = fakeDb({ order_items: [paidItem('paid')] });
  assert.equal((await downloadMaster({ db: missing, user: null, itemId: ITEM })).status, 401);

  const noMaster = fakeDb({ order_items: [paidItem('paid', BUYER, '')] });
  assert.equal((await downloadMaster({ db: noMaster, user: { id: BUYER }, itemId: ITEM })).status, 404);

  const db = fakeDb({ order_items: [paidItem('paid')] });
  const result = await downloadMaster({ db, user: { id: BUYER }, itemId: ITEM });
  assert.equal(result.status, 302);
  assert.deepEqual(db.storageCalls, [{ bucket: 'beat-masters', op: 'createSignedUrl', path: 'masters/owner.wav', expires: 60 }]);
});

test('checkout rejects free licenses before Stripe or any order, and paid checkout needs a key', async () => {
  const freeDb = fakeDb({ licenses: [{ ...FREE_LICENSE }], beats: [{ id: BEAT }], orders: [], order_items: [] });
  const free = await handleCheckout({
    db: freeDb,
    user: { id: BUYER },
    body: { license_id: LICENSE, price: 9900, amount: 9900 },
    stripeKey: '',
    origin: 'https://preview.invalid',
  });
  assert.equal(free.status, 400);
  assert.equal(free.body.error, 'free_license_use_claim');
  assert.equal(freeDb.tables.orders.length, 0);

  const paidDb = fakeDb({
    licenses: [{ ...FREE_LICENSE, price_cents: 2900, name: 'Standard' }],
    beats: [{ id: BEAT }],
    orders: [],
    order_items: [],
  });
  const noKey = await handleCheckout({
    db: paidDb,
    user: { id: BUYER },
    body: { license_id: LICENSE },
    stripeKey: '',
    origin: 'https://preview.invalid',
  });
  assert.equal(noKey.status, 503);
  assert.equal(noKey.body.error, 'payments_not_configured');
  assert.equal(paidDb.tables.orders.length, 0, 'no dangling pending order');
});

test('mocked paid checkout creates a pending order and cleans up when Stripe fails', async () => {
  const fetchCalls: Array<{ url: string; body: URLSearchParams }> = [];
  const paidLicense = { ...FREE_LICENSE, price_cents: 2900, name: 'Standard' };

  const okDb = fakeDb({ licenses: [{ ...paidLicense }], beats: [{ id: BEAT }], orders: [], order_items: [] });
  const ok = await handleCheckout({
    db: okDb,
    user: { id: BUYER, email: 'buyer@example.invalid' },
    body: { license_id: LICENSE, price: 1 },
    stripeKey: 'sk_test_mock',
    origin: 'https://preview.invalid',
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, body: init.body as URLSearchParams });
      return { ok: true, status: 200, json: async () => ({ id: 'cs_mock', url: 'https://checkout.invalid/session' }) };
    },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.url, 'https://checkout.invalid/session');
  assert.equal(fetchCalls[0].body.get('line_items[0][price_data][unit_amount]'), '2900');
  assert.equal(okDb.tables.orders[0].status, 'pending');
  assert.equal(okDb.tables.orders[0].provider, 'stripe');
  assert.equal(okDb.tables.order_items[0].price_cents, 2900);

  const failDb = fakeDb({ licenses: [{ ...paidLicense }], beats: [{ id: BEAT }], orders: [], order_items: [] });
  const failed = await handleCheckout({
    db: failDb,
    user: { id: BUYER },
    body: { license_id: LICENSE },
    stripeKey: 'sk_test_mock',
    origin: 'https://preview.invalid',
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  assert.equal(failed.status, 502);
  assert.equal(failDb.tables.order_items.length, 0);
  assert.equal(failDb.tables.orders[0].status, 'cancelled');
});
