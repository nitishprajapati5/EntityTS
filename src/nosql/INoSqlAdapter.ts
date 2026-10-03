export type NoSqlProvider = 'mongodb' | 'dynamodb' | 'firestore' | 'cosmosdb' | 'redis' | 'mock';

export interface InsertOneResult {
  insertedId: unknown;
  acknowledged?: boolean;
}

export interface InsertManyResult {
  insertedIds: Record<number, unknown> | unknown[];
  insertedCount: number;
  acknowledged?: boolean;
}

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount?: number;
  upsertedId?: unknown;
  acknowledged?: boolean;
}

export interface DeleteResult {
  deletedCount: number;
  acknowledged?: boolean;
}

export interface FindOptions {
  projection?: Record<string, 0 | 1 | boolean>;
  sort?: Record<string, 1 | -1 | 'asc' | 'desc'>;
  skip?: number;
  limit?: number;
  session?: unknown;
}

export interface UpdateOptions {
  upsert?: boolean;
  session?: unknown;
}

export interface DeleteOptions {
  session?: unknown;
}

export interface InsertOptions {
  session?: unknown;
}

export interface CountOptions {
  skip?: number;
  limit?: number;
  session?: unknown;
}

export interface AggregateOptions {
  session?: unknown;
  allowDiskUse?: boolean;
}

export interface NoSqlTransaction {
  readonly session: unknown;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type NoSqlFilter = Record<string, unknown>;
export type NoSqlUpdate = Record<string, unknown>;
export type AggregationStage = Record<string, unknown>;

/**
 * Universal interface for document-oriented (NoSQL) database adapters in entityTS.
 *
 * Implemented by MongoDbAdapter, DynamoDbAdapter, CosmosDbAdapter, FirestoreAdapter, MockNoSqlAdapter.
 */
export interface INoSqlAdapter {
  readonly provider: NoSqlProvider;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;

  insertOne<T = unknown>(
    collection: string,
    doc: T,
    options?: InsertOptions,
  ): Promise<InsertOneResult>;
  insertMany<T = unknown>(
    collection: string,
    docs: T[],
    options?: InsertOptions,
  ): Promise<InsertManyResult>;

  find<T = unknown>(collection: string, filter?: NoSqlFilter, options?: FindOptions): Promise<T[]>;
  findOne<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: Omit<FindOptions, 'limit'>,
  ): Promise<T | null>;

  updateOne(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult>;
  updateMany(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult>;

  deleteOne(
    collection: string,
    filter: NoSqlFilter,
    options?: DeleteOptions,
  ): Promise<DeleteResult>;
  deleteMany(
    collection: string,
    filter: NoSqlFilter,
    options?: DeleteOptions,
  ): Promise<DeleteResult>;

  countDocuments(collection: string, filter?: NoSqlFilter, options?: CountOptions): Promise<number>;

  aggregate<T = unknown>(
    collection: string,
    pipeline: AggregationStage[],
    options?: AggregateOptions,
  ): Promise<T[]>;

  beginTransaction?(): Promise<NoSqlTransaction>;
  executeStream?<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: FindOptions,
  ): AsyncIterable<T>;
  getCollection?<T = any>(name: string): T;
  createIndex?(
    collection: string,
    keys: Record<string, 1 | -1 | 'text' | '2dsphere' | string>,
    options?: { unique?: boolean; name?: string; background?: boolean; ttl?: number },
  ): Promise<string>;
}
