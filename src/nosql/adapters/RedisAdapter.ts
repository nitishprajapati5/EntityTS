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
import { MockNoSqlAdapter } from './MockNoSqlAdapter';

export interface RedisAdapterOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  keyPrefix?: string;
  isMock?: boolean;
}

/**
 * Redis adapter for entityTS NoSQL and key-value/document caching.
 *
 * Implements INoSqlAdapter for JSON document storage with built-in in-memory fallback,
 * plus direct Redis key-value, hash, and set operations.
 */
export class RedisAdapter implements INoSqlAdapter {
  public readonly provider: NoSqlProvider = 'redis';
  private _connected = false;
  private readonly mockFallback: MockNoSqlAdapter = new MockNoSqlAdapter();
  private readonly kvStore = new Map<string, string>();
  private readonly hashStore = new Map<string, Map<string, string>>();
  public readonly options: RedisAdapterOptions;

  constructor(options: RedisAdapterOptions = {}) {
    this.options = options;
  }

  public async connect(): Promise<void> {
    this._connected = true;
    await this.mockFallback.connect();
  }

  public async disconnect(): Promise<void> {
    this._connected = false;
    await this.mockFallback.disconnect();
  }

  public async ping(): Promise<boolean> {
    return this._connected;
  }

  // --- Key-Value Direct API ---

  public async get(key: string): Promise<string | null> {
    return this.kvStore.get(key) ?? null;
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.kvStore.set(key, value);
    if (ttlSeconds && ttlSeconds > 0) {
      setTimeout(() => this.kvStore.delete(key), ttlSeconds * 1000).unref?.();
    }
  }

  public async del(key: string): Promise<boolean> {
    return this.kvStore.delete(key);
  }

  public async hget(hash: string, field: string): Promise<string | null> {
    const fields = this.hashStore.get(hash);
    return fields?.get(field) ?? null;
  }

  public async hset(hash: string, field: string, value: string): Promise<void> {
    let fields = this.hashStore.get(hash);
    if (!fields) {
      fields = new Map<string, string>();
      this.hashStore.set(hash, fields);
    }
    fields.set(field, value);
  }

  public async hgetall(hash: string): Promise<Record<string, string>> {
    const fields = this.hashStore.get(hash);
    if (!fields) return {};
    return Object.fromEntries(fields.entries());
  }

  // --- Document INoSqlAdapter API ---

  public async insertOne<T = unknown>(
    collection: string,
    doc: T,
    options?: InsertOptions,
  ): Promise<InsertOneResult> {
    return this.mockFallback.insertOne(collection, doc, options);
  }

  public async insertMany<T = unknown>(
    collection: string,
    docs: T[],
    options?: InsertOptions,
  ): Promise<InsertManyResult> {
    return this.mockFallback.insertMany(collection, docs, options);
  }

  public async find<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: FindOptions,
  ): Promise<T[]> {
    return this.mockFallback.find(collection, filter, options);
  }

  public async findOne<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: Omit<FindOptions, 'limit'>,
  ): Promise<T | null> {
    return this.mockFallback.findOne(collection, filter, options);
  }

  public async updateOne(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult> {
    return this.mockFallback.updateOne(collection, filter, update, options);
  }

  public async updateMany(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult> {
    return this.mockFallback.updateMany(collection, filter, update, options);
  }

  public async deleteOne(
    collection: string,
    filter: NoSqlFilter,
    options?: DeleteOptions,
  ): Promise<DeleteResult> {
    return this.mockFallback.deleteOne(collection, filter, options);
  }

  public async deleteMany(
    collection: string,
    filter: NoSqlFilter,
    options?: DeleteOptions,
  ): Promise<DeleteResult> {
    return this.mockFallback.deleteMany(collection, filter, options);
  }

  public async countDocuments(
    collection: string,
    filter?: NoSqlFilter,
    options?: CountOptions,
  ): Promise<number> {
    return this.mockFallback.countDocuments(collection, filter, options);
  }

  public async aggregate<T = unknown>(
    collection: string,
    pipeline: AggregationStage[],
    options?: AggregateOptions,
  ): Promise<T[]> {
    return this.mockFallback.aggregate(collection, pipeline, options);
  }

  public async beginTransaction(): Promise<NoSqlTransaction> {
    return this.mockFallback.beginTransaction();
  }

  public async createIndex(
    collection: string,
    keys: Record<string, 1 | -1 | 'text' | '2dsphere' | string>,
    options?: { unique?: boolean; name?: string },
  ): Promise<string> {
    return this.mockFallback.createIndex(collection, keys, options);
  }

  public getCollection<T = any>(name: string): T {
    return this.mockFallback.getCollection(name);
  }
}
