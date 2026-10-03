import { DbContext } from '../context/DbContext';
import { ModelMetadataRegistry } from '../model/EntityMetadata';

export interface TrpcProcedureHandler<TInput = any, TOutput = any> {
  resolve: (opts: { input: TInput; ctx?: any }) => Promise<TOutput>;
}

export interface EntityTrpcRouter<T = any> {
  list: TrpcProcedureHandler<{ skip?: number; limit?: number } | undefined, T[]>;
  byId: TrpcProcedureHandler<{ id: any }, T | null>;
  create: TrpcProcedureHandler<Partial<T>, T>;
  update: TrpcProcedureHandler<{ id: any; data: Partial<T> }, T | null>;
  delete: TrpcProcedureHandler<{ id: any }, boolean>;
}

/**
 * Generates typed procedure routers for tRPC backends from EntityTS entity metadata.
 */
export class TrpcRouterBuilder {
  /**
   * Creates a typed entity router mapping CRUD operations to the entity's DbSet.
   */
  public static createEntityRouter<T extends object>(
    dbContext: DbContext,
    entityClass: new (...args: any[]) => T,
  ): EntityTrpcRouter<T> {
    const meta = ModelMetadataRegistry.getInstance().get(entityClass);
    const pkProp = meta?.primaryKeys[0] || 'id';

    return {
      list: {
        resolve: async opts => {
          let set = dbContext.set(entityClass);
          if (typeof opts?.input?.skip === 'number') set = set.skip(opts.input.skip);
          if (typeof opts?.input?.limit === 'number') set = set.take(opts.input.limit);
          return set.toList();
        },
      },
      byId: {
        resolve: async opts => {
          return dbContext.set(entityClass).find(opts.input.id);
        },
      },
      create: {
        resolve: async opts => {
          return dbContext.set(entityClass).add(opts.input);
        },
      },
      update: {
        resolve: async opts => {
          return dbContext.set(entityClass).update(opts.input.id, opts.input.data);
        },
      },
      delete: {
        resolve: async opts => {
          try {
            await dbContext.set(entityClass).remove(opts.input.id);
            return true;
          } catch {
            return false;
          }
        },
      },
    };
  }

  /**
   * Builds an aggregate router object with procedure routers for all given entity classes.
   */
  public static buildAppRouter(
    dbContext: DbContext,
    entityClasses: Function[],
  ): Record<string, EntityTrpcRouter<any>> {
    const router: Record<string, EntityTrpcRouter<any>> = {};

    for (const cls of entityClasses) {
      const name = cls.name.charAt(0).toLowerCase() + cls.name.slice(1);
      const plural = name.endsWith('s') ? name : `${name}s`;
      router[plural] = this.createEntityRouter(dbContext, cls as any);
    }

    return router;
  }
}
