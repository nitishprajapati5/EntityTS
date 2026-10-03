import { ModelMetadataRegistry } from '../model/EntityMetadata';

export interface OneToManyOptions {
  foreignKey?: string;
  lazy?: boolean;
  cascade?: boolean | ('insert' | 'update' | 'delete')[];
}

/**
 * Property decorator establishing a one-to-many relationship with another entity.
 * Supports both TypeORM style `@OneToMany(() => Post, p => p.user, { cascade: true })`
 * and EntityTS `@OneToMany(() => Post, { foreignKey: 'userId' })`.
 */
export function OneToMany(
  target: () => Function,
  inverseSideOrOptions?: ((object: any) => any) | OneToManyOptions | string,
  options?: OneToManyOptions,
): PropertyDecorator {
  return (proto: Object, propertyKey: string | symbol) => {
    const propName = String(propertyKey);
    let foreignKey = `${proto.constructor.name.toLowerCase()}Id`;
    let cascade: boolean | ('insert' | 'update' | 'delete')[] | undefined;
    let lazy: boolean | undefined;
    let inverseSide: ((object: any) => any) | undefined;

    if (typeof inverseSideOrOptions === 'function') {
      inverseSide = inverseSideOrOptions;
      if (options) {
        if (options.foreignKey) foreignKey = options.foreignKey;
        cascade = options.cascade;
        lazy = options.lazy;
      }
    } else if (typeof inverseSideOrOptions === 'string') {
      foreignKey = inverseSideOrOptions;
    } else if (typeof inverseSideOrOptions === 'object' && inverseSideOrOptions !== null) {
      if (inverseSideOrOptions.foreignKey) foreignKey = inverseSideOrOptions.foreignKey;
      cascade = inverseSideOrOptions.cascade;
      lazy = inverseSideOrOptions.lazy;
    }

    const metadata = ModelMetadataRegistry.getInstance().getOrCreate(proto.constructor);
    metadata.relations.set(propName, {
      propertyName: propName,
      type: 'hasMany',
      target,
      foreignKey,
      cascade,
      lazy,
      inverseSide,
    });
  };
}
