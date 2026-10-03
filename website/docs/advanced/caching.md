---
id: caching
title: Advanced Caching & Invalidation
sidebar_position: 6
---

# Advanced Caching & Invalidation

EntityTS includes an enterprise multi-tier caching system built for high-throughput applications.

It provides **Tagged Query Caching**, **Multi-Tier L1/L2 Caching**, and **Write-Through / Read-Through** coordination with automatic invalidation on mutations.

---

## 🏷️ Tagged Query Cache (`TaggedQueryCache`)

Traditional query caching fails when you need to invalidate all queries related to a given entity or tenant.

`TaggedQueryCache` solves this by attaching arbitrary tags to cached query results and allowing wildcard tag invalidation:

```ts
import { TaggedQueryCache } from 'entityts';

const cache = new TaggedQueryCache();

// Cache query with entity tags
await cache.set('users:active:page1', activeUsers, 60000, ['users', 'users:page']);
await cache.set('user:profile:42', userProfile, 60000, ['users', 'user:42']);

// Later, when user #42 is updated, invalidate only user:42 tags:
await cache.tag('user:42').invalidate();

// Or invalidate ALL queries tagged with 'users' or 'users:*' wildcard:
await cache.tag('users:*').invalidate();
```

---

## ⚡ Multi-Tier Caching (`EntityCache`)

`EntityCache` coordinates a fast in-memory **L1 cache** (e.g., Node.js process memory) with a distributed **L2 cache** (e.g., Redis).

```ts
import { EntityCache, TaggedQueryCache, RedisAdapter } from 'entityts';

const l1Cache = new TaggedQueryCache(); // Fast local RAM
const entityCache = new EntityCache({
  cache: l1Cache,
  defaultTtlMs: 120_000, // 2 minutes
});

// Store entity by class and primary key
await entityCache.setEntity(User, user.id, user, 60_000);

// Retrieve entity (checks L1 memory first, then L2)
const cachedUser = await entityCache.getEntity(User, user.id);

// Invalidate on update or delete
await entityCache.invalidateEntity(User, user.id);
```

---

## 🔄 Write-Through & Read-Through Cache (`WriteThroughCache`)

`WriteThroughCache` simplifies data access by abstracting cache misses and synchronizing mutations with the database and cache simultaneously:

```ts
import { WriteThroughCache, DbContext } from 'entityts';

const cache = new WriteThroughCache();

// Read-through: automatically fetches from database if cache misses
const user = await cache.readThrough(
  `user:${userId}`,
  async () => {
    return await db.users.find(userId);
  },
  {
    ttlMs: 300_000, // 5 minutes
    tags: ['users', `user:${userId}`],
  },
);

// Write-through: updates database and updates/invalidates cache atomically
await cache.saveEntityThrough(User, user.id, user, async updated => {
  await db.users.update(updated.id, updated);
});

// Evict entity from all cache tiers
await cache.evictEntity(User, userId);
```

### Cache Strategies

- **Read-Through**: Automatically populate cache on miss from the provided supplier function.
- **Write-Through**: Persist mutation to DB and update the cache key immediately.
- **Write-Around**: Persist mutation to DB and invalidate the cache key so the next read fetches fresh data.
