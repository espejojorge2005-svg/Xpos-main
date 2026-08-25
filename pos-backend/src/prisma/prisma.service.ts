import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

const TENANT_MODELS = [
  'Zone', 'Category', 'Product', 'InventoryItem',
  'KitchenStation', 'Order', 'CashShift', 'User'
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly extendedClient: any;

  constructor(private cls: ClsService) {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    this.extendedClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const restaurantId = cls.get('restaurantId');
            
            if (restaurantId && TENANT_MODELS.includes(model)) {
              const anyArgs = (args || {}) as any;
              
              if (operation === 'create') {
                 if (!anyArgs.data?.restaurantId) {
                   anyArgs.data = { ...anyArgs.data, restaurantId };
                 }
              } else if (operation === 'createMany') {
                 if (Array.isArray(anyArgs.data)) {
                   anyArgs.data = anyArgs.data.map((d: any) => d.restaurantId ? d : { ...d, restaurantId });
                 } else if (anyArgs.data && !anyArgs.data.restaurantId) {
                   anyArgs.data.restaurantId = restaurantId;
                 }
              } else if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'].includes(operation)) {
                 anyArgs.where = { ...anyArgs.where, restaurantId };
              }
              return query(anyArgs);
            }
            return query(args);
          },
        },
      },
    });

    return new Proxy(this, {
      get: (target, prop) => {
        if (typeof prop === 'string' && TENANT_MODELS.map(m => m.toLowerCase()).includes(prop.toLowerCase())) {
           return this.extendedClient[prop];
        }
        return Reflect.get(target, prop);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}