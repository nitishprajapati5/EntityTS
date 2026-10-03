---
id: migrations
title: Migrations & Schema DDL
sidebar_position: 3
---

# Migrations & Schema DDL

EntityTS provides Code-First schema generation, automatic diffing, and programmatic migration management.

---

## Code-First Schema Generation

```ts
import { SchemaGenerator } from 'entityts';

// Ensure all tables defined in context are created
await db.ensureCreated();

// Generate SQL DDL script for current models
const ddl = SchemaGenerator.generateDdl(db, 'postgres');
console.log(ddl);
```

---

## Migration Runner

Programmatic schema migrations with up/down tracking:

```ts
import { MigrationRunner, MigrationBuilder } from 'entityts';

const runner = new MigrationRunner(adapter);

await runner.up([
  {
    name: '20260923_CreateUsers',
    up: async (builder: MigrationBuilder) => {
      builder.createTable('users', table => {
        table.increments('id').primaryKey();
        table.string('name').notNull();
        table.string('email').unique().notNull();
        table.timestamps();
      });
    },
    down: async (builder: MigrationBuilder) => {
      builder.dropTable('users');
    },
  },
]);
```

---

## Automatic Schema Diffing

EntityTS can inspect your live database and compare it directly against your TypeScript entity definitions using `SchemaMigrationDiff`. It detects:

- Missing and extra tables
- Added or dropped columns
- Modified column types and nullability changes

```ts
import { SchemaGenerator, SchemaMigrationDiff } from 'entityts';

const generator = new SchemaGenerator(adapter, [User, Post, Order]);

// Inspect differences between current database state and entity definitions
const diff = await generator.diff();

if (diff.hasChanges) {
  // Automatically generate UP and DOWN migration statements
  const statements = SchemaMigrationDiff.generateStatements(
    diff,
    generator.getEntityMetadatas(),
    adapter,
  );
  console.log('UP Statements:', statements.up);
  console.log('DOWN Statements:', statements.down);
}
```

---

## EntityTS CLI Commands

The `entityts` CLI provides seamless workflow commands for development and CI/CD:

### Generating Migrations

```bash
# Auto-generate a migration file from entity metadata
npx entityts db:migrate:generate AddUserColumns --context ./src/AppDbContext.ts

# Generate an incremental diff migration comparing against the live database
npx entityts db:migrate:generate AddUserColumns --diff --context ./src/AppDbContext.ts

# Scaffold a blank migration template
npx entityts db:migrate:create CustomDataMigration
```

### Applying & Reverting Migrations

```bash
# Apply pending migrations
npx entityts db:migrate --context ./src/AppDbContext.ts

# Revert the last applied batch of migrations
npx entityts db:migrate:revert --context ./src/AppDbContext.ts

# Check status of applied and pending migrations
npx entityts db:migrate:status --context ./src/AppDbContext.ts
```

### Prototyping with Schema Push

```bash
# Preview DDL statements without executing
npx entityts db:push --dry-run --context ./src/AppDbContext.ts

# Apply model changes directly to the database (great for development)
npx entityts db:push --context ./src/AppDbContext.ts
```
