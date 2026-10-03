import {
  INoSqlAdapter,
  NoSqlFilter,
  NoSqlUpdate,
  AggregationStage,
  UpdateResult,
  DeleteResult,
  FindOptions,
} from './INoSqlAdapter';
import { DocumentQuery } from './DocumentQuery';
import { WhereClause, extractColumnName } from '../query/WhereClause';
import { EntityNotFoundException, DbException } from '../errors';

export interface NoSqlPagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export type NoSqlPredicate<T> =
  | Partial<T>
  | ((clause: WhereClause<T> & T) => void | WhereClause<T> | boolean)
  | ((entity: T) => boolean)
  | Record<string, unknown>;

export type NoSqlFieldSelector<T> = (keyof T & string) | ((entity: T) => unknown);

/**
 * LINQ-inspired typed collection for NoSQL / MongoDB document querying and persistence.
 *
 * Mirrors the fluent API and operational patterns of `DbSet<T>`, providing LINQ queries,
 * projections, pagination, aggregations, and CRUD mutations.
 */
export class NoSqlSet<T extends object = any> {
  constructor(
    private readonly adapter: INoSqlAdapter,
    public readonly collectionName: string,
    private readonly query: DocumentQuery<T> = new DocumentQuery<T>(collectionName),
  ) {}

  /**
   * Creates an immutable clone of this NoSqlSet with a cloned query builder.
   */
  private clone(query = this.query.clone()): NoSqlSet<T> {
    return new NoSqlSet<T>(this.adapter, this.collectionName, query);
  }

  // --- LINQ Query Methods ---

  /**
   * Filters documents using a LINQ lambda, WhereClause builder callback, or property criteria.
   *
   * @example
   * ```ts
   * await users.where(u => u.age >= 18 && u.status === 'active').toList();
   * await users.where({ role: 'admin' }).toList();
   * await users.where(w => w.gt('score', 90).eq('verified', true)).toList();
   * ```
   */
  public where(fn: (clause: WhereClause<T> & T) => void | WhereClause<T> | boolean): NoSqlSet<T>;
  public where(predicate: (entity: T) => boolean): NoSqlSet<T>;
  public where(predicate: Partial<T> | Record<string, unknown>): NoSqlSet<T>;
  public where(predicate: any): NoSqlSet<T> {
    const q = this.query.clone();
    q.where(predicate as any);
    return this.clone(q);
  }

  /**
   * Filters documents with an IN array comparison.
   */
  public whereIn<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    values: unknown[],
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.whereIn(field as any, values);
    return this.clone(q);
  }

  /**
   * Filters documents with a NOT IN comparison.
   */
  public whereNotIn<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    values: unknown[],
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.whereNotIn(field as any, values);
    return this.clone(q);
  }

  /**
   * Filters documents with a BETWEEN range comparison.
   */
  public whereBetween<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    low: unknown,
    high: unknown,
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.whereBetween(field as any, low, high);
    return this.clone(q);
  }

  /**
   * Filters documents with a regular expression pattern.
   */
  public whereRegex<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    pattern: string | RegExp,
    options = 'i',
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.whereRegex(field as any, pattern, options);
    return this.clone(q);
  }

  /**
   * Filters documents where a field is null or undefined.
   */
  public whereNull<K extends keyof T & string>(field: K | ((entity: T) => unknown)): NoSqlSet<T> {
    const q = this.query.clone();
    q.whereNull(field as any);
    return this.clone(q);
  }

  /**
   * Filters documents where a field is not null.
   */
  public whereNotNull<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.whereNotNull(field as any);
    return this.clone(q);
  }

  /**
   * Projects only specific fields from the documents.
   *
   * @example
   * ```ts
   * const summaries = await users.select('id', 'name', 'email').toList();
   * ```
   */
  public select<K extends keyof T & string>(
    ...fields: (K | ((entity: T) => unknown))[]
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.select(...(fields as any[]));
    return this.clone(q);
  }

  /**
   * Sorts the documents in ascending order by the given field or selector.
   */
  public orderBy<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    direction: 'asc' | 'desc' = 'asc',
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.orderBy(field as any, direction);
    return this.clone(q);
  }

  /**
   * Sorts the documents in descending order by the given field or selector.
   */
  public orderByDescending<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
  ): NoSqlSet<T> {
    return this.orderBy(field, 'desc');
  }

  /**
   * Chained secondary sort.
   */
  public thenBy<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    direction: 'asc' | 'desc' = 'asc',
  ): NoSqlSet<T> {
    return this.orderBy(field, direction);
  }

  /**
   * Chained secondary descending sort.
   */
  public thenByDescending<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
  ): NoSqlSet<T> {
    return this.orderBy(field, 'desc');
  }

  /**
   * Skips the specified number of documents (LINQ Skip).
   */
  public skip(count: number): NoSqlSet<T> {
    const q = this.query.clone();
    q.skip(count);
    return this.clone(q);
  }

  /**
   * Takes the specified maximum number of documents (LINQ Take / Limit).
   */
  public take(count: number): NoSqlSet<T> {
    const q = this.query.clone();
    q.take(count);
    return this.clone(q);
  }

  public limit(count: number): NoSqlSet<T> {
    return this.take(count);
  }

  public offset(count: number): NoSqlSet<T> {
    return this.skip(count);
  }

  // --- Terminal Query Execution ---

  /**
   * Executes the query and returns the matching documents as an array (LINQ ToList / ToArray).
   */
  public async toList(): Promise<T[]> {
    const filter = this.query.compileFilter();
    const options = this.query.compileFindOptions();
    let results = await this.adapter.find<T>(this.collectionName, filter, options);

    // Apply any non-AST in-memory filters
    const inMem = this.query.getInMemoryFilters();
    if (inMem.length > 0) {
      results = results.filter(doc => inMem.every(fn => fn(doc)));
    }

    return results;
  }

  /**
   * Alias for toList().
   */
  public async toArray(): Promise<T[]> {
    return this.toList();
  }

  /**
   * Returns the first document matching the query, or null if empty.
   */
  public async first(predicate?: (entity: T) => boolean): Promise<T | null>;
  public async first(predicate?: Partial<T> | Record<string, unknown>): Promise<T | null>;
  public async first(predicate?: any): Promise<T | null> {
    const target = predicate ? this.where(predicate) : this;
    const inMem = target.query.getInMemoryFilters();
    if (inMem.length > 0) {
      const list = await target.toList();
      return list.length > 0 ? list[0] : null;
    }
    const filter = target.query.compileFilter();
    const options = target.query.compileFindOptions();
    return target.adapter.findOne<T>(target.collectionName, filter, options);
  }

  /**
   * Finds a document by its primary key / ID (_id or id).
   */
  public async find(id: unknown): Promise<T | null> {
    const filter = { $or: [{ _id: id }, { id: id }] };
    return this.adapter.findOne<T>(this.collectionName, filter as any);
  }

  /**
   * Alias for find(id).
   */
  public async findById(id: unknown): Promise<T | null> {
    return this.find(id);
  }

  /**
   * Returns the first document or null (alias for first()).
   */
  public async firstOrDefault(predicate?: (entity: T) => boolean): Promise<T | null>;
  public async firstOrDefault(predicate?: Partial<T> | Record<string, unknown>): Promise<T | null>;
  public async firstOrDefault(predicate?: any): Promise<T | null> {
    return this.first(predicate);
  }

  /**
   * Returns the first document, or throws EntityNotFoundException if none matches.
   */
  public async firstOrThrow(predicate?: (entity: T) => boolean): Promise<T>;
  public async firstOrThrow(predicate?: Partial<T> | Record<string, unknown>): Promise<T>;
  public async firstOrThrow(predicate?: any): Promise<T> {
    const doc = await this.first(predicate);
    if (!doc) {
      throw new EntityNotFoundException(
        `Document in '${this.collectionName}' not found matching predicate.`,
      );
    }
    return doc;
  }

  /**
   * Asserts that at most one document matches the query and returns it, or returns null.
   */
  public async single(predicate?: (entity: T) => boolean): Promise<T | null>;
  public async single(predicate?: Partial<T> | Record<string, unknown>): Promise<T | null>;
  public async single(predicate?: any): Promise<T | null> {
    const target = (predicate ? this.where(predicate) : this).take(2);
    const list = await target.toList();
    if (list.length > 1) {
      throw new DbException(
        `Sequence contains more than one document in '${this.collectionName}'.`,
      );
    }
    return list.length === 1 ? list[0] : null;
  }

  public async singleOrDefault(predicate?: (entity: T) => boolean): Promise<T | null>;
  public async singleOrDefault(predicate?: Partial<T> | Record<string, unknown>): Promise<T | null>;
  public async singleOrDefault(predicate?: any): Promise<T | null> {
    return this.single(predicate);
  }

  public async singleOrThrow(predicate?: (entity: T) => boolean): Promise<T>;
  public async singleOrThrow(predicate?: Partial<T> | Record<string, unknown>): Promise<T>;
  public async singleOrThrow(predicate?: any): Promise<T> {
    const target = (predicate ? this.where(predicate) : this).take(2);
    const list = await target.toList();
    if (list.length === 0) {
      throw new EntityNotFoundException(
        `No document found in '${this.collectionName}' matching single predicate.`,
      );
    }
    if (list.length > 1) {
      throw new DbException(
        `Sequence contains more than one document in '${this.collectionName}'.`,
      );
    }
    return list[0];
  }

  /**
   * Returns the total count of documents matching the query (LINQ Count).
   */
  public async count(predicate?: (entity: T) => boolean): Promise<number>;
  public async count(predicate?: Partial<T> | Record<string, unknown>): Promise<number>;
  public async count(predicate?: any): Promise<number> {
    const target = predicate ? this.where(predicate) : this;
    const filter = target.query.compileFilter();
    return target.adapter.countDocuments(target.collectionName, filter);
  }

  /**
   * Checks whether any document matches the query (LINQ Any).
   */
  public async any(predicate?: (entity: T) => boolean): Promise<boolean>;
  public async any(predicate?: Partial<T> | Record<string, unknown>): Promise<boolean>;
  public async any(predicate?: any): Promise<boolean> {
    const target = predicate ? this.where(predicate) : this;
    const doc = await target.take(1).first();
    return doc !== null;
  }

  /**
   * Checks whether all documents in the collection match the predicate (LINQ All).
   */
  public async all(predicate: (entity: T) => boolean): Promise<boolean> {
    const allDocs = await this.toList();
    return allDocs.every(predicate);
  }

  // --- LINQ Aggregations ---

  /**
   * Calculates the sum of a numeric field using an aggregation pipeline.
   */
  public async sum(field: NoSqlFieldSelector<T>): Promise<number> {
    const colName = extractColumnName(field as any);
    const filter = this.query.compileFilter();
    const pipeline: AggregationStage[] = [];

    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    pipeline.push({
      $group: {
        _id: null,
        total: { $sum: `$${colName}` },
      },
    });

    const res = await this.adapter.aggregate<{ total: number }>(this.collectionName, pipeline);
    return res.length > 0 && res[0].total !== undefined ? res[0].total : 0;
  }

  /**
   * Calculates the average of a numeric field using an aggregation pipeline.
   */
  public async avg(field: NoSqlFieldSelector<T>): Promise<number> {
    const colName = extractColumnName(field as any);
    const filter = this.query.compileFilter();
    const pipeline: AggregationStage[] = [];

    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    pipeline.push({
      $group: {
        _id: null,
        avg: { $avg: `$${colName}` },
      },
    });

    const res = await this.adapter.aggregate<{ avg: number }>(this.collectionName, pipeline);
    return res.length > 0 && res[0].avg !== undefined ? res[0].avg : 0;
  }

  /**
   * Finds the minimum value of a field.
   */
  public async min(field: NoSqlFieldSelector<T>): Promise<any> {
    const colName = extractColumnName(field as any);
    const filter = this.query.compileFilter();
    const pipeline: AggregationStage[] = [];

    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    pipeline.push({
      $group: {
        _id: null,
        min: { $min: `$${colName}` },
      },
    });

    const res = await this.adapter.aggregate<{ min: any }>(this.collectionName, pipeline);
    return res.length > 0 ? res[0].min : null;
  }

  /**
   * Finds the maximum value of a field.
   */
  public async max(field: NoSqlFieldSelector<T>): Promise<any> {
    const colName = extractColumnName(field as any);
    const filter = this.query.compileFilter();
    const pipeline: AggregationStage[] = [];

    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    pipeline.push({
      $group: {
        _id: null,
        max: { $max: `$${colName}` },
      },
    });

    const res = await this.adapter.aggregate<{ max: any }>(this.collectionName, pipeline);
    return res.length > 0 ? res[0].max : null;
  }

  /**
   * Performs offset-based pagination and returns a paged result container.
   */
  public async paginate(page = 1, pageSize = 20): Promise<NoSqlPagedResult<T>> {
    const validPage = Math.max(1, page);
    const validSize = Math.max(1, pageSize);
    const skipCount = (validPage - 1) * validSize;

    const total = await this.count();
    const items = await this.skip(skipCount).take(validSize).toList();
    const totalPages = Math.ceil(total / validSize);

    return {
      items,
      total,
      page: validPage,
      pageSize: validSize,
      totalPages,
      hasNext: validPage < totalPages,
      hasPrevious: validPage > 1,
    };
  }

  /**
   * Streams documents asynchronously using the adapter cursor.
   */
  public async *stream(): AsyncIterable<T> {
    const filter = this.query.compileFilter();
    const options = this.query.compileFindOptions();

    if (this.adapter.executeStream) {
      for await (const doc of this.adapter.executeStream<T>(this.collectionName, filter, options)) {
        yield doc;
      }
    } else {
      const items = await this.toList();
      for (const item of items) {
        yield item;
      }
    }
  }

  // --- Document Mutations ---

  /**
   * Adds a single document to the collection.
   */
  public async add(doc: T): Promise<T> {
    const res = await this.adapter.insertOne<T>(this.collectionName, doc);
    const cloned = { ...doc } as any;
    if (res.insertedId && cloned._id === undefined && cloned.id === undefined) {
      cloned._id = res.insertedId;
    }
    return cloned;
  }

  /**
   * Alias for add(doc).
   */
  public async insert(doc: T): Promise<T> {
    return this.add(doc);
  }

  /**
   * Adds multiple documents to the collection.
   */
  public async addMany(docs: T[]): Promise<T[]> {
    await this.adapter.insertMany<T>(this.collectionName, docs);
    return docs;
  }

  /**
   * Alias for addMany(docs).
   */
  public async insertMany(docs: T[]): Promise<T[]> {
    return this.addMany(docs);
  }

  /**
   * Updates matching documents with the specified changes.
   */
  public async update(
    filter: Partial<T> | NoSqlFilter,
    changes: Partial<T> | NoSqlUpdate,
  ): Promise<UpdateResult> {
    return this.adapter.updateMany(
      this.collectionName,
      filter as NoSqlFilter,
      changes as NoSqlUpdate,
    );
  }

  /**
   * Removes matching documents from the collection.
   */
  public async remove(filter: Partial<T> | NoSqlFilter): Promise<DeleteResult> {
    return this.adapter.deleteMany(this.collectionName, filter as NoSqlFilter);
  }

  /**
   * Upserts a document based on unique filter criteria.
   */
  public async upsert(filter: Partial<T> | NoSqlFilter, doc: T): Promise<T> {
    await this.adapter.updateOne(this.collectionName, filter as NoSqlFilter, doc as NoSqlUpdate, {
      upsert: true,
    });
    return doc;
  }

  /**
   * Adds a $lookup aggregation stage to join with another collection.
   */
  public lookup(options: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
  }): NoSqlSet<T> {
    const q = this.query.clone();
    q.lookup(options);
    return this.clone(q);
  }

  /**
   * Adds an $unwind aggregation stage to deconstruct an array field.
   */
  public unwind(
    path: string | { path: string; preserveNullAndEmptyArrays?: boolean },
  ): NoSqlSet<T> {
    const q = this.query.clone();
    q.unwind(path);
    return this.clone(q);
  }

  /**
   * Adds a $group aggregation stage to group documents by id with accumulators.
   */
  public group(id: any, accumulators?: Record<string, any>): NoSqlSet<T> {
    const q = this.query.clone();
    q.group(id, accumulators);
    return this.clone(q);
  }

  /**
   * Adds a $facet aggregation stage to process multiple pipelines.
   */
  public facet(facets: Record<string, AggregationStage[]>): NoSqlSet<T> {
    const q = this.query.clone();
    q.facet(facets);
    return this.clone(q);
  }

  /**
   * Adds an $addFields aggregation stage.
   */
  public addFields(fields: Record<string, any>): NoSqlSet<T> {
    const q = this.query.clone();
    q.addFields(fields);
    return this.clone(q);
  }

  /**
   * Creates an index on this collection.
   */
  public async createIndex(
    keys: Record<string, 1 | -1 | 'text' | '2dsphere' | string>,
    options?: { unique?: boolean; name?: string; background?: boolean; ttl?: number },
  ): Promise<string> {
    if (typeof this.adapter.createIndex === 'function') {
      return this.adapter.createIndex(this.collectionName, keys, options);
    }
    return `idx_${Object.keys(keys).join('_')}`;
  }

  // --- Raw MongoDB & Diagnostics Escape Hatches ---

  /**
   * Runs the compiled aggregation pipeline (or custom pipeline) on this collection.
   */
  public async aggregate<R = any>(pipeline?: AggregationStage[]): Promise<R[]> {
    const finalPipeline = pipeline ?? this.query.compileAggregationPipeline();
    return this.adapter.aggregate<R>(this.collectionName, finalPipeline);
  }

  /**
   * Returns the underlying driver collection instance.
   */
  public getRawCollection<R = any>(): R {
    if (typeof this.adapter.getCollection === 'function') {
      return this.adapter.getCollection(this.collectionName);
    }
    throw new DbException(`Adapter '${this.adapter.provider}' does not support getCollection().`);
  }

  /**
   * Returns the compiled MongoDB filter object for this query.
   */
  public getCompiledFilter(): NoSqlFilter {
    return this.query.compileFilter();
  }

  /**
   * Returns the compiled FindOptions for this query.
   */
  public getCompiledFindOptions(): FindOptions {
    return this.query.compileFindOptions();
  }
}
