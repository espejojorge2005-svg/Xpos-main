import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Importaciones de nuestra infraestructura y dominios
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { FloorModule } from './modules/floor/floor.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module'; // <-- El nuevo módulo de pagos
import { KitchenStationsModule } from './modules/kitchen-stations/kitchen-stations.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './api/v1/products/products.module';
import { RestaurantConfigModule } from './modules/restaurant-config/restaurant-config.module';
import { UsersModule } from './modules/users/users.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SaasModule } from './modules/saas/saas.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    PrismaModule,
    FloorModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule, // <-- Registrado aquí para habilitar la ruta POST
    KitchenStationsModule,
    AuthModule, ProductsModule,
    RestaurantConfigModule,
    UsersModule,
    AnalyticsModule,
    SaasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}