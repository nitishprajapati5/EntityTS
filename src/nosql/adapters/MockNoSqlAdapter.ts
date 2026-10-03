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

/**
 * In-memory NoSQL document database adapter for fast, zero-dependency unit tests.
 */
export class MockNoSqlAdapter implements INoSqlAdapter {
  public readonly provider: NoSqlProvider = 'mock';
  public connected = false;
  private readonly collections = new Map<string, any[]>();
  private autoIdCounter = 1;

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }

  public async ping(): Promise<boolean> {
    return this.connected;
  }

  public clear(collection?: string): void {
    if (collection) {
      this.collections.delete(collection);
    } else {
      this.collections.clear();
    }
  }

  public getRawData(collection: string): any[] {
    return this.getOrCreateCollection(collection);
  }

  public getCollection<T = any>(name: string): T {
    return {
      name,
      find: (filter?: NoSqlFilter, opts?: FindOptions) => ({
        toArray: () => this.find(name, filter, opts),
      }),
      findOne: (filter?: NoSqlFilter) => this.findOne(name, filter),
      insertOne: (doc: any) => this.insertOne(name, doc),
      insertMany: (docs: any[]) => this.insertMany(name, docs),
      updateOne: (filter: NoSqlFilter, update: NoSqlUpdate, opts?: UpdateOptions) =>
        this.updateOne(name, filter, update, opts),
      updateMany: (filter: NoSqlFilter, update: NoSqlUpdate, opts?: UpdateOptions) =>
        this.updateMany(name, filter, update, opts),
      deleteOne: (filter: NoSqlFilter) => this.deleteOne(name, filter),
      deleteMany: (filter: NoSqlFilter) => this.deleteMany(name, filter),
      countDocuments: (filter?: NoSqlFilter, opts?: CountOptions) =>
        this.countDocuments(name, filter, opts),
    } as any;
  }

  public async insertOne<T = unknown>(
    collection: string,
    doc: T,
    _options?: InsertOptions,
  ): Promise<InsertOneResult> {
    const col = this.getOrCreateCollection(collection);
    const cloned = JSON.parse(JSON.stringify(doc));
    if (cloned._id === undefined && cloned.id === undefined) {
      cloned._id = `mock_id_${this.autoIdCounter++}`;
    }
    col.push(cloned);
    return {
      insertedId: cloned._id ?? cloned.id,
      acknowledged: true,
    };
  }

  public async insertMany<T = unknown>(
    collection: string,
    docs: T[],
    _options?: InsertOptions,
  ): Promise<InsertManyResult> {
    const col = this.getOrCreateCollection(collection);
    const insertedIds: unknown[] = [];
    for (const doc of docs) {
      const cloned = JSON.parse(JSON.stringify(doc));
      if (cloned._id === undefined && cloned.id === undefined) {
        cloned._id = `mock_id_${this.autoIdCounter++}`;
      }
      col.push(cloned);
      insertedIds.push(cloned._id ?? cloned.id);
    }
    return {
      insertedIds,
      insertedCount: docs.length,
      acknowledged: true,
    };
  }

  public async find<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: FindOptions,
  ): Promise<T[]> {
    const col = this.getOrCreateCollection(collection);
    let matched = col.filter(doc => this.matchesFilter(doc, filter ?? {}));

    if (options?.sort) {
      matched = this.sortDocuments(matched, options.sort);
    }
    if (typeof options?.skip === 'number') {
      matched = matched.slice(options.skip);
    }
    if (typeof options?.limit === 'number') {
      matched = matched.slice(0, options.limit);
    }

    if (options?.projection) {
      matched = matched.map(doc => this.applyProjection(doc, options.projection!));
    }

    return JSON.parse(JSON.stringify(matched));
  }

  public async findOne<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: Omit<FindOptions, 'limit'>,
  ): Promise<T | null> {
    const results = await this.find<T>(collection, filter, { ...options, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  public async updateOne(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult> {
    const col = this.getOrCreateCollection(collection);
    const index = col.findIndex(doc => this.matchesFilter(doc, filter));

    if (index === -1) {
      if (options?.upsert) {
        const newDoc = { ...filter };
        this.applyUpdateToDoc(newDoc, update);
        if (newDoc._id === undefined && newDoc.id === undefined) {
          newDoc._id = `mock_id_${this.autoIdCounter++}`;
        }
        col.push(newDoc);
        return {
          matchedCount: 0,
          modifiedCount: 1,
          upsertedCount: 1,
          upsertedId: newDoc._id ?? newDoc.id,
          acknowledged: true,
        };
      }
      return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
    }

    this.applyUpdateToDoc(col[index], update);
    return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
  }

  public async updateMany(
    collection: string,
    filter: NoSqlFilter,
    update: NoSqlUpdate,
    options?: UpdateOptions,
  ): Promise<UpdateResult> {
    const col = this.getOrCreateCollection(collection);
    let matchedCount = 0;
    let modifiedCount = 0;

    for (const doc of col) {
      if (this.matchesFilter(doc, filter)) {
        matchedCount++;
        this.applyUpdateToDoc(doc, update);
        modifiedCount++;
      }
    }

    if (matchedCount === 0 && options?.upsert) {
      return this.updateOne(collection, filter, update, options);
    }

    return { matchedCount, modifiedCount, acknowledged: true };
  }

  public async deleteOne(
    collection: string,
    filter: NoSqlFilter,
    _options?: DeleteOptions,
  ): Promise<DeleteResult> {
    const col = this.getOrCreateCollection(collection);
    const index = col.findIndex(doc => this.matchesFilter(doc, filter));
    if (index !== -1) {
      col.splice(index, 1);
      return { deletedCount: 1, acknowledged: true };
    }
    return { deletedCount: 0, acknowledged: true };
  }

  public async deleteMany(
    collection: string,
    filter: NoSqlFilter,
    _options?: DeleteOptions,
  ): Promise<DeleteResult> {
    const col = this.getOrCreateCollection(collection);
    const initialLen = col.length;
    const remaining = col.filter(doc => !this.matchesFilter(doc, filter));
    this.collections.set(collection, remaining);
    return { deletedCount: initialLen - remaining.length, acknowledged: true };
  }

  public async countDocuments(
    collection: string,
    filter?: NoSqlFilter,
    options?: CountOptions,
  ): Promise<number> {
    const docs = await this.find(collection, filter, options);
    return docs.length;
  }

  public async aggregate<T = unknown>(
    collection: string,
    pipeline: AggregationStage[],
    _options?: AggregateOptions,
  ): Promise<T[]> {
    let result = [...this.getOrCreateCollection(collection)];

    for (const stage of pipeline) {
      const stageName = Object.keys(stage)[0];
      const stagePayload = stage[stageName];

      if (stageName === '$match') {
        result = result.filter(doc => this.matchesFilter(doc, stagePayload as NoSqlFilter));
      } else if (stageName === '$sort') {
        result = this.sortDocuments(result, stagePayload as Record<string, 1 | -1>);
      } else if (stageName === '$skip') {
        result = result.slice(Number(stagePayload));
      } else if (stageName === '$limit') {
        result = result.slice(0, Number(stagePayload));
      } else if (stageName === '$project') {
        result = result.map(doc =>
          this.applyProjection(doc, stagePayload as Record<string, 0 | 1>),
        );
      } else if (stageName === '$count') {
        const fieldName = String(stagePayload);
        result = [{ [fieldName]: result.length }];
      }
    }

    return JSON.parse(JSON.stringify(result));
  }

  public async beginTransaction(): Promise<NoSqlTransaction> {
    return {
      session: { sessionId: `mock_session_${Date.now()}` },
      commit: async () => {},
      rollback: async () => {},
    };
  }

  public async *executeStream<T = unknown>(
    collection: string,
    filter?: NoSqlFilter,
    options?: FindOptions,
  ): AsyncIterable<T> {
    const items = await this.find<T>(collection, filter, options);
    for (const item of items) {
      yield item;
    }
  }

  private getOrCreateCollection(name: string): any[] {
    let col = this.collections.get(name);
    if (!col) {
      col = [];
      this.collections.set(name, col);
    }
    return col;
  }

  private matchesFilter(doc: any, filter: NoSqlFilter): boolean {
    if (!filter || Object.keys(filter).length === 0) return true;

    for (const [key, val] of Object.entries(filter)) {
      if (key === '$and' && Array.isArray(val)) {
        if (!val.every(sub => this.matchesFilter(doc, sub))) return false;
        continue;
      }
      if (key === '$or' && Array.isArray(val)) {
        if (!val.some(sub => this.matchesFilter(doc, sub))) return false;
        continue;
      }
      if (key === '$nor' && Array.isArray(val)) {
        if (val.some(sub => this.matchesFilter(doc, sub))) return false;
        continue;
      }

      const docVal = doc[key];

      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp)) {
        const opKeys = Object.keys(val);
        const isOperatorObj = opKeys.some(k => k.startsWith('$'));

        if (isOperatorObj) {
          for (const [op, opVal] of Object.entries(val as Record<string, any>)) {
            if (op === '$eq' && docVal !== opVal) return false;
            if (op === '$ne' && docVal === opVal) return false;
            if (op === '$gt' && !(docVal > opVal)) return false;
            if (op === '$gte' && !(docVal >= opVal)) return false;
            if (op === '$lt' && !(docVal < opVal)) return false;
            if (op === '$lte' && !(docVal <= opVal)) return false;
            if (op === '$in' && Array.isArray(opVal) && !opVal.includes(docVal)) return false;
            if (op === '$nin' && Array.isArray(opVal) && opVal.includes(docVal)) return false;
            if (op === '$exists') {
              const exists = docVal !== undefined;
              if (Boolean(opVal) !== exists) return false;
            }
            if (op === '$regex') {
              const regex =
                opVal instanceof RegExp ? opVal : new RegExp(opVal, (val as any).$options || '');
              if (!regex.test(String(docVal ?? ''))) return false;
            }
          }
          continue;
        }
      }

      if (val instanceof RegExp) {
        if (!val.test(String(docVal ?? ''))) return false;
        continue;
      }

      if (docVal !== val) return false;
    }

    return true;
  }

  private applyUpdateToDoc(doc: any, update: NoSqlUpdate): void {
    const hasOperators = Object.keys(update).some(k => k.startsWith('$'));
    if (!hasOperators) {
      Object.assign(doc, update);
      return;
    }

    if (update.$set && typeof update.$set === 'object') {
      Object.assign(doc, update.$set);
    }
    if (update.$unset && typeof update.$unset === 'object') {
      for (const field of Object.keys(update.$unset)) {
        delete doc[field];
      }
    }
    if (update.$inc && typeof update.$inc === 'object') {
      for (const [field, incVal] of Object.entries(update.$inc as Record<string, number>)) {
        doc[field] = (Number(doc[field]) || 0) + incVal;
      }
    }
  }

  private sortDocuments(docs: any[], sort: Record<string, 1 | -1 | 'asc' | 'desc'>): any[] {
    return [...docs].sort((a, b) => {
      for (const [key, dir] of Object.entries(sort)) {
        const isAsc = dir === 1 || dir === 'asc';
        if (a[key] < b[key]) return isAsc ? -1 : 1;
        if (a[key] > b[key]) return isAsc ? 1 : -1;
      }
      return 0;
    });
  }

  private applyProjection(doc: any, projection: Record<string, 0 | 1 | boolean>): any {
    const keys = Object.keys(projection);
    if (keys.length === 0) return doc;

    const isInclusive = Object.values(projection).some(v => v === 1 || v === true);
    const result: Record<string, unknown> = {};

    if (isInclusive) {
      if (projection._id !== 0 && doc._id !== undefined) {
        result._id = doc._id;
      }
      for (const key of keys) {
        if (projection[key] === 1 || projection[key] === true) {
          result[key] = doc[key];
        }
      }
    } else {
      Object.assign(result, doc);
      for (const key of keys) {
        if (projection[key] === 0 || projection[key] === false) {
          delete result[key];
        }
      }
    }

    return result;
  }
}
