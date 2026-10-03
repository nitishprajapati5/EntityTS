import {
  INoSqlAdapter,
  NoSqlProvider,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  FindOptions,
  UpdateOptions,
  DeleteOptions,
  InsertOptions,
  CountOptions,
  AggregateOptions,
  NoSqlTransaction,
  NoSqlFilter,
  NoSqlUpdate,
  AggregationStage,
} from '../INoSqlAdapter';
import { ConnectionException, QueryException } from '../../errors';

export interface MongoDbAdapterConfig {
  /**
   * MongoDB connection URI (e.g. `mongodb://localhost:27017` or `mongodb+srv://...`).
   */
  uri?: string;

  /**
   * Alias for `uri`.
   */
  connectionString?: string;

  /**
   * Target database name.
   */
  database: string;

  /**
   * Maximum connections in the MongoDB driver pool. Defaults to 10.
   */
  maxPoolSize?: number;

  /**
   * Minimum connections maintained in the pool. Defaults to 0.
   */
  minPoolSize?: number;

  /**
   * Connection timeout in milliseconds.
   */
  connectTimeoutMS?: number;

  /**
   * Server selection timeout in milliseconds.
   */
  serverSelectionTimeoutMS?: number;

  /**
   * Whether to enforce TLS/SSL.
   */
  tls?: boolean;

  /**
   * Optional pre-instantiated or mocked MongoClient instance.
   * Useful for testing without spawning an external daemon.
   */
  client?: any;
}

/**
 * MongoDB adapter for entityTS implementing INoSqlAdapter.
 *
 * Provides connection pooling, document CRUD, aggregation pipelines,
 * multi-document ACID transactions via ClientSession, and streaming cursors.
 */
export class MongoDbAdapter implements INoSqlAdapter {
  public readonly provider: NoSqlProvider = 'mongodb';
  private client: any;
  private db: any;
  private isExternalClient = false;

  constructor(private readonly config: MongoDbAdapterConfig | string) {
    if (typeof config === 'object' && config.client) {
      this.client = config.client;
      this.isExternalClient = true;
    }
  }

  public async connect(): Promise<void> {
    if (this.db) {
      return;
    }

    try {
      const dbName = typeof this.config === 'string' ? undefined : this.config.database;

      if (!this.client) {
        const uri =
          typeof this.config === 'string'
            ? this.config
            : this.config.uri || this.config.connectionString || 'mongodb://localhost:27017';

        const clientOptions: Record<string, unknown> = {};
        if (typeof this.config === 'object') {
          if (this.config.maxPoolSize !== undefined)
            clientOptions.maxPoolSize = this.config.maxPoolSize;
          if (this.config.minPoolSize !== undefined)
            clientOptions.minPoolSize = this.config.minPoolSize;
          if (this.config.connectTimeoutMS !== undefined)
            clientOptions.connectTimeoutMS = this.config.connectTimeoutMS;
          if (this.config.serverSelectionTimeoutMS !== undefined)
            clientOptions.serverSelectionTimeoutMS = this.config.serverSelectionTimeoutMS;
          if (this.config.tls !== undefined) clientOptions.tls = this.config.tls;
        }

        const mongoModule = await this.resolveMongoDriver();
        const MongoClient = mongoModule.MongoClient || mongoModule;
        this.client = new MongoClient(uri, clientOptions);
        await this.client.connect();
      }

      if (this.client.db) {
        this.db = this.client.db(dbName);
      } else {
        this.db = this.client;
      }
    } catch (err) {
      throw new ConnectionException(`Failed to connect to MongoDB: ${(err as Error).message}`, err);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client && !this.isExternalClient && typeof this.client.close === 'function') {
      await this.client.close();
    }
    this.db = null;
    if (!this.isExternalClient) {
      this.client = null;
    }
  }

  public async ping(): Promise<boolean> {
    try {
      await this.connect();
      if (this.db && typeof this.db.command === 'function') {
        const res = await this.db.command({ ping: 1 });
        return Boolean(res && (res.ok === 1 || res.ok === true));
      }
      return true;
    } catch {
      return false;
    }
  }

  public getCollection<T = any>(name: string): T {
    if (!this.db) {
      throw new ConnectionException(
        'MongoDB connection is not established. Call connect() before accessing collections.',
      );
    }
    return this.db.collection(name);
  }

  public async insertOne<T = unknown>(
    collection: string,
    doc: T,
    options?: InsertOptions,
  ): Promise<InsertOneResult> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const res = await col.insertOne(
        doc,
        options?.session ? { session: options.session } : undefined,
      );
      return {
        insertedId: res.insertedId,
        acknowledged: res.acknowledged ?? true,
      };
    } catch (err) {
      throw new QueryException(
        `MongoDB insertOne failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async insertMany<T = unknown>(
    collection: string,
    docs: T[],
    options?: InsertOptions,
  ): Promise<InsertManyResult> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const res = await col.insertMany(
        docs,
        options?.session ? { session: options.session } : undefined,
      );
      return {
        insertedIds: res.insertedIds ?? [],
        insertedCount: res.insertedCount ?? (Array.isArray(docs) ? docs.length : 0),
        acknowledged: res.acknowledged ?? true,
      };
    } catch (err) {
      throw new QueryException(
        `MongoDB insertMany failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async find<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: FindOptions,
  ): Promise<T[]> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      let cursor = col.find(
        filter ?? {},
        options?.session ? { session: options.session } : undefined,
      );

      if (options?.projection && typeof cursor.project === 'function') {
        cursor = cursor.project(options.projection);
      }
      if (options?.sort && typeof cursor.sort === 'function') {
        cursor = cursor.sort(options.sort);
      }
      if (typeof options?.skip === 'number' && typeof cursor.skip === 'function') {
        cursor = cursor.skip(options.skip);
      }
      if (typeof options?.limit === 'number' && typeof cursor.limit === 'function') {
        cursor = cursor.limit(options.limit);
      }

      if (typeof cursor.toArray === 'function') {
        return await cursor.toArray();
      }
      return cursor;
    } catch (err) {
      throw new QueryException(
        `MongoDB find failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async findOne<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: Omit<FindOptions, 'limit'>,
  ): Promise<T | null> {
    await this.connect();
    try {
      const col = this.getCollection(collection);

      if (typeof col.findOne === 'function' && !options?.sort && !options?.skip) {
        const findOneOpts: Record<string, unknown> = {};
        if (options?.projection) findOneOpts.projection = options.projection;
        if (options?.session) findOneOpts.session = options.session;
        const res = await col.findOne(filter ?? {}, findOneOpts);
        return res ?? null;
      }

      const results = await this.find<T>(collection, filter, {
        ...options,
        limit: 1,
      });
      return results.length > 0 ? results[0] : null;
    } catch (err) {
      throw new QueryException(
        `MongoDB findOne failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async updateOne(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const atomicUpdate = this.normalizeUpdate(update);
      const updateOpts: Record<string, unknown> = {};
      if (options?.upsert !== undefined) updateOpts.upsert = options.upsert;
      if (options?.session) updateOpts.session = options.session;

      const res = await col.updateOne(filter, atomicUpdate, updateOpts);
      return {
        matchedCount: res.matchedCount ?? 0,
        modifiedCount: res.modifiedCount ?? 0,
        upsertedCount: res.upsertedCount ?? (res.upsertedId ? 1 : 0),
        upsertedId: res.upsertedId,
        acknowledged: res.acknowledged ?? true,
      };
    } catch (err) {
      throw new QueryException(
        `MongoDB updateOne failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async updateMany(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const atomicUpdate = this.normalizeUpdate(update);
      const updateOpts: Record<string, unknown> = {};
      if (options?.upsert !== undefined) updateOpts.upsert = options.upsert;
      if (options?.session) updateOpts.session = options.session;

      const res = await col.updateMany(filter, atomicUpdate, updateOpts);
      return {
        matchedCount: res.matchedCount ?? 0,
        modifiedCount: res.modifiedCount ?? 0,
        upsertedCount: res.upsertedCount ?? (res.upsertedId ? 1 : 0),
        upsertedId: res.upsertedId,
        acknowledged: res.acknowledged ?? true,
      };
    } catch (err) {
      throw new QueryException(
        `MongoDB updateMany failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async deleteOne(
    collection: string,
    filter: NoSqlFilter,
    options?: DeleteOptions,
  ): Promise<DeleteResult> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const res = await col.deleteOne(
        filter,
        options?.session ? { session: options.session } : undefined,
      );
      return {
        deletedCount: res.deletedCount ?? 0,
        acknowledged: res.acknowledged ?? true,
      };
    } catch (err) {
      throw new QueryException(
        `MongoDB deleteOne failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async deleteMany(
    collection: string,
    filter: NoSqlFilter,
    options?: DeleteOptions,
  ): Promise<DeleteResult> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const res = await col.deleteMany(
        filter,
        options?.session ? { session: options.session } : undefined,
      );
      return {
        deletedCount: res.deletedCount ?? 0,
        acknowledged: res.acknowledged ?? true,
      };
    } catch (err) {
      throw new QueryException(
        `MongoDB deleteMany failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async countDocuments(
    collection: string,
    filter?: NoSqlFilter,
    options?: CountOptions,
  ): Promise<number> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const countOpts: Record<string, unknown> = {};
      if (typeof options?.skip === 'number') countOpts.skip = options.skip;
      if (typeof options?.limit === 'number') countOpts.limit = options.limit;
      if (options?.session) countOpts.session = options.session;

      if (typeof col.countDocuments === 'function') {
        return await col.countDocuments(filter ?? {}, countOpts);
      }
      const results = await this.find(collection, filter, options);
      return results.length;
    } catch (err) {
      throw new QueryException(
        `MongoDB countDocuments failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async aggregate<T = unknown>(
    collection: string,
    pipeline: AggregationStage[],
    options?: AggregateOptions,
  ): Promise<T[]> {
    await this.connect();
    try {
      const col = this.getCollection(collection);
      const aggOpts: Record<string, unknown> = {};
      if (options?.session) aggOpts.session = options.session;
      if (options?.allowDiskUse !== undefined) aggOpts.allowDiskUse = options.allowDiskUse;

      const cursor = col.aggregate(pipeline, aggOpts);
      if (typeof cursor.toArray === 'function') {
        return await cursor.toArray();
      }
      return cursor;
    } catch (err) {
      throw new QueryException(
        `MongoDB aggregate failed in '${collection}': ${(err as Error).message}`,
        undefined,
        err,
      );
    }
  }

  public async beginTransaction(): Promise<NoSqlTransaction> {
    await this.connect();
    if (!this.client || typeof this.client.startSession !== 'function') {
      throw new QueryException(
        'MongoDB driver or server does not support sessions/transactions. Multi-document transactions require a replica set.',
      );
    }

    const session = this.client.startSession();
    if (typeof session.startTransaction === 'function') {
      session.startTransaction();
    }

    return {
      session,
      commit: async () => {
        try {
          if (typeof session.commitTransaction === 'function') {
            await session.commitTransaction();
          }
        } finally {
          if (typeof session.endSession === 'function') {
            await session.endSession();
          }
        }
      },
      rollback: async () => {
        try {
          if (typeof session.abortTransaction === 'function') {
            await session.abortTransaction();
          }
        } finally {
          if (typeof session.endSession === 'function') {
            await session.endSession();
          }
        }
      },
    };
  }

  public async *executeStream<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: FindOptions,
  ): AsyncIterable<T> {
    await this.connect();
    const col = this.getCollection(collection);
    let cursor = col.find(
      filter ?? {},
      options?.session ? { session: options.session } : undefined,
    );

    if (options?.projection && typeof cursor.project === 'function') {
      cursor = cursor.project(options.projection);
    }
    if (options?.sort && typeof cursor.sort === 'function') {
      cursor = cursor.sort(options.sort);
    }
    if (typeof options?.skip === 'number' && typeof cursor.skip === 'function') {
      cursor = cursor.skip(options.skip);
    }
    if (typeof options?.limit === 'number' && typeof cursor.limit === 'function') {
      cursor = cursor.limit(options.limit);
    }

    if (Symbol.asyncIterator in cursor) {
      for await (const doc of cursor) {
        yield doc as T;
      }
    } else {
      const items = await this.find<T>(collection, filter, options);
      for (const item of items) {
        yield item;
      }
    }
  }

  /**
   * Normalizes document updates to standard MongoDB operator notation.
   * If update does not contain top-level operator keys (e.g. $set, $inc), it wraps it in $set.
   */
  private normalizeUpdate(update: NoSqlUpdate): Record<string, unknown> {
    const hasOperators = Object.keys(update).some(k => k.startsWith('$'));
    if (hasOperators) {
      return update;
    }
    return { $set: update };
  }

  private async resolveMongoDriver(): Promise<any> {
    const { loadDriver } = await import('../../adapters/DriverLoader');
    return await loadDriver('mongodb' as any, 'mongodb');
  }
}
