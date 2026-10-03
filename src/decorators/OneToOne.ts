import { ModelMetadataRegistry } from '../model/EntityMetadata';

export interface OneToOneOptions {
  foreignKey?: string;
  lazy?: boolean;
  cascade?: boolean | ('insert' | 'update' | 'delete')[];
}

/**
 * Property decorator establishing a one-to-one relationship with another entity.
 */
export function OneToOne(
  target: () => Function,
  inverseSideOrOptions?: ((object: any) => any) | OneToOneOptions | string,
  options?: OneToOneOptions,
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
      type: 'hasOne',
      target,
      foreignKey,
      cascade,
      lazy,
      inverseSide,
    });
  };
}
