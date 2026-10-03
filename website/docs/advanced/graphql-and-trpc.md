---
id: graphql-and-trpc
title: GraphQL & tRPC Integration
sidebar_position: 8
---

# GraphQL & tRPC Integration

EntityTS eliminates API boilerplate by automatically deriving type-safe GraphQL schemas and tRPC routers directly from your entity metadata.

---

## 🚀 GraphQL Schema Generation (`GraphQLSchemaBuilder`)

`GraphQLSchemaBuilder` automatically compiles entity definitions and relationships into standard GraphQL Schema Definition Language (SDL) strings and executable resolver maps.

### Generating SDL & Resolvers

```ts
import { GraphQLSchemaBuilder } from 'entityts';
import { User } from './entities/User';
import { Post } from './entities/Post';

const builder = new GraphQLSchemaBuilder([User, Post]);

// 1. Generate standard GraphQL SDL string
const typeDefs = builder.generateSdl();
console.log(typeDefs);

// 2. Build resolvers wired directly to your DbContext
const resolvers = builder.buildResolvers(dbContext);
```

### Generated Schema Output

The generated SDL includes query, mutation, and input types:

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post]
}

type Query {
  user(id: ID!): User
  users(skip: Int, limit: Int): [User]
}

type Mutation {
  createUser(name: String!, email: String!): User
  updateUser(id: ID!, name: String, email: String): User
  deleteUser(id: ID!): Boolean
}
```

### Solving the N+1 Problem with `DataLoaderBatcher`

To prevent the classic $O(N)$ database queries when traversing relationships, EntityTS provides `DataLoaderBatcher`:

```ts
import { DataLoaderBatcher } from 'entityts';

const batcher = new DataLoaderBatcher<number, Post[]>(async userIds => {
  // Fetches posts for all requested user IDs in a single SQL query
  const posts = await db.posts.where(p => userIds.includes(p.userId)).toList();

  const grouped = new Map<number, Post[]>();
  for (const post of posts) {
    if (!grouped.has(post.userId)) grouped.set(post.userId, []);
    grouped.get(post.userId)!.push(post);
  }

  return userIds.map(id => grouped.get(id) ?? []);
});

// Resolvers load child relations via batcher
const userPosts = await batcher.load(user.id);
```

---

## ⚡ tRPC Router Generation (`TrpcRouterBuilder`)

For full-stack TypeScript applications with Next.js, Remix, or Vite, `TrpcRouterBuilder` creates type-safe procedure routers without writing repetitive CRUD endpoints:

```ts
import { TrpcRouterBuilder } from 'entityts';
import { User } from './entities/User';

// Create type-safe procedure router
const userRouter = TrpcRouterBuilder.createEntityRouter(dbContext, User);

// Inside your tRPC router definition:
export const appRouter = router({
  user: router({
    list: publicProcedure
      .input(z.object({ skip: z.number().optional(), limit: z.number().optional() }))
      .query(opts => userRouter.list.resolve(opts)),
    byId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(opts => userRouter.byId.resolve(opts)),
    create: publicProcedure
      .input(userInputSchema)
      .mutation(opts => userRouter.create.resolve(opts)),
    update: publicProcedure
      .input(userUpdateSchema)
      .mutation(opts => userRouter.update.resolve(opts)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(opts => userRouter.delete.resolve(opts)),
  }),
});
```
