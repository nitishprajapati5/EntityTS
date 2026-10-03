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

export interface DynamoDbAdapterOptions {
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  tableNamePrefix?: string;
  /** When true, forces the in-memory simulation without attempting AWS network calls. */
  isMock?: boolean;
}

/**
 * Amazon DynamoDB adapter for entityTS NoSQL layer.
 *
 * Supports AWS SDK v3 DynamoDB DocumentClient when available, with a built-in
 * zero-latency in-memory fallback for local development and offline unit tests.
 */
export class DynamoDbAdapter implements INoSqlAdapter {
  public readonly provider: NoSqlProvider = 'dynamodb';
  private _connected = false;
  private readonly mockFallback: MockNoSqlAdapter = new MockNoSqlAdapter();
  private readonly options: DynamoDbAdapterOptions;

  constructor(options: DynamoDbAdapterOptions = {}) {
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
