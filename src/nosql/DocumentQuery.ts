import { WhereClause, WhereCondition, extractColumnName } from '../query/WhereClause';
import { FindOptions, NoSqlFilter, AggregationStage } from './INoSqlAdapter';

export type DocumentFieldSelector<T> = string | ((entity: T) => unknown);

/**
 * LINQ query compiler for document-oriented databases (MongoDB).
 *
 * Compiles TypeScript lambda predicates, WhereClause AST nodes, ordering expressions,
 * projections, and pagination settings into native MongoDB query filter objects,
 * sort specifications, and aggregation pipeline stages.
 */
export class DocumentQuery<T = any> {
  private _whereClause: WhereClause<T> = new WhereClause<T>();
  private _rawFilters: Record<string, unknown>[] = [];
  private _sorts: { field: string; direction: 1 | -1 }[] = [];
  private _projection: Record<string, 0 | 1> = {};
  private _skip?: number;
  private _limit?: number;
  private _inMemoryFilters: ((entity: T) => boolean)[] = [];
  private _pipelineStages: AggregationStage[] = [];

  constructor(public readonly collectionName: string) {}

  /**
   * Clones this DocumentQuery instance immutably.
   */
  public clone(): DocumentQuery<T> {
    const q = new DocumentQuery<T>(this.collectionName);
    q._rawFilters = this._rawFilters.map(f => ({ ...f }));
    q._sorts = this._sorts.map(s => ({ ...s }));
    q._projection = { ...this._projection };
    q._skip = this._skip;
    q._limit = this._limit;
    q._inMemoryFilters = [...this._inMemoryFilters];
    q._pipelineStages = [...this._pipelineStages];
    for (const c of this._whereClause.conditions) {
      q._whereClause.conditions.push(c);
    }
    return q;
  }

  // --- Filtering ---

  /**
   * Adds a filter condition using a LINQ lambda, WhereClause builder callback, or partial filter object.
   */
  public where(fn: (clause: WhereClause<T> & T) => void | WhereClause<T> | boolean): this;
  public where(predicate: (entity: T) => boolean): this;
  public where(predicate: Partial<T> | Record<string, unknown>): this;
  public where(predicate: any): this {
    if (typeof predicate === 'function') {
      const initialCount = this._whereClause.conditions.length;
      let result: any;
      try {
        result = (predicate as any)(this._whereClause);
      } catch {
        // Lambda predicate expecting entity object
      }

      if (result instanceof WhereClause) {
        this._whereClause = result;
      } else if (this._whereClause.conditions.length === initialCount) {
        const parsed = this.parseLambdaPredicate(predicate as Function);
        if (parsed) {
          this._rawFilters.push(parsed);
        } else {
          // Fallback to in-memory filter if not statically AST-parsable
          this._inMemoryFilters.push(predicate as (entity: T) => boolean);
        }
      }
    } else if (typeof predicate === 'object' && predicate !== null) {
      this._rawFilters.push(predicate as Record<string, unknown>);
    }

    return this;
  }

  /**
   * Adds a direct comparison filter on a field.
   */
  public whereField<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    op: string,
    value: unknown,
  ): this {
    const colName = extractColumnName(field as any);
    (this._whereClause as any).addCondition(colName, op as any, value);
    return this;
  }

  /**
   * Adds an $in condition on a field.
   */
  public whereIn<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    values: unknown[],
  ): this {
    const colName = extractColumnName(field as any);
    this._whereClause.in(colName, values);
    return this;
  }

  /**
   * Adds a $nin condition on a field.
   */
  public whereNotIn<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    values: unknown[],
  ): this {
    const colName = extractColumnName(field as any);
    this._whereClause.notIn(colName, values);
    return this;
  }

  /**
   * Adds a BETWEEN condition on a field.
   */
  public whereBetween<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    low: unknown,
    high: unknown,
  ): this {
    const colName = extractColumnName(field as any);
    this._whereClause.between(colName, low, high);
    return this;
  }

  /**
   * Adds a regex pattern match condition on a string field.
   */
  public whereRegex<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    pattern: string | RegExp,
    options = 'i',
  ): this {
    const colName = extractColumnName(field as any);
    if (pattern instanceof RegExp) {
      this._rawFilters.push({ [colName]: pattern });
    } else {
      this._rawFilters.push({ [colName]: { $regex: pattern, $options: options } });
    }
    return this;
  }

  /**
   * Adds an IS NULL / null equality filter.
   */
  public whereNull<K extends keyof T & string>(field: K | ((entity: T) => unknown)): this {
    const colName = extractColumnName(field as any);
    this._whereClause.isNull(colName);
    return this;
  }

  /**
   * Adds an IS NOT NULL filter.
   */
  public whereNotNull<K extends keyof T & string>(field: K | ((entity: T) => unknown)): this {
    const colName = extractColumnName(field as any);
    this._whereClause.isNotNull(colName);
    return this;
  }

  // --- Sorting ---

  /**
   * Adds an ascending ORDER BY sort specification.
   */
  public orderBy<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    direction: 'asc' | 'desc' = 'asc',
  ): this {
    const colName = extractColumnName(field as any);
    this._sorts.push({ field: colName, direction: direction.toLowerCase() === 'desc' ? -1 : 1 });
    return this;
  }

  /**
   * Adds a descending ORDER BY sort specification.
   */
  public orderByDescending<K extends keyof T & string>(field: K | ((entity: T) => unknown)): this {
    return this.orderBy(field, 'desc');
  }

  /**
   * Chained secondary sort (thenBy).
   */
  public thenBy<K extends keyof T & string>(
    field: K | ((entity: T) => unknown),
    direction: 'asc' | 'desc' = 'asc',
  ): this {
    return this.orderBy(field, direction);
  }

  /**
   * Chained secondary descending sort (thenByDescending).
   */
  public thenByDescending<K extends keyof T & string>(field: K | ((entity: T) => unknown)): this {
    return this.orderBy(field, 'desc');
  }

  // --- Projection ---

  /**
   * Specifies which document fields to project (include).
   */
  public select<K extends keyof T & string>(...fields: (K | ((entity: T) => unknown))[]): this {
    for (const f of fields) {
      const colName = extractColumnName(f as any);
      this._projection[colName] = 1;
    }
    return this;
  }

  // --- Pagination ---

  /**
   * Sets the number of documents to skip (Skip in LINQ).
   */
  public skip(count: number): this {
    this._skip = count;
    return this;
  }

  /**
   * Sets the maximum number of documents to take (Take in LINQ).
   */
  public take(count: number): this {
    this._limit = count;
    return this;
  }

  public limit(count: number): this {
    return this.take(count);
  }

  public getSkip(): number | undefined {
    return this._skip;
  }

  public getLimit(): number | undefined {
    return this._limit;
  }

  public getInMemoryFilters(): ((entity: T) => boolean)[] {
    return [...this._inMemoryFilters];
  }

  // --- Compilers ---

  /**
   * Compiles all attached WHERE conditions and filters into a single native MongoDB filter object.
   */
  public compileFilter(): NoSqlFilter {
    const parts: NoSqlFilter[] = [];

    // 1. Compile WhereClause conditions
    const fromWhereClause = this.compileWhereConditions(this._whereClause.conditions);
    if (fromWhereClause && Object.keys(fromWhereClause).length > 0) {
      parts.push(fromWhereClause);
    }

    // 2. Add raw filter objects
    for (const rf of this._rawFilters) {
      if (rf && Object.keys(rf).length > 0) {
        parts.push(rf);
      }
    }

    return this.mergeFilterObjects(parts);
  }

  private mergeFilterObjects(filters: NoSqlFilter[]): NoSqlFilter {
    if (filters.length === 0) return {};
    if (filters.length === 1) return filters[0];

    const merged: Record<string, unknown> = {};
    const complexParts: Record<string, unknown>[] = [];

    for (const part of filters) {
      for (const [key, val] of Object.entries(part)) {
        if (key.startsWith('$')) {
          complexParts.push({ [key]: val });
        } else if (merged[key] === undefined) {
          merged[key] = val;
        } else if (
          typeof merged[key] === 'object' &&
          merged[key] !== null &&
          typeof val === 'object' &&
          val !== null
        ) {
          // Merge operators e.g. { age: { $gt: 18 } } and { age: { $lt: 65 } } -> { age: { $gt: 18, $lt: 65 } }
          merged[key] = { ...(merged[key] as object), ...(val as object) };
        } else {
          complexParts.push({ [key]: val });
        }
      }
    }

    if (complexParts.length === 0) {
      return merged;
    }

    if (Object.keys(merged).length > 0) {
      return { $and: [merged, ...complexParts] };
    }

    return { $and: complexParts };
  }

  /**
   * Compiles the sort criteria into a MongoDB sort object (e.g. `{ createdAt: -1, name: 1 }`).
   */
  public compileSort(): Record<string, 1 | -1> | undefined {
    if (this._sorts.length === 0) return undefined;
    const sort: Record<string, 1 | -1> = {};
    for (const s of this._sorts) {
      sort[s.field] = s.direction;
    }
    return sort;
  }

  /**
   * Compiles the projection fields into a MongoDB projection object (e.g. `{ name: 1, email: 1 }`).
   */
  public compileProjection(): Record<string, 0 | 1> | undefined {
    return Object.keys(this._projection).length > 0 ? { ...this._projection } : undefined;
  }

  /**
   * Compiles complete FindOptions for INoSqlAdapter.find().
   */
  public compileFindOptions(): FindOptions {
    const opts: FindOptions = {};
    const sort = this.compileSort();
    if (sort) opts.sort = sort;
    const proj = this.compileProjection();
    if (proj) opts.projection = proj;
    if (typeof this._skip === 'number') opts.skip = this._skip;
    if (typeof this._limit === 'number') opts.limit = this._limit;
    return opts;
  }

  /**
   * Appends an arbitrary aggregation stage to the pipeline.
   */
  public stage(stage: AggregationStage): this {
    this._pipelineStages.push(stage);
    return this;
  }

  /**
   * Performs a $lookup join with another collection.
   */
  public lookup(options: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
  }): this {
    return this.stage({ $lookup: options });
  }

  /**
   * Deconstructs an array field from the input documents to output a document for each element ($unwind).
   */
  public unwind(path: string | { path: string; preserveNullAndEmptyArrays?: boolean }): this {
    if (typeof path === 'string') {
      const p = path.startsWith('$') ? path : `$${path}`;
      return this.stage({ $unwind: p });
    }
    const p = path.path.startsWith('$') ? path.path : `$${path.path}`;
    return this.stage({ $unwind: { ...path, path: p } });
  }

  /**
   * Groups input documents by a specified identifier expression and applies accumulator expressions ($group).
   */
  public group(id: any, accumulators: Record<string, any> = {}): this {
    return this.stage({ $group: { _id: id, ...accumulators } });
  }

  /**
   * Processes multiple aggregation pipelines within a single stage on the same set of input documents ($facet).
   */
  public facet(facets: Record<string, AggregationStage[]>): this {
    return this.stage({ $facet: facets });
  }

  /**
   * Adds new fields to documents ($addFields).
   */
  public addFields(fields: Record<string, any>): this {
    return this.stage({ $addFields: fields });
  }

  /**
   * Passes along the documents with the requested fields to the next stage in the pipeline ($project).
   */
  public project(spec: Record<string, any>): this {
    return this.stage({ $project: spec });
  }

  /**
   * Compiles the current query into an Aggregation Pipeline.
   */
  public compileAggregationPipeline(extraStages: AggregationStage[] = []): AggregationStage[] {
    const pipeline: AggregationStage[] = [];
    const filter = this.compileFilter();

    if (filter && Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }

    const sort = this.compileSort();
    if (sort) {
      pipeline.push({ $sort: sort });
    }

    if (typeof this._skip === 'number' && this._skip > 0) {
      pipeline.push({ $skip: this._skip });
    }

    if (typeof this._limit === 'number') {
      pipeline.push({ $limit: this._limit });
    }

    const proj = this.compileProjection();
    if (proj) {
      pipeline.push({ $project: proj });
    }

    for (const stage of this._pipelineStages) {
      pipeline.push(stage);
    }

    for (const stage of extraStages) {
      pipeline.push(stage);
    }

    return pipeline;
  }

  // --- Internal AST & Predicate Parsers ---

  private compileWhereConditions(conditions: WhereCondition[]): NoSqlFilter | null {
    if (conditions.length === 0) return null;

    const andGroups: NoSqlFilter[] = [];
    let currentOrGroup: NoSqlFilter[] = [];

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      const nextCond = conditions[i + 1];
      const singleFilter = this.compileSingleCondition(cond);

      if (!singleFilter) continue;

      if (cond.logical === 'OR' || (nextCond && nextCond.logical === 'OR')) {
        currentOrGroup.push(singleFilter);
        if (!nextCond || nextCond.logical !== 'OR') {
          if (currentOrGroup.length > 1) {
            andGroups.push({ $or: [...currentOrGroup] });
          } else if (currentOrGroup.length === 1) {
            andGroups.push(currentOrGroup[0]);
          }
          currentOrGroup = [];
        }
      } else {
        andGroups.push(singleFilter);
      }
    }

    if (currentOrGroup.length > 0) {
      if (currentOrGroup.length > 1) {
        andGroups.push({ $or: currentOrGroup });
      } else {
        andGroups.push(currentOrGroup[0]);
      }
    }

    if (andGroups.length === 0) return null;
    return this.mergeFilterObjects(andGroups);
  }

  private compileSingleCondition(cond: WhereCondition): NoSqlFilter | null {
    if (cond.nested) {
      return this.compileWhereConditions(cond.nested.conditions);
    }

    const col = cond.column;
    if (!col) return null;

    const op = cond.operator;
    const val = cond.value;

    switch (op) {
      case '=':
        return { [col]: val };
      case '!=':
      case '<>':
        return { [col]: { $ne: val } };
      case '>':
        return { [col]: { $gt: val } };
      case '>=':
        return { [col]: { $gte: val } };
      case '<':
        return { [col]: { $lt: val } };
      case '<=':
        return { [col]: { $lte: val } };
      case 'IN':
        return { [col]: { $in: Array.isArray(val) ? val : [val] } };
      case 'NOT IN':
        return { [col]: { $nin: Array.isArray(val) ? val : [val] } };
      case 'IS NULL':
        return { [col]: null };
      case 'IS NOT NULL':
        return { [col]: { $ne: null } };
      case 'LIKE':
      case 'NOT LIKE': {
        const strVal = String(val ?? '');
        const regexStr = strVal.replace(/%/g, '.*').replace(/_/g, '.');
        const pattern = new RegExp(`^${regexStr}$`, 'i');
        return op === 'LIKE' ? { [col]: pattern } : { [col]: { $not: pattern } };
      }
      case 'BETWEEN':
        if (Array.isArray(val) && val.length >= 2) {
          return { [col]: { $gte: val[0], $lte: val[1] } };
        }
        return { [col]: { $gte: val } };
      default:
        return val !== undefined ? { [col]: val } : null;
    }
  }

  /**
   * Statically parses an arrow function predicate e.g. `u => u.age > 18 && u.status === 'active'`
   * into a MongoDB filter object.
   */
  private parseLambdaPredicate(fn: Function): NoSqlFilter | null {
    try {
      const str = fn.toString().trim();
      const arrowMatch = str.match(
        /^(?:\(([^)]+)\)|([a-zA-Z0-9_$]+))\s*=>\s*(?:\{\s*return\s+)?(.+?)(?:\s*;?\s*\}?)?$/,
      );
      const funcMatch =
        !arrowMatch &&
        str.match(/^function\s*(?:\w+)?\s*\(([^)]+)\)\s*\{\s*return\s+(.+?);?\s*\}$/);

      const param = arrowMatch
        ? (arrowMatch[1] || arrowMatch[2]).trim()
        : funcMatch
          ? funcMatch[1].trim()
          : null;
      let body = arrowMatch ? arrowMatch[3].trim() : funcMatch ? funcMatch[2].trim() : null;

      if (!param || !body) return null;

      // Strip outer parentheses
      while (body.startsWith('(') && body.endsWith(')')) {
        let depth = 0;
        let balanced = true;
        for (let i = 0; i < body.length - 1; i++) {
          if (body[i] === '(') depth++;
          else if (body[i] === ')') depth--;
          if (depth === 0) {
            balanced = false;
            break;
          }
        }
        if (balanced) {
          body = body.slice(1, -1).trim();
        } else {
          break;
        }
      }

      // Check for top-level ||
      const orParts = this.splitTopLevelLogical(body, '||');
      if (orParts.length > 1) {
        const compiledOr: NoSqlFilter[] = [];
        for (const part of orParts) {
          const res = this.parseAndGroup(part, param);
          if (!res) return null;
          compiledOr.push(res);
        }
        return { $or: compiledOr };
      }

      // Conjunction &&
      return this.parseAndGroup(body, param);
    } catch {
      return null;
    }
  }

  private parseAndGroup(body: string, param: string): NoSqlFilter | null {
    const andParts = this.splitTopLevelLogical(body, '&&');
    const merged: Record<string, unknown> = {};

    for (const part of andParts) {
      const single = this.parseSingleExpression(part.trim(), param);
      if (!single) return null;
      for (const [k, v] of Object.entries(single)) {
        if (merged[k] === undefined) {
          merged[k] = v;
        } else if (
          typeof merged[k] === 'object' &&
          merged[k] !== null &&
          typeof v === 'object' &&
          v !== null
        ) {
          merged[k] = { ...(merged[k] as object), ...(v as object) };
        } else {
          return { $and: [merged, single] };
        }
      }
    }

    return merged;
  }

  private parseSingleExpression(expr: string, param: string): NoSqlFilter | null {
    // 1. String methods: u.name.startsWith('A'), u.name.endsWith('B'), u.name.includes('C')
    const methodMatch = expr.match(
      new RegExp(`^${param}\\.([a-zA-Z0-9_$]+)\\.(startsWith|endsWith|includes)\\((.+?)\\)$`),
    );
    if (methodMatch) {
      const field = methodMatch[1];
      const method = methodMatch[2];
      const argVal = this.parseLiteralValue(methodMatch[3]);
      if (!argVal.success) return null;

      const escaped = String(argVal.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (method === 'startsWith') {
        return { [field]: { $regex: `^${escaped}` } };
      } else if (method === 'endsWith') {
        return { [field]: { $regex: `${escaped}$` } };
      } else if (method === 'includes') {
        return { [field]: { $regex: escaped } };
      }
    }

    // 2. Binary comparison operators (===, !==, ==, !=, >=, <=, >, <)
    const opRegex = new RegExp(
      `^${param}\\.([a-zA-Z0-9_$]+)\\s*(===|!==|==|!=|>=|<=|>|<)\\s*(.+)$`,
    );
    const m = expr.match(opRegex);
    if (m) {
      const field = m[1];
      const op = m[2];
      const rawVal = m[3];
      const lit = this.parseLiteralValue(rawVal);
      if (!lit.success) return null;

      const val = lit.value;
      if (op === '===' || op === '==') {
        return { [field]: val };
      } else if (op === '!==' || op === '!=') {
        return { [field]: { $ne: val } };
      } else if (op === '>') {
        return { [field]: { $gt: val } };
      } else if (op === '>=') {
        return { [field]: { $gte: val } };
      } else if (op === '<') {
        return { [field]: { $lt: val } };
      } else if (op === '<=') {
        return { [field]: { $lte: val } };
      }
    }

    // 3. Inverted comparison (e.g. 18 <= u.age)
    const invRegex = new RegExp(
      `^(.+?)\\s*(===|!==|==|!=|>=|<=|>|<)\\s*${param}\\.([a-zA-Z0-9_$]+)$`,
    );
    const invMatch = expr.match(invRegex);
    if (invMatch) {
      const rawVal = invMatch[1];
      const op = invMatch[2];
      const field = invMatch[3];
      const lit = this.parseLiteralValue(rawVal);
      if (!lit.success) return null;

      const val = lit.value;
      if (op === '===' || op === '==') return { [field]: val };
      if (op === '!==' || op === '!=') return { [field]: { $ne: val } };
      if (op === '>') return { [field]: { $lt: val } };
      if (op === '>=') return { [field]: { $lte: val } };
      if (op === '<') return { [field]: { $gt: val } };
      if (op === '<=') return { [field]: { $gte: val } };
    }

    // 4. Boolean flag: u.isActive or !u.isActive
    if (expr.startsWith(`${param}.`) || expr.startsWith(`!${param}.`)) {
      const isNegated = expr.startsWith('!');
      const cleanExpr = isNegated ? expr.slice(1).trim() : expr;
      const fieldMatch = cleanExpr.match(new RegExp(`^${param}\\.([a-zA-Z0-9_$]+)$`));
      if (fieldMatch) {
        return { [fieldMatch[1]]: !isNegated };
      }
    }

    return null;
  }

  private splitTopLevelLogical(str: string, delimiter: '&&' | '||'): string[] {
    const parts: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let parenDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const next = str[i + 1];

      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote;
        current += char;
      } else if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick;
        current += char;
      } else if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
        if (char === '(') parenDepth++;
        else if (char === ')') parenDepth--;
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth--;

        if (
          parenDepth === 0 &&
          bracketDepth === 0 &&
          char === delimiter[0] &&
          next === delimiter[1]
        ) {
          parts.push(current.trim());
          current = '';
          i++;
          continue;
        }
        current += char;
      } else {
        current += char;
      }
    }

    if (current.trim().length > 0) {
      parts.push(current.trim());
    }

    return parts;
  }

  private parseLiteralValue(raw: string): { success: boolean; value: any } {
    raw = raw.trim();
    if (raw === 'true') return { success: true, value: true };
    if (raw === 'false') return { success: true, value: false };
    if (raw === 'null') return { success: true, value: null };
    if (raw === 'undefined') return { success: true, value: undefined };
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return { success: true, value: Number(raw) };
    if (
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith('`') && raw.endsWith('`'))
    ) {
      return { success: true, value: raw.slice(1, -1) };
    }
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const jsonStr = raw.replace(/'/g, '"');
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) return { success: true, value: parsed };
      } catch {
        // ignore
      }
    }
    return { success: false, value: undefined };
  }
}
