---
id: pagination
title: Keyset & Offset Pagination
sidebar_position: 2
---

# Keyset & Offset Pagination

EntityTS provides high-performance keyset (cursor) pagination and traditional page-number pagination.

---

## Keyset (Cursor-Based) Pagination

Keyset pagination avoids the $O(N)$ performance degradation of standard `OFFSET` queries by using indexed column comparisons:

```ts
// Initial page load
const page1 = await db.posts.orderBy(p => p.id, 'desc').toCursorPage({ limit: 20 });

console.log(page1.items);
console.log(page1.nextCursor);
console.log(page1.hasNextPage);

// Next page load using token
const page2 = await db.posts
  .orderBy(p => p.id, 'desc')
  .toCursorPage({ limit: 20, cursor: page1.nextCursor });
```

---

## Page-Number (Offset) Pagination

```ts
const paged = await db.users
  .where('isActive', '=', true)
  .orderBy(u => u.name, 'asc')
  .toPagedList({ page: 1, pageSize: 25 });

console.log(`Page ${paged.page} of ${paged.totalPages} (Total: ${paged.totalCount})`);
console.log(paged.items);
```

---

## Streaming Large Datasets

For large datasets, EntityTS supports memory-efficient async streaming without loading the entire result set into memory at once:

```ts
// Stream entities in batches of 100 via AsyncGenerator
for await (const user of db.users.where('isActive', '=', true).stream(100)) {
  await processUser(user);
}

// Direct async iteration over any DbSet
for await (const user of db.users) {
  console.log(user.name);
}
```

When supported by the underlying driver (such as PostgreSQL cursor streams), EntityTS leverages native cursor streaming; otherwise, it automatically utilizes seamless windowed batch fetching.
