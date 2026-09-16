import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('stash routes cover owner lifecycle, filtering, partial updates, and soft delete', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';

  let app;
  let pool;
  const client = new pg.Client({ connectionString: databaseUrl });
  t.after(async () => {
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    await client.end();
  });

  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('stash-owner@example.test', 'Stash Owner'),
       ('stash-other@example.test', 'Stash Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'stash-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'stash-other@example.test').id;

  const otherStashId = (
    await client.query(
      `INSERT INTO stash_items (user_id, category, name, brand)
       VALUES ($1, 'yarn', 'Other private yarn', 'Hidden Brand')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;

  const emptyList = await app.inject({
    method: 'GET',
    url: '/stash',
    headers: { authorization },
  });
  assert.equal(emptyList.statusCode, 200, emptyList.body);
  assert.deepEqual(emptyList.json(), { items: [] });

  const created = await app.inject({
    method: 'POST',
    url: '/stash',
    headers: { authorization },
    payload: {
      category: 'yarn',
      name: '  Sea Glass Sock  ',
      quantity: ' 2 ',
      unit: 'skeins',
      brand: 'North Sea Fibres',
      yarnWeight: '4 ply',
      fibre: '75% wool / 25% nylon',
      colour: 'Teal',
      dyeLot: 'LOT-42',
      location: 'Blue bin',
      reservedFor: 'Gift socks',
      notes: 'Superwash',
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const item = created.json().item;
  assert.equal(item.category, 'yarn');
  assert.equal(item.name, 'Sea Glass Sock');
  assert.equal(item.quantity, '2');
  assert.equal(item.brand, 'North Sea Fibres');
  assert.equal(item.yarn_weight, '4 ply');
  assert.equal(item.image_url, null);
  const itemId = item.id;

  const filtered = await app.inject({
    method: 'GET',
    url: '/stash?category=yarn&search=sea',
    headers: { authorization },
  });
  assert.equal(filtered.statusCode, 200, filtered.body);
  assert.equal(filtered.json().items.length, 1);
  assert.equal(filtered.json().items[0].id, itemId);

  const noCrossUserLeak = await app.inject({
    method: 'GET',
    url: '/stash?search=Hidden',
    headers: { authorization },
  });
  assert.equal(noCrossUserLeak.statusCode, 200, noCrossUserLeak.body);
  assert.deepEqual(noCrossUserLeak.json(), { items: [] });

  const crossUserUpdate = await app.inject({
    method: 'PUT',
    url: `/stash/${otherStashId}`,
    headers: { authorization },
    payload: { name: 'stolen' },
  });
  assert.equal(crossUserUpdate.statusCode, 404, crossUserUpdate.body);
  assert.deepEqual(crossUserUpdate.json(), { error: 'Stash item not found' });

  const partialUpdate = await app.inject({
    method: 'PUT',
    url: `/stash/${itemId}`,
    headers: { authorization },
    payload: {
      quantity: '3',
      location: 'Project basket',
    },
  });
  assert.equal(partialUpdate.statusCode, 200, partialUpdate.body);
  const partiallyUpdatedItem = partialUpdate.json().item;
  assert.equal(partiallyUpdatedItem.quantity, '3');
  assert.equal(partiallyUpdatedItem.location, 'Project basket');
  assert.equal(partiallyUpdatedItem.brand, 'North Sea Fibres');
  assert.equal(partiallyUpdatedItem.yarn_weight, '4 ply');
  assert.equal(partiallyUpdatedItem.notes, 'Superwash');

  const explicitClear = await app.inject({
    method: 'PUT',
    url: `/stash/${itemId}`,
    headers: { authorization },
    payload: {
      notes: null,
      reservedFor: null,
    },
  });
  assert.equal(explicitClear.statusCode, 200, explicitClear.body);
  assert.equal(explicitClear.json().item.notes, null);
  assert.equal(explicitClear.json().item.reserved_for, null);
  assert.equal(explicitClear.json().item.brand, 'North Sea Fibres');

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/stash/${itemId}`,
    headers: { authorization },
  });
  assert.equal(deleted.statusCode, 204, deleted.body);

  const afterDeleteList = await app.inject({
    method: 'GET',
    url: '/stash?search=Sea',
    headers: { authorization },
  });
  assert.equal(afterDeleteList.statusCode, 200, afterDeleteList.body);
  assert.deepEqual(afterDeleteList.json(), { items: [] });

  const deletedAgain = await app.inject({
    method: 'DELETE',
    url: `/stash/${itemId}`,
    headers: { authorization },
  });
  assert.equal(deletedAgain.statusCode, 404, deletedAgain.body);

  const rows = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM stash_items WHERE user_id = $1 AND deleted_at IS NULL) AS owner_active_stash,
       (SELECT COUNT(*)::int FROM stash_items WHERE user_id = $2 AND deleted_at IS NULL) AS other_active_stash,
       (SELECT name FROM stash_items WHERE id = $3) AS other_name`,
    [ownerId, otherId, otherStashId],
  );
  assert.deepEqual(rows.rows[0], {
    owner_active_stash: 0,
    other_active_stash: 1,
    other_name: 'Other private yarn',
  });
});
