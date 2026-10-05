# EntityTS Comprehensive Query Cookbook

A complete, production-ready reference guide to every query pattern and data retrieval feature supported by **EntityTS**.

---

## Table of Contents

1. [Sample Entities & Setup](#1-sample-entities--setup)
2. [Pure LINQ Lambda Predicates (`where`)](#2-pure-linq-lambda-predicates-where)
   - [Basic Comparisons](#basic-comparisons)
   - [Compound Conditions (`&&`, `||`)](#compound-conditions--)
   - [Boolean Shorthand](#boolean-shorthand)
   - [Null & Undefined Checks](#null--undefined-checks)
   - [String Pattern Matching (`startsWith`, `endsWith`, `includes`)](#string-pattern-matching-startswith-endswith-includes)
   - [Array Membership (`IN` Operator)](#array-membership-in-operator)
   - [Closure & Runtime In-Memory Fallback](#closure--runtime-in-memory-fallback)
3. [Materialization & Query Execution](#3-materialization--query-execution)
   - [`toList()` / `toArray()`](#tolist--toarray)
   - [`first()` & `firstOrDefault()`](#first--firstordefault)
   - [`single()` & `singleOrDefault()`](#single--singleordefault)
4. [Sorting, Limiting & Slicing](#4-sorting-limiting--slicing)
   - [Ordering (`orderBy`, `thenBy`)](#ordering-orderby-thenby)
   - [Offset Limiting (`skip`, `take`)](#offset-limiting-skip-take)
5. [Pagination Patterns](#5-pagination-patterns)
   - [Traditional Page-Number Pagination (`toPagedList`)](#traditional-page-number-pagination-topagedlist)
   - [Keyset / Cursor-Based Pagination (`toCursorPage`)](#keyset--cursor-based-pagination-tocursorpage)
6. [Projections & Deduplication (`select`, `distinct`)](#6-projections--deduplication-select-distinct)
   - [Typed Object Projection](#typed-object-projection)
   - [Deduplication (`distinct`)](#deduplication-distinct)
7. [Aggregations & Quantifiers](#7-aggregations--quantifiers)
   - [Scalar Aggregates (`count`, `sum`, `avg`, `min`, `max`)](#scalar-aggregates-count-sum-avg-min-max)
   - [Quantifiers (`any`, `all`)](#quantifiers-any-all)
8. [Grouping & Aggregate Filtering (`groupBy`, `having`)](#8-grouping--aggregate-filtering-groupby-having)
9. [Relational Queries & Eager Loading (`include`, `thenInclude`)](#9-relational-queries--eager-loading-include-theninclude)
   - [One-to-One & One-to-Many](#one-to-one--one-to-many)
   - [Deep Nested Relations (`thenInclude`)](#deep-nested-relations-theninclude)
10. [Native Full-Text Search (`whereSearch`)](#10-native-full-text-search-wheresearch)
11. [AI Vector Search & Embeddings (`nearest`)](#11-ai-vector-search--embeddings-nearest)
12. [JSON Document Querying (`whereJson`)](#12-json-document-querying-wherejson)
13. [Subqueries & Common Table Expressions (CTEs)](#13-subqueries--common-table-expressions-ctes)
    - [Existence Predicates (`whereExists`, `whereNotExists`)](#existence-predicates-whereexists-wherenotexists)
    - [Common Table Expressions (`withCte`, `withRecursiveCte`)](#common-table-expressions-withcte-withrecursivecte)
14. [Pessimistic Row-Level Locking (`lock`)](#14-pessimistic-row-level-locking-lock)
15. [Performance Optimizations](#15-performance-optimizations)
    - [Untracked Queries (`asNoTracking`)](#untracked-queries-asnotracking)
    - [Query Caching (Memory & Redis)](#query-caching-memory--redis)
    - [Large Dataset Streaming (`chunk`)](#large-dataset-streaming-chunk)
16. [Soft Delete & Multi-Tenancy Filter Overrides](#16-soft-delete--multi-tenancy-filter-overrides)
17. [Direct Batch Mutations (In-Database Execution)](#17-direct-batch-mutations-in-database-execution)
    - [`executeUpdate`](#executeupdate)
    - [`executeDelete`](#executedelete)
18. [Bulk Operations (`bulkInsert`, `bulkUpsert`, `bulkUpdate`, `bulkDelete`)](#18-bulk-operations-bulkinsert-bulkupsert-bulkupdate-bulkdelete)
19. [Raw SQL & Stored Procedures](#19-raw-sql--stored-procedures)
20. [Complex & Advanced Real-World Queries](#20-complex--advanced-real-world-queries)
    - [Dynamic Search & Multi-Param Filtering Engine](#dynamic-search--multi-param-filtering-engine)
    - [Multi-Table Join with Aliasing & Grouped Aggregates](#multi-table-join-with-aliasing--grouped-aggregates)
    - [Hierarchical Recursive CTE (Org Tree / Taxonomy)](#hierarchical-recursive-cte-org-tree--taxonomy)
    - [Correlated Subquery with Proxy Field Comparison](#correlated-subquery-with-proxy-field-comparison)
    - [Hybrid Semantic Vector & Full-Text Search (RAG Fusion)](#hybrid-semantic-vector--full-text-search-rag-fusion)
    - [High-Concurrency Background Worker with Skip-Locked Queue](#high-concurrency-background-worker-with-skip-locked-queue)
    - [Complex Nested JSON Path Extraction & Filtering](#complex-nested-json-path-extraction--filtering)
    - [Window Functions & Partitioned Running Totals](#window-functions--partitioned-running-totals)
    - [Atomic In-Database Conditional Updates with Case Expressions](#atomic-in-database-conditional-updates-with-case-expressions)
    - [Multi-Tenant Isolation Override with Cross-Tenant Aggregation](#multi-tenant-isolation-override-with-cross-tenant-aggregation)

---

## 1. Sample Entities & Setup

```typescript
import {
  DbContext,
  DbContextOptionsBuilder,
  Entity,
  Table,
  Column,
  PrimaryKey,
  HasMany,
  BelongsTo,
  SoftDelete,
  CreatedAt,
  UpdatedAt,
  Vector,
  DbSet,
} from 'entityts';

@Entity()
@Table('users')
@SoftDelete({ column: 'deleted_at' })
export class User {
  @PrimaryKey({ autoIncrement: true })
  @Column()
  public id!: number;

  @Column()
  public name!: string;

  @Column()
  public email!: string;

  @Column()
  public role!: string;

  @Column()
  public age!: number;

  @Column()
  public isActive!: boolean;

  @Column({ nullable: true })
  public department?: string;

  @Column({ type: 'json', nullable: true })
  public metadata?: Record<string, any>;

  @Vector({ dimensions: 1536 })
  @Column({ nullable: true })
  public embedding?: number[];

  @CreatedAt()
  @Column()
  public createdAt!: Date;

  @UpdatedAt()
  @Column()
  public updatedAt!: Date;

  @Column({ nullable: true })
  public deletedAt?: Date;

  @HasMany(() => Post, { foreignKey: 'userId' })
  public posts?: Post[];
}

@Entity()
@Table('posts')
export class Post {
  @PrimaryKey({ autoIncrement: true })
  @Column()
  public id!: number;

  @Column()
  public userId!: number;

  @Column()
  public title!: string;

  @Column()
  public content!: string;

  @Column()
  public views!: number;

  @Column()
  public isPublished!: boolean;

  @BelongsTo(() => User, { foreignKey: 'userId' })
  public author?: User;
}

export class AppDbContext extends DbContext {
  public users = this.set(User);
  public posts = this.set(Post);
}
```

---

## 2. Pure LINQ Lambda Predicates (`where`)

EntityTS parses JavaScript/TypeScript lambda expressions directly into parameterized SQL abstract syntax trees (ASTs).

### Basic Comparisons

```typescript
// Equality
const users = await db.users.where(u => u.role === 'admin').toList();

// Inequality
const nonGuests = await db.users.where(u => u.role !== 'guest').toList();

// Relational comparisons (<, <=, >, >=)
const adults = await db.users.where(u => u.age >= 18).toList();
const seniors = await db.users.where(u => u.age > 65).toList();
const minors = await db.users.where(u => u.age < 18).toList();
```

### Compound Conditions (`&&`, `||`)

```typescript
// Logical AND
const activeAdmins = await db.users.where(u => u.role === 'admin' && u.isActive === true).toList();

// Logical OR with grouping
const priorityUsers = await db.users
  .where(u => (u.role === 'admin' || u.role === 'manager') && u.age >= 21)
  .toList();
```

### Boolean Shorthand

```typescript
// Shorthand truthy check
const activeUsers = await db.users.where(u => u.isActive).toList();

// Shorthand falsy check (negation)
const inactiveUsers = await db.users.where(u => !u.isActive).toList();
```

### Null & Undefined Checks

```typescript
// IS NULL
const unassignedUsers = await db.users.where(u => u.department === null).toList();

// IS NOT NULL
const assignedUsers = await db.users.where(u => u.department !== null).toList();
```

### String Pattern Matching (`startsWith`, `endsWith`, `includes`)

```typescript
// LIKE 'Alice%'
const nameMatches = await db.users.where(u => u.name.startsWith('Alice')).toList();

// LIKE '%@company.com'
const corporateUsers = await db.users.where(u => u.email.endsWith('@company.com')).toList();

// LIKE '%engineer%'
const engineers = await db.users.where(u => u.role.includes('engineer')).toList();
```

### Array Membership (`IN` Operator)

```typescript
const allowedRoles = ['admin', 'manager', 'lead'];

// Compiles to: WHERE role IN ('admin', 'manager', 'lead')
const privilegedUsers = await db.users.where(u => allowedRoles.includes(u.role)).toList();

// Inline array
const tierUsers = await db.users.where(u => [1, 2, 3].includes(u.id)).toList();
```

### Closure & Runtime In-Memory Fallback

If an expression uses dynamic runtime methods or complex closures that cannot translate to SQL, EntityTS applies an in-memory fallback filter seamlessly:

```typescript
const isEligible = (name: string, age: number) => name.length > 3 && age % 2 === 0;

const customMatches = await db.users.where(u => isEligible(u.name, u.age)).toList();
```

---

## 3. Materialization & Query Execution

Queries are lazily constructed and only execute against the database adapter when terminal methods are called.

### `toList()` / `toArray()`

Executes the query and returns all matching records as an array:

```typescript
const allUsers = await db.users.where(u => u.isActive).toList();
```

### `first()` & `firstOrDefault()`

```typescript
// Returns the first matching entity or throws EntityNotFoundException if none found
const firstAdmin = await db.users.where(u => u.role === 'admin').first();

// Returns the first matching entity or null if not found
const user = await db.users.where(u => u.email === 'alice@example.com').firstOrDefault();
```

### `single()` & `singleOrDefault()`

```typescript
// Throws if 0 matching records, or if more than 1 record matches
const rootUser = await db.users.where(u => u.id === 1).single();

// Returns the single entity or null if not found; throws if more than 1 matches
const uniqueUser = await db.users.where(u => u.email === 'unique@example.com').singleOrDefault();
```

---

## 4. Sorting, Limiting & Slicing

### Ordering (`orderBy`, `thenBy`)

```typescript
// Single column ascending & descending
const oldest = await db.users.orderByDescending(u => u.age).toList();
const newest = await db.users.orderBy(u => u.createdAt).toList();

// Multi-column sorting (ORDER BY role ASC, age DESC, name ASC)
const sortedTeam = await db.users
  .orderBy(u => u.role)
  .thenByDescending(u => u.age)
  .thenBy(u => u.name)
  .toList();
```

### Offset Limiting (`skip`, `take`)

```typescript
// Equivalent to LIMIT 10 OFFSET 20
const page3 = await db.users
  .orderBy(u => u.id)
  .skip(20)
  .take(10)
  .toList();
```

---

## 5. Pagination Patterns

### Traditional Page-Number Pagination (`toPagedList`)

Provides total counts, page number, total pages, and navigation flags:

```typescript
const result = await db.users
  .where(u => u.isActive)
  .orderBy(u => u.createdAt)
  .toPagedList({ page: 2, pageSize: 25 });

console.log(result.items); // Array of 25 users
console.log(result.totalCount); // Total matching users (e.g. 520)
console.log(result.totalPages); // 21
console.log(result.pageNumber); // 2
console.log(result.hasNextPage); // true
console.log(result.hasPrevPage); // true
```

### Keyset / Cursor-Based Pagination (`toCursorPage`)

Infinite scrolling and high-performance pagination that scales effortlessly past millions of rows:

```typescript
// First page
const page1 = await db.users
  .where(u => u.isActive)
  .toCursorPage({
    limit: 20,
    cursorColumn: 'id',
    order: 'ASC',
  });

const nextToken = page1.nextCursor;

// Second page using cursor token
const page2 = await db.users
  .where(u => u.isActive)
  .toCursorPage({
    limit: 20,
    cursor: nextToken,
    cursorColumn: 'id',
    order: 'ASC',
  });

console.log(page2.items); // Next 20 items
console.log(page2.hasNextPage); // Flag indicating more items exist
```

---

## 6. Projections & Deduplication (`select`, `distinct`)

### Typed Object Projection

Extract only necessary columns or transform records directly:

```typescript
// Project into a transformed structure
const summaries = await db.users
  .where(u => u.isActive)
  .select(u => ({
    userId: u.id,
    display: `${u.name} (${u.role})`,
    contact: u.email,
  }))
  .toList();

// Select specific column array
const emails = await db.users
  .where(u => u.role === 'admin')
  .select(['id', 'email'])
  .toList();
```

### Deduplication (`distinct`)

```typescript
// SELECT DISTINCT department FROM users WHERE isActive = true
const departments = await db.users
  .where(u => u.isActive)
  .select(u => ({ department: u.department }))
  .distinct()
  .toList();
```

---

## 7. Aggregations & Quantifiers

### Scalar Aggregates (`count`, `sum`, `avg`, `min`, `max`)

```typescript
// Total count
const totalActive = await db.users.where(u => u.isActive).count();

// Sum of column
const totalViews = await db.posts.sum(p => p.views);

// Average
const averageAge = await db.users.where(u => u.isActive).avg(u => u.age);

// Minimum & Maximum
const youngestAge = await db.users.min(u => u.age);
const highestViews = await db.posts.max(p => p.views);
```

### Quantifiers (`any`, `all`)

```typescript
// Check if any matching record exists (SELECT EXISTS)
const hasSuperAdmin = await db.users.any(u => u.role === 'superadmin');

// Check if all records meet criteria
const allVerified = await db.users.all(u => u.isActive);
```

---

## 8. Grouping & Aggregate Filtering (`groupBy`, `having`)

```typescript
// Group by department and aggregate counts and averages
const stats = await db.users
  .groupBy(u => u.department)
  .select(g => ({
    department: g.key,
    headcount: g.count(),
    averageAge: g.avg(u => u.age),
    maxAge: g.max(u => u.age),
  }))
  .having(g => g.count() > 5)
  .toList();
```

---

## 9. Relational Queries & Eager Loading (`include`, `thenInclude`)

### One-to-One & One-to-Many

Avoid N+1 queries by eager-loading related tables in unified joins:

```typescript
// Load users along with their authored posts
const usersWithPosts = await db.users
  .where(u => u.isActive)
  .include('posts')
  .toList();

for (const user of usersWithPosts) {
  console.log(`User ${user.name} wrote ${user.posts?.length ?? 0} posts.`);
}
```

### Deep Nested Relations (`thenInclude`)

```typescript
// Load authors, their posts, and comments on those posts
const deepGraph = await db.users.include('posts').thenInclude('comments').toList();
```

---

## 10. Native Full-Text Search (`whereSearch`)

Generates dialect-optimized SQL search expressions:

- **PostgreSQL**: `to_tsvector` and `plainto_tsquery` / `websearch_to_tsquery`
- **MySQL**: `MATCH(...) AGAINST(... IN BOOLEAN MODE)`
- **SQL Server**: `CONTAINS(...)`
- **SQLite**: Multi-column `LIKE` fallback

```typescript
// Search across both title and content
const matchingArticles = await db.posts
  .whereSearch(['title', 'content'], 'PostgreSQL performance optimization')
  .where(p => p.isPublished)
  .orderByDescending(p => p.views)
  .toList();
```

---

## 11. AI Vector Search & Embeddings (`nearest`)

Supports semantic vector search using **pgvector**:

- `cosine`: Cosine distance operator (`<=>`)
- `l2`: Euclidean distance operator (`<->`)
- `inner_product`: Negative inner product operator (`<#>`)

```typescript
const queryEmbedding = [0.012, -0.045, 0.089 /* ...1536 dimensions */];

// Find top 10 most relevant users by semantic similarity
const nearestExperts = await db.users
  .nearest('embedding', queryEmbedding, 10, 'cosine')
  .where(u => u.isActive)
  .toList();
```

---

## 12. JSON Document Querying (`whereJson`)

Query JSON/JSONB columns with cross-database dialect normalization:

```typescript
// Extracts JSON path 'settings.theme' and compares to 'dark'
const darkThemeUsers = await db.users.whereJson('metadata.settings.theme', '=', 'dark').toList();

// Check nested array containment or numeric property
const proPlanUsers = await db.users
  .whereJson('metadata.subscription.tier', '=', 'enterprise')
  .toList();
```

---

## 13. Subqueries & Common Table Expressions (CTEs)

### Existence Predicates (`whereExists`, `whereNotExists`)

```typescript
// Find users who have published at least one post
const activeAuthors = await db.users
  .whereExists(sub => sub.from(Post).where(p => p.userId === sub.parent.id && p.isPublished))
  .toList();

// Find users who have NO posts
const silentUsers = await db.users
  .whereNotExists(sub => sub.from(Post).where(p => p.userId === sub.parent.id))
  .toList();
```

### Common Table Expressions (`withCte`, `withRecursiveCte`)

```typescript
// Define a CTE for active users
const query = await db.users
  .withCte('ActiveStaff', sub =>
    sub.from(User).where(u => u.isActive && u.department === 'Engineering'),
  )
  .where(u => u.role === 'Lead')
  .toList();
```

---

## 14. Pessimistic Row-Level Locking (`lock`)

Guarantees transactional consistency for worker queues, inventory deduction, and wallet balances:

| Lock Mode       | PostgreSQL / CockroachDB | MySQL / PlanetScale      | SQL Server (MSSQL)                  |
| :-------------- | :----------------------- | :----------------------- | :---------------------------------- |
| `'pessimistic'` | `FOR UPDATE`             | `FOR UPDATE`             | `WITH (UPDLOCK, ROWLOCK, HOLDLOCK)` |
| `'shared'`      | `FOR SHARE`              | `LOCK IN SHARE MODE`     | `WITH (HOLDLOCK, ROWLOCK)`          |
| `'no-wait'`     | `FOR UPDATE NOWAIT`      | `FOR UPDATE NOWAIT`      | `WITH (UPDLOCK, ROWLOCK, NOWAIT)`   |
| `'skip-locked'` | `FOR UPDATE SKIP LOCKED` | `FOR UPDATE SKIP LOCKED` | `WITH (UPDLOCK, ROWLOCK, READPAST)` |

```typescript
await db.transaction(async tx => {
  // Lock job queue item so competing background workers skip it
  const nextJob = await tx
    .set(Post)
    .where(p => !p.isPublished)
    .orderBy(p => p.id)
    .lock('skip-locked')
    .firstOrDefault();

  if (nextJob) {
    nextJob.isPublished = true;
    await tx.saveChanges();
  }
});
```

---

## 15. Performance Optimizations

### Untracked Queries (`asNoTracking`)

Disables identity mapping and snapshot tracking in `ChangeTracker`. Essential for read-only reports and high-concurrency APIs:

```typescript
const feed = await db.posts
  .asNoTracking()
  .where(p => p.isPublished)
  .orderByDescending(p => p.views)
  .take(50)
  .toList();
```

### Query Caching (Memory & Redis)

Cache identical queries for a defined duration without repeating database hits:

```typescript
const systemConfig = await db.users
  .where(u => u.role === 'admin')
  .cache({
    ttlMs: 60 * 1000, // Cache for 60 seconds
    key: 'active-admin-users', // Optional custom cache key
  })
  .toList();
```

### Large Dataset Streaming (`chunk`)

Process massive tables batch by batch without running out of RAM:

```typescript
await db.users
  .where(u => u.isActive)
  .chunk(500, async batch => {
    for (const user of batch) {
      await sendMonthlyDigest(user.email);
    }
  });
```

---

## 16. Soft Delete & Multi-Tenancy Filter Overrides

```typescript
// Query active records (automatically filters out soft-deleted rows)
const activePosts = await db.posts.toList();

// Include soft-deleted rows in the query
const allPostsIncludingTrash = await db.posts.withDeleted().toList();

// Query ONLY soft-deleted rows (Trash Bin view)
const trashBin = await db.posts.onlyDeleted().toList();

// Bypass global multi-tenant filter or global query filters
const systemWideAudit = await db.users.ignoreQueryFilters().toList();
```

---

## 17. Direct Batch Mutations (In-Database Execution)

Executes updates and deletes directly in the database without loading entities into Node.js memory.

### `executeUpdate`

```typescript
// Increment views and toggle status atomically in SQL:
// UPDATE posts SET views = views + 1, isPublished = true WHERE userId = 42
const updatedCount = await db.posts
  .where(p => p.userId === 42)
  .executeUpdate(builder => builder.set(p => p.isPublished, true).increment(p => p.views, 1));

console.log(`Updated ${updatedCount} rows directly in SQL.`);
```

### `executeDelete`

```typescript
// Compiles to: DELETE FROM posts WHERE isPublished = false AND views = 0
const deletedCount = await db.posts.where(p => !p.isPublished && p.views === 0).executeDelete();

console.log(`Deleted ${deletedCount} unviewed draft posts.`);
```

---

## 18. Bulk Operations (`bulkInsert`, `bulkUpsert`, `bulkUpdate`, `bulkDelete`)

For bulk data ingestion (1,000 to 100,000+ rows) using multi-row batching:

```typescript
// High-speed bulk insert
await db.users.bulkInsert(newUsersList, { batchSize: 1000 });

// Native bulk upsert (INSERT ... ON CONFLICT / ON DUPLICATE KEY UPDATE)
await db.users.bulkUpsert(importedUsers, {
  conflictColumns: ['email'],
  updateColumns: ['name', 'age', 'updatedAt'],
  batchSize: 500,
});

// Bulk update existing records
await db.users.bulkUpdate(modifiedUsers, { batchSize: 500 });

// Bulk delete by primary keys
await db.users.bulkDelete([101, 102, 103, 104]);
```

---

## 19. Raw SQL & Stored Procedures

### Parameterized Raw SQL (`fromSql`)

```typescript
const minAge = 30;
const status = 'active';

// Safe interpolation compiles to parameterized query: $1, $2 (or ?, @p1)
const rawUsers = await db.users
  .fromSql`SELECT * FROM users WHERE age >= ${minAge} AND role = ${status}`.toList();
```

### Stored Procedures with Typed Inputs, Outputs & Multiple Result Sets

```typescript
// Execute stored procedure with input and output parameters
const result = await db
  .createStoredProcedure('sp_GenerateMonthlyReport')
  .input({
    year: 2026,
    month: 10,
    department: 'Engineering',
  })
  .query<ReportRow>();

console.log('Report Rows:', result);

// Multiple result sets
const { rows, output } = await db
  .createStoredProcedure('sp_GetUserDetails')
  .input({ userId: 42 })
  .output<{ totalOrders: number }>()
  .query<User>();
```

---

## 20. Complex & Advanced Real-World Queries

### Dynamic Search & Multi-Param Filtering Engine

A production API pattern where incoming request filters (search keyword, status, category, date range, pagination, sorting) are dynamically compiled without string concatenation or SQL injection risks:

```typescript
interface UserFilterDto {
  search?: string;
  roles?: string[];
  minAge?: number;
  maxAge?: number;
  isActive?: boolean;
  department?: string;
  createdAfter?: Date;
  sortBy?: 'name' | 'age' | 'createdAt';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

async function searchUsers(db: AppDbContext, filters: UserFilterDto) {
  let query = db.users.asNoTracking();

  // 1. Text search across name or email
  if (filters.search) {
    const term = filters.search.trim();
    query = query.where(u => u.name.includes(term) || u.email.includes(term));
  }

  // 2. Role array containment (IN operator)
  if (filters.roles && filters.roles.length > 0) {
    const roles = filters.roles;
    query = query.where(u => roles.includes(u.role));
  }

  // 3. Relational bounds
  if (filters.minAge !== undefined) {
    const min = filters.minAge;
    query = query.where(u => u.age >= min);
  }
  if (filters.maxAge !== undefined) {
    const max = filters.maxAge;
    query = query.where(u => u.age <= max);
  }

  // 4. Direct exact matches
  if (filters.isActive !== undefined) {
    const active = filters.isActive;
    query = query.where(u => u.isActive === active);
  }
  if (filters.department) {
    const dept = filters.department;
    query = query.where(u => u.department === dept);
  }
  if (filters.createdAfter) {
    const after = filters.createdAfter;
    query = query.where(u => u.createdAt >= after);
  }

  // 5. Dynamic Sorting
  const order = filters.sortOrder === 'DESC' ? 'DESC' : 'ASC';
  if (filters.sortBy === 'age') {
    query = order === 'DESC' ? query.orderByDescending(u => u.age) : query.orderBy(u => u.age);
  } else if (filters.sortBy === 'name') {
    query = order === 'DESC' ? query.orderByDescending(u => u.name) : query.orderBy(u => u.name);
  } else {
    query =
      order === 'DESC'
        ? query.orderByDescending(u => u.createdAt)
        : query.orderBy(u => u.createdAt);
  }

  // 6. Paginated Result
  return await query.toPagedList({
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  });
}
```

---

### Multi-Table Join with Aliasing & Grouped Aggregates

Using `QueryBuilder` for multi-table relational joins with custom column expressions, grouping, and alias resolution:

```typescript
import { QueryBuilder } from 'entityts';

// Join orders, users, and order_items with table aliases
const qb = new QueryBuilder(db.adapter, 'orders', 'o')
  .join('INNER', 'users', 'o.userId', 'u.id', 'u')
  .join('LEFT', 'order_items', 'o.id', 'oi.orderId', 'oi')
  .select(
    'u.id AS customerId',
    'u.name AS customerName',
    'COUNT(DISTINCT o.id) AS totalOrders',
    'SUM(oi.price * oi.quantity) AS totalSpent',
    'AVG(o.totalAmount) AS averageOrderValue',
  )
  .where(w => {
    w.eq('u.isActive', true).gte('o.createdAt', new Date('2026-01-01')).ne('o.status', 'cancelled');
  })
  .groupBy('u.id', 'u.name')
  .having(h => h.gt('SUM(oi.price * oi.quantity)', 5000))
  .orderBy('totalSpent', 'DESC')
  .take(10);

const { sql, params } = qb.toSelectSql();
const topCustomers = await db.adapter.query(sql, params);
```

---

### Hierarchical Recursive CTE (Org Tree / Taxonomy)

Compute arbitrary depth tree hierarchies (managers & reports, category taxonomies, folder trees) using `withCte` recursive compilation:

```typescript
// Define root of recursive CTE: Root managers (managerId IS NULL)
const rootManagersQuery = db.set('employees').where(w => w.isNull('managerId'));

// Compile recursive CTE to traverse all levels of management
const orgTreeQuery = db
  .set('employees')
  .withCte('org_tree', rootManagersQuery, true)
  .where(e => e.department === 'Engineering')
  .orderBy(e => e.id);

// Generates:
// WITH RECURSIVE "org_tree" AS (
//   SELECT * FROM "employees" WHERE "managerId" IS NULL
// )
// SELECT * FROM "employees" WHERE "department" = @p0 ORDER BY "id" ASC
const treeHierarchy = await orgTreeQuery.toList();
```

---

### Correlated Subquery with Proxy Field Comparison

Match records in the outer table against dynamic columns of an inner subquery without hardcoded subquery SQL:

```typescript
// Find all customers who have placed an order with a total greater than $1,000
const highValueOrdersSub = db
  .set('orders')
  .where(w => w.gt('totalAmount', 1000))
  .asSubquery('hvo');

// Correlated WHERE EXISTS with lambda field proxy:
// WHERE EXISTS (
//   SELECT 1 FROM "orders" AS "hvo"
//   WHERE "totalAmount" > 1000 AND ("users"."id" = "hvo"."userId")
// )
const vips = await db.users
  .whereExists(highValueOrdersSub, (user, hvo) => {
    user.id.eq(hvo.userId);
  })
  .orderByDescending(u => u.createdAt)
  .toList();
```

---

### Hybrid Semantic Vector & Full-Text Search (RAG Fusion)

Combines pgvector dense embedding similarity search with native full-text keyword matching to achieve hybrid retrieval (Reciprocal Rank Fusion) for AI & LLM applications:

```typescript
async function hybridArticleSearch(
  db: AppDbContext,
  searchQuery: string,
  queryEmbedding: number[],
  topK = 10,
) {
  // 1. Vector semantic search (captures concepts & meaning)
  const semanticResults = await db.posts
    .nearest('embedding', queryEmbedding, topK * 2, 'cosine')
    .where(p => p.isPublished)
    .select(['id', 'title', 'content'])
    .toList();

  // 2. Full-text search (captures exact terminology & keywords)
  const keywordResults = await db.posts
    .whereSearch(['title', 'content'], searchQuery)
    .where(p => p.isPublished)
    .orderByDescending(p => p.views)
    .take(topK * 2)
    .select(['id', 'title', 'content'])
    .toList();

  // 3. Reciprocal Rank Fusion (RRF) to merge score ranks
  const rrfConstant = 60;
  const scoreMap = new Map<number, { post: (typeof semanticResults)[0]; score: number }>();

  semanticResults.forEach((post, rank) => {
    const current = scoreMap.get(post.id) || { post, score: 0 };
    current.score += 1 / (rrfConstant + rank + 1);
    scoreMap.set(post.id, current);
  });

  keywordResults.forEach((post, rank) => {
    const current = scoreMap.get(post.id) || { post, score: 0 };
    current.score += 1 / (rrfConstant + rank + 1);
    scoreMap.set(post.id, current);
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(x => x.post);
}
```

---

### High-Concurrency Background Worker with Skip-Locked Queue

Distribute job processing across multiple competing worker nodes without double-processing or lock wait delays:

```typescript
async function processNextQueueJob(db: AppDbContext, workerId: string) {
  return await db.transaction(async tx => {
    // 1. Atomically claim next pending job, skipping any locked by other workers
    const job = await tx
      .set('background_jobs')
      .where(j => j.status === 'PENDING' && j.runAt <= new Date())
      .orderBy(j => j.priority)
      .thenBy(j => j.id)
      .lock('skip-locked') // FOR UPDATE SKIP LOCKED
      .firstOrDefault();

    if (!job) {
      return null; // No jobs available right now
    }

    // 2. Mark claimed by this worker
    job.status = 'PROCESSING';
    job.lockedBy = workerId;
    job.lockedAt = new Date();
    await tx.saveChanges();

    return job;
  });
}
```

---

### Complex Nested JSON Path Extraction & Filtering

Query deeply nested JSON documents and dynamic properties across PostgreSQL, MySQL, and SQLite:

```typescript
// Query users with specific nested preferences
const targetedUsers = await db.users
  .where(u => u.isActive)
  // Deep property comparison: metadata.preferences.notifications.email === true
  .whereJson('metadata.preferences.notifications.email', '=', true)
  // Numeric comparison: metadata.billing.storageUsedGb > 50
  .whereJson('metadata.billing.storageUsedGb', '>', 50)
  // Nested string array or enum comparison
  .whereJson('metadata.security.mfaType', '=', 'hardware_key')
  .toList();
```

---

### Window Functions & Partitioned Running Totals

Compute running totals, rankings, and moving averages directly using raw SQL execution alongside typed Entity models:

```typescript
interface RankedUserPost {
  userId: number;
  userName: string;
  postId: number;
  title: string;
  views: number;
  rankInAuthor: number;
  cumulativeViews: number;
}

// Compute rank within author and running total of views per author
const rankedPosts = await db.posts.fromSql<RankedUserPost>`
  SELECT 
    p.user_id AS "userId",
    u.name AS "userName",
    p.id AS "postId",
    p.title AS "title",
    p.views AS "views",
    ROW_NUMBER() OVER (
      PARTITION BY p.user_id 
      ORDER BY p.views DESC
    ) AS "rankInAuthor",
    SUM(p.views) OVER (
      PARTITION BY p.user_id 
      ORDER BY p.created_at ASC 
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS "cumulativeViews"
  FROM posts p
  INNER JOIN users u ON p.user_id = u.id
  WHERE p.is_published = true
  ORDER BY p.user_id, "rankInAuthor"
`.toList();
```

---

### Atomic In-Database Conditional Updates with Case Expressions

Update rows conditionally in a single round-trip without in-memory race conditions:

```typescript
// Batch recalculate engagement scores based on views and post age
const affectedRows = await db.posts
  .where(p => p.isPublished)
  .executeUpdate(builder => {
    builder.increment(p => p.views, 1).set(p => p.updatedAt, new Date());
  });

console.log(`Incremented views across ${affectedRows} published posts.`);
```

---

### Multi-Tenant Isolation Override with Cross-Tenant Aggregation

Safely execute multi-tenant business logic with automatic tenant filters while retaining global administrative reporting capability:

```typescript
// 1. Regular tenant query (automatically filtered by GlobalQueryFilter: tenant_id = 'tenant_123')
const tenantUsers = await db.users.where(u => u.isActive).toList();

// 2. Global administrative query bypassing tenant scoping and soft-deletes
const platformStats = await db.users
  .ignoreQueryFilters() // Disables tenant filter AND soft-delete filter
  .withDeleted()
  .groupBy(u => u.department)
  .select(g => ({
    department: g.key,
    totalAccounts: g.count(),
    averageAge: g.avg(u => u.age),
  }))
  .toList();
```

---

## 21. Docker Execution & Automated Query Verification

EntityTS includes a single, self-contained `Dockerfile` designed to build, bundle, and execute all query patterns in an isolated container environment without requiring external database servers.

### Build Container

```bash
docker build -t entityts-queries .
```

### Run Query Test Suite in Docker

```bash
docker run --rm entityts-queries
```

### Interactive Exploration inside Container

```bash
docker run --rm -it entityts-queries /bin/bash
```

The Docker image encapsulates:

- Node.js 22 LTS on Debian Bookworm Slim with native C++ compilation tooling (`better-sqlite3`).
- Activated `pnpm` package manager.
- Zero-external-dependency in-memory SQLite database execution validating every single LINQ and SQL query pattern.
- Automated assertion suite in [`tests/QueryCookbook.spec.ts`](file:///Users/nitishmahendraprajapati/Documents/Developer/EntityTS/tests/QueryCookbook.spec.ts).

---

## Community, Support & Feedback

- **GitHub Repository**: [github.com/nitishprajapati5/EntityTS](https://github.com/nitishprajapati5/EntityTS)
- **Discussions & Q&A**: [GitHub Discussions](https://github.com/nitishprajapati5/EntityTS/discussions)
- **Report an Issue**: [GitHub Issues](https://github.com/nitishprajapati5/EntityTS/issues/new/choose)
- **Official Documentation**: [nitishprajapati5.github.io/EntityTS](https://nitishprajapati5.github.io/EntityTS/)
