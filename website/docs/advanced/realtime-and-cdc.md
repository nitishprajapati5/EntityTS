---
id: realtime-and-cdc
title: Realtime Change Data Capture (CDC)
sidebar_position: 7
---

# Realtime & Change Data Capture (CDC)

EntityTS includes a built-in Change Data Capture (CDC) engine (`CdcEmitter`) to stream database mutations in real time across services, websockets, and event consumers.

---

## ⚡ What is CDC?

Change Data Capture intercepts data modifications at the database or ORM lifecycle layer and emits structured change events containing:

- **Operation**: `INSERT`, `UPDATE`, or `DELETE`
- **Table / Collection**: The entity table being modified
- **Before State**: The previous state of the row/document (for updates and deletes)
- **After State**: The updated or created row/document
- **Timestamp & Transaction ID**: For ordering and idempotency

---

## 📡 Subscribing to CDC Events

Use `CdcEmitter` to subscribe to table events or bridge mutations to an `EntityEventBus`:

```ts
import { CdcEmitter, EntityEventBus } from 'entityts';

const eventBus = new EntityEventBus();
const cdc = new CdcEmitter(eventBus);

// Listen to all INSERTs into the 'orders' table
cdc.subscribe({ table: 'orders', operation: 'INSERT' }, async event => {
  console.log(`New order placed: ${event.after.orderNumber}`);
  await sendConfirmationEmail(event.after);
});

// Listen to all UPDATEs across all tables
cdc.subscribe({ operation: 'UPDATE' }, async event => {
  console.log(`Table ${event.table} updated:`, {
    before: event.before,
    after: event.after,
  });
});
```

---

## 🚀 Publishing CDC Events

When performing mutations, publish CDC events directly or configure your DbContext hooks / Unit of Work to emit them automatically:

```ts
await cdc.publish({
  table: 'orders',
  operation: 'UPDATE',
  before: { id: 101, status: 'pending' },
  after: { id: 101, status: 'shipped' },
  timestamp: new Date(),
  txId: 'tx_8892',
});
```

---

## 🔄 Integration with Transactional Outbox

For distributed microservices, pair `CdcEmitter` with the [Transactional Outbox](./idempotency-and-outbox.md) to guarantee **at-least-once** event publishing without dual-write inconsistencies.
