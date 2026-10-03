---
id: document-linq-queries
title: Document LINQ Queries
sidebar_position: 2
---

# LINQ-Inspired Document Querying

EntityTS brings the power and familiarity of LINQ to document databases via `DocumentQuery` and `NoSqlSet<T>`.

You can write TypeScript lambda expressions or fluent filter chains that compile directly into native MongoDB filter documents, DynamoDB KeyCondition/Filter expressions, and Redis scans.

---

## Fluent Filtering with `.where()`

You can query documents using type-safe lambdas, fluent condition builders, or partial objects:

### 1. Pure Lambda Predicates

EntityTS parses TypeScript lambda predicates into native query filters:

```ts
const activeAdults = await users
  .where(u => u.age >= 21 && u.role === 'admin')
  .orderByDescending(u => u.createdAt)
  .take(10)
  .toList();
```

Compiles to MongoDB filter:

```json
{
  "age": { "$gte": 21 },
  "role": "admin"
}
```

### 2. Fluent WhereClause Builder

```ts
const results = await users
  .where(w => {
    w.where('age', '>=', 18);
    w.and('status', '=', 'active');
  })
  .toList();
```

### 3. Partial Document Matching

```ts
const admins = await users.where({ role: 'admin', isVerified: true }).toList();
```

---

## Projections, Sorting & Pagination

Control exactly which fields are retrieved and how documents are ordered:

```ts
const summaries = await users
  .where(u => u.age > 18)
  .project({ name: 1, email: 1, age: 1 })
  .orderBy(u => u.name, 'asc')
  .skip(20)
  .take(10)
  .toList();
```

---

## Terminal Operations

| Method               | Return Type          | Description                                                      |
| -------------------- | -------------------- | ---------------------------------------------------------------- |
| `.toList()`          | `Promise<T[]>`       | Executes query and returns all matching documents                |
| `.firstOrDefault()`  | `Promise<T \| null>` | Returns the first matching document or null                      |
| `.singleOrDefault()` | `Promise<T \| null>` | Returns the single matching document, throwing if multiple match |
| `.count()`           | `Promise<number>`    | Returns the count of matching documents                          |
| `.any()`             | `Promise<boolean>`   | Returns true if at least one document matches                    |

```ts
// Check existence
const exists = await users.where(u => u.email === 'alice@example.com').any();

// Count documents
const count = await users.where(u => u.age >= 18).count();

// Retrieve first match
const user = await users.where(u => u.id === 'usr_1').firstOrDefault();
```

---

## Aggregation Pipelines

For advanced analytics, `NoSqlSet<T>` supports chaining custom aggregation stages:

```ts
const stats = await users
  .where(u => u.isActive === true)
  .aggregate([
    {
      $group: {
        _id: '$department',
        averageAge: { $avg: '$age' },
        totalUsers: { $sum: 1 },
      },
    },
    {
      $sort: { totalUsers: -1 },
    },
  ]);
```
