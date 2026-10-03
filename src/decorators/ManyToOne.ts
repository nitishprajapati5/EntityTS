import { ModelMetadataRegistry } from '../model/EntityMetadata';

export interface ManyToOneOptions {
  foreignKey?: string;
  lazy?: boolean;
  cascade?: boolean | ('insert' | 'update' | 'delete')[];
}

/**
 * Property decorator establishing a many-to-one relationship with a parent entity.
 * Supports both TypeORM style `@ManyToOne(() => User, u => u.posts, { foreignKey: 'userId' })`
 * and EntityTS style `@ManyToOne(() => User, 'userId')`.
 */
export function ManyToOne(
  target: () => Function,
  inverseSideOrOptions?: ((object: any) => any) | ManyToOneOptions | string,
  options?: ManyToOneOptions,
): PropertyDecorator {
  return (proto: Object, propertyKey: string | symbol) => {
    const propName = String(propertyKey);
    let foreignKey = `${propName}Id`;
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
      type: 'belongsTo',
      target,
      foreignKey,
      cascade,
      lazy,
      inverseSide,
    });
  };
}
