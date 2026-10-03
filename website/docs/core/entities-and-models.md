---
id: entities-and-models
title: Entities & Decorators
sidebar_position: 2
---

# Entities & Decorators

Entity models are standard TypeScript classes decorated with EntityTS metadata annotations.

---

## Model Decorators

| Decorator                              | Description                                |
| -------------------------------------- | ------------------------------------------ |
| `@Entity({ tableName })`               | Marks class as a database table entity     |
| `@PrimaryKey({ autoIncrement })`       | Declares primary key column                |
| `@Column({ type, nullable, default })` | Maps a property to a table column          |
| `@Index({ name, unique })`             | Declares database index                    |
| `@CreatedAt()` / `@UpdatedAt()`        | Automatic timestamp auditing               |
| `@SoftDelete()`                        | Soft deletion with `deletedAt` filtering   |
| `@Version()`                           | Optimistic concurrency integer counter     |
| `@ConcurrencyCheck()`                  | Column-level concurrency check             |
| `@Encrypted()`                         | AES-256 transparent field-level encryption |
| `@HasMany(() => Target, 'fk')`         | One-to-Many relationship                   |
| `@BelongsTo(() => Target, 'fk')`       | Many-to-One relationship                   |
| `@HasOne(() => Target, 'fk')`          | One-to-One relationship                    |
| `@OneToOne(() => Target, options)`     | One-to-One with cascade options            |
| `@OneToMany(() => Target, options)`    | One-to-Many with cascade options           |
| `@ManyToOne(() => Target, options)`    | Many-to-One with cascade options           |

---

## Example Complete Model

```ts
import {
  Entity,
  PrimaryKey,
  Column,
  CreatedAt,
  UpdatedAt,
  SoftDelete,
  Version,
  HasMany,
} from 'entityts';
import { Post } from './Post';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey({ autoIncrement: true })
  id!: number;

  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true })
  email!: string;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;

  @SoftDelete()
  deletedAt?: Date;

  @Version()
  version!: number;

  @OneToMany(() => Post, { foreignKey: 'authorId', cascade: ['insert', 'update', 'delete'] })
  posts?: Post[];
}
```

---

## Cascade Mutations

EntityTS provides full lifecycle cascade handling for `@OneToOne`, `@OneToMany`, and `@ManyToOne` relationships via the Unit of Work:

```ts
import { Entity, PrimaryKey, Column, OneToMany, ManyToOne } from 'entityts';

@Entity({ tableName: 'orders' })
export class Order {
  @PrimaryKey({ autoIncrement: true })
  id!: number;

  @Column()
  orderNumber!: string;

  @OneToMany(() => OrderItem, {
    foreignKey: 'orderId',
    cascade: ['insert', 'update', 'delete'],
  })
  items!: OrderItem[];
}

@Entity({ tableName: 'order_items' })
export class OrderItem {
  @PrimaryKey({ autoIncrement: true })
  id!: number;

  @Column()
  orderId!: number;

  @Column()
  productName!: string;

  @Column()
  price!: number;

  @ManyToOne(() => Order, { foreignKey: 'orderId' })
  order?: Order;
}
```

When saving the parent entity through `DbContext` or `UnitOfWork`:

- **`cascade: ['insert']`**: Any newly appended child entities are automatically assigned the parent's generated primary key and inserted.
- **`cascade: ['update']`**: Modified child entities are automatically updated in the same transaction.
- **`cascade: ['delete']`**: Deleting the parent automatically deletes all referenced child entities in foreign-key dependency order.
