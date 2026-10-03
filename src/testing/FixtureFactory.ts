import { DbContext } from '../context/DbContext';

export type FactoryGenerator<T> = (sequence: number) => Partial<T>;

/**
 * Fixture builder instance providing build(), create(), buildList(), createList().
 */
export class FixtureBuilder<T extends object> {
  private _sequence = 1;

  constructor(
    public readonly entityClass: new (...args: any[]) => T,
    private readonly generator: FactoryGenerator<T>,
  ) {}

  /**
   * Builds an in-memory entity instance without persisting it to the database.
   */
  public build(overrides: Partial<T> = {}): T {
    const seq = this._sequence++;
    const base = this.generator(seq);
    const instance = Object.create(this.entityClass.prototype);
    return Object.assign(instance, base, overrides);
  }

  /**
   * Builds multiple in-memory entity instances.
   */
  public buildList(count: number, overrides: Partial<T> = {}): T[] {
    const list: T[] = [];
    for (let i = 0; i < count; i++) {
      list.push(this.build(overrides));
    }
    return list;
  }

  /**
   * Builds and persists an entity instance using the given DbContext.
   */
  public async create(context: DbContext, overrides: Partial<T> = {}): Promise<T> {
    const built = this.build(overrides);
    return context.set(this.entityClass).add(built);
  }

  /**
   * Builds and persists multiple entity instances using the given DbContext.
   */
  public async createList(
    context: DbContext,
    count: number,
    overrides: Partial<T> = {},
  ): Promise<T[]> {
    const builtList = this.buildList(count, overrides);
    const set = context.set(this.entityClass);
    const results: T[] = [];
    for (const item of builtList) {
      results.push(await set.add(item));
    }
    return results;
  }

  /**
   * Resets the internal sequence counter.
   */
  public resetSequence(): this {
    this._sequence = 1;
    return this;
  }
}

/**
 * Fixture factory system for unit and integration testing in EntityTS.
 *
 * @example
 * ```ts
 * export const UserFactory = FixtureFactory.define(User, seq => ({
 *   id: seq,
 *   name: `User ${seq}`,
 *   email: `user${seq}@example.com`,
 * }));
 *
 * const user = UserFactory.build({ name: 'Alice' });
 * const savedUser = await UserFactory.create(ctx, { role: 'admin' });
 * ```
 */
export class FixtureFactory {
  public static define<T extends object>(
    entityClass: new (...args: any[]) => T,
    generator: FactoryGenerator<T>,
  ): FixtureBuilder<T> {
    return new FixtureBuilder(entityClass, generator);
  }
}
