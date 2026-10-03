import { ModelMetadataRegistry, EntityMetadata } from '../model/EntityMetadata';
import { SqlType } from '../procedure/SqlType';
import { DbContext } from '../context/DbContext';
import { DataLoaderBatcher } from './DataLoaderBatcher';

export interface GraphQLResolverMap {
  Query: Record<string, (parent?: any, args?: any, context?: any) => Promise<any>>;
  Mutation: Record<string, (parent?: any, args?: any, context?: any) => Promise<any>>;
  [typeName: string]: Record<string, (parent?: any, args?: any, context?: any) => Promise<any>>;
}

/**
 * Automatically builds GraphQL schema definitions (SDL) and CRUD resolvers
 * directly from EntityTS entity metadata.
 */
export class GraphQLSchemaBuilder {
  private readonly entityClasses: Function[];
  private readonly registry = ModelMetadataRegistry.getInstance();

  constructor(entityClasses: Function[]) {
    this.entityClasses = entityClasses;
  }

  /**
   * Generates the GraphQL Schema Definition Language (SDL) string.
   */
  public generateSdl(): string {
    const types: string[] = [];
    const inputs: string[] = [];
    const queryFields: string[] = [];
    const mutationFields: string[] = [];

    for (const cls of this.entityClasses) {
      const meta = this.registry.get(cls);
      if (!meta) continue;

      const typeName = cls.name;
      const singular = typeName.charAt(0).toLowerCase() + typeName.slice(1);
      const plural = singular.endsWith('s') ? singular : `${singular}s`;

      const fields: string[] = [];
      const inputFields: string[] = [];
      const updateFields: string[] = [];

      for (const col of meta.columns.values()) {
        const gqlType = this.mapSqlTypeToGraphQL(col.sqlType, col.isPrimaryKey);
        const nonNull = col.isPrimaryKey || !col.isNullable ? '!' : '';
        fields.push(`  ${col.propertyName}: ${gqlType}${nonNull}`);

        if (!col.isPrimaryKey) {
          inputFields.push(`  ${col.propertyName}: ${gqlType}${col.isNullable ? '' : '!'}`);
          updateFields.push(`  ${col.propertyName}: ${gqlType}`);
        }
      }

      // Add relationship navigation fields
      if (meta.relations) {
        for (const [relName, rel] of meta.relations) {
          const targetName = rel.target().name;
          if (rel.type === 'hasMany' || rel.type === 'manyToMany') {
            fields.push(`  ${relName}: [${targetName}!]!`);
          } else {
            fields.push(`  ${relName}: ${targetName}`);
          }
        }
      }

      types.push(`type ${typeName} {\n${fields.join('\n')}\n}`);
      inputs.push(`input Create${typeName}Input {\n${inputFields.join('\n')}\n}`);
      inputs.push(`input Update${typeName}Input {\n${updateFields.join('\n')}\n}`);

      queryFields.push(`  ${plural}(skip: Int, limit: Int): [${typeName}!]!`);
      queryFields.push(`  ${singular}(id: ID!): ${typeName}`);

      mutationFields.push(`  create${typeName}(input: Create${typeName}Input!): ${typeName}!`);
      mutationFields.push(
        `  update${typeName}(id: ID!, input: Update${typeName}Input!): ${typeName}`,
      );
      mutationFields.push(`  delete${typeName}(id: ID!): Boolean!`);
    }

    return [
      ...types,
      ...inputs,
      `type Query {\n${queryFields.join('\n')}\n}`,
      `type Mutation {\n${mutationFields.join('\n')}\n}`,
    ].join('\n\n');
  }

  /**
   * Generates executable resolver map backed by EntityTS DbContext.
   */
  public generateResolvers(dbContext: DbContext): GraphQLResolverMap {
    const resolvers: GraphQLResolverMap = {
      Query: {},
      Mutation: {},
    };

    for (const cls of this.entityClasses) {
      const meta = this.registry.get(cls);
      if (!meta) continue;

      const typeName = cls.name;
      const singular = typeName.charAt(0).toLowerCase() + typeName.slice(1);
      const plural = singular.endsWith('s') ? singular : `${singular}s`;
      const pkProp = meta.primaryKeys[0] || 'id';

      // Query resolvers
      resolvers.Query[plural] = async (_parent: any, args: any) => {
        let set = dbContext.set(cls as any);
        if (typeof args?.skip === 'number') set = set.skip(args.skip);
        if (typeof args?.limit === 'number') set = set.take(args.limit);
        return set.toList();
      };

      resolvers.Query[singular] = async (_parent: any, args: any) => {
        return dbContext.set(cls as any).find(args.id);
      };

      // Mutation resolvers
      resolvers.Mutation[`create${typeName}`] = async (_parent: any, args: any) => {
        return dbContext.set(cls as any).add(args.input);
      };

      resolvers.Mutation[`update${typeName}`] = async (_parent: any, args: any) => {
        return dbContext.set(cls as any).update(args.id, args.input);
      };

      resolvers.Mutation[`delete${typeName}`] = async (_parent: any, args: any) => {
        try {
          await dbContext.set(cls as any).remove(args.id);
          return true;
        } catch {
          return false;
        }
      };

      // Relationship field resolvers using DataLoaderBatcher
      if (meta.relations && meta.relations.size > 0) {
        resolvers[typeName] = {};

        for (const [relName, rel] of meta.relations) {
          const targetCls = rel.target();
          const targetMeta = this.registry.get(targetCls);
          const targetPk = targetMeta?.primaryKeys[0] || 'id';

          if (rel.type === 'belongsTo') {
            const batcher = new DataLoaderBatcher<any, any>(async (keys: any[]) => {
              const children = await dbContext
                .set(targetCls as any)
                .where((c: any) => c.in(targetPk, keys))
                .toList();
              const map = new Map(children.map(c => [(c as any)[targetPk], c]));
              return keys.map(k => map.get(k) || null);
            });

            resolvers[typeName][relName] = async (parent: any) => {
              const fkVal = parent[rel.foreignKey];
              if (fkVal === undefined || fkVal === null) return null;
              return batcher.load(fkVal);
            };
          } else if (rel.type === 'hasMany') {
            const batcher = new DataLoaderBatcher<any, any[]>(async (parentIds: any[]) => {
              const children = await dbContext
                .set(targetCls as any)
                .where((c: any) => c.in(rel.foreignKey, parentIds))
                .toList();
              const map = new Map<any, any[]>();
              for (const c of children) {
                const fk = (c as any)[rel.foreignKey];
                const list = map.get(fk) || [];
                list.push(c);
                map.set(fk, list);
              }
              return parentIds.map(pId => map.get(pId) || []);
            });

            resolvers[typeName][relName] = async (parent: any) => {
              const pId = parent[pkProp];
              if (pId === undefined || pId === null) return [];
              return batcher.load(pId);
            };
          }
        }
      }
    }

    return resolvers;
  }

  private mapSqlTypeToGraphQL(sqlType?: SqlType, isPk?: boolean): string {
    if (isPk) return 'ID';
    switch (sqlType) {
      case SqlType.Int:
      case SqlType.SmallInt:
      case SqlType.TinyInt:
        return 'Int';
      case SqlType.BigInt:
      case SqlType.Float:
      case SqlType.Decimal:
      case SqlType.Real:
      case SqlType.Numeric:
        return 'Float';
      case SqlType.Bit:
        return 'Boolean';
      default:
        return 'String';
    }
  }
}
