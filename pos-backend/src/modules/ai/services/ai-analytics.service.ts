import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SalesSummary, TopProductsReport, StockAlertsReport, TablesSummaryReport } from '../ai.types';

@Injectable()
export class AiAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene el resumen financiero y de pedidos del día actual para un restaurante específico
   */
  async getRealtimeSalesSummary(restaurantId: string | null): Promise<SalesSummary> {
    if (!restaurantId) {
      return {
        date: new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        totalRevenue: 0,
        totalTips: 0,
        totalOrdersCount: 0,
        closedOrdersCount: 0,
        openOrdersCount: 0,
        cancelledOrdersCount: 0,
        averageTicket: 0,
        paymentBreakdown: {},
      };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [payments, orders] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: startOfDay, lte: endOfDay },
          order: { restaurantId },
        },
      }),
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startOfDay, lte: endOfDay },
          restaurantId,
        },
        include: { table: true, items: true },
      }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalTips = payments.reduce((sum, p) => sum + Number(p.tipAmount || 0), 0);
    const closedOrders = orders.filter((o) => o.status === 'CLOSED');
    const openOrders = orders.filter((o) => o.status === 'OPEN');
    const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      const method = p.paymentMethod || 'CASH';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, total: 0 };
      }
      paymentBreakdown[method].count += 1;
      paymentBreakdown[method].total += Number(p.amount || 0);
    }

    const avgTicket = closedOrders.length > 0 ? totalRevenue / closedOrders.length : 0;

    return {
      date: new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalTips: Number(totalTips.toFixed(2)),
      totalOrdersCount: orders.length,
      closedOrdersCount: closedOrders.length,
      openOrdersCount: openOrders.length,
      cancelledOrdersCount: cancelledOrders.length,
      averageTicket: Number(avgTicket.toFixed(2)),
      paymentBreakdown,
    };
  }

  /**
   * Obtiene el ranking de platos y bebidas más y menos vendidos del restaurante
   */
  async getTopProducts(restaurantId: string | null, days: number = 30): Promise<TopProductsReport> {
    if (!restaurantId) {
      return {
        periodDays: days,
        totalDistinctProductsSold: 0,
        topSelling: [],
        leastSelling: [],
      };
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: fromDate },
          status: 'CLOSED',
          restaurantId,
        },
        parentItemId: null,
      },
      include: {
        product: {
          include: { category: true },
        },
      },
    });

    const productSalesMap: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};

    for (const item of orderItems) {
      const pName = item.product?.name || 'Producto';
      const catName = item.product?.category?.name || 'General';
      const key = item.productId || pName;

      if (!productSalesMap[key]) {
        productSalesMap[key] = { name: pName, category: catName, quantity: 0, revenue: 0 };
      }
      const itemRevenue = item.subtotal ? Number(item.subtotal) : item.quantity * Number(item.unitPrice || 0);
      productSalesMap[key].quantity += item.quantity;
      productSalesMap[key].revenue += itemRevenue;
    }

    const sortedList = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);

    return {
      periodDays: days,
      totalDistinctProductsSold: sortedList.length,
      topSelling: sortedList.slice(0, 8),
      leastSelling: sortedList.filter((p) => p.quantity > 0).slice(-5).reverse(),
    };
  }

  /**
   * Consulta alertas de inventario y productos por debajo del stock mínimo del restaurante
   */
  async getStockAlerts(restaurantId: string | null): Promise<StockAlertsReport> {
    if (!restaurantId) {
      return {
        totalProducts: 0,
        outOfStockCount: 0,
        lowStockCount: 0,
        healthyStockCount: 0,
        outOfStockItems: [],
        lowStockItems: [],
      };
    }

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        restaurantId,
      },
      include: { category: true },
      orderBy: { stock: 'asc' },
    });

    const outOfStock = products.filter((p) => p.stock <= 0);
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= (p.minStock || 5));
    const healthyStock = products.filter((p) => p.stock > (p.minStock || 5));

    return {
      totalProducts: products.length,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
      healthyStockCount: healthyStock.length,
      outOfStockItems: outOfStock.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category?.name || 'Sin Categoría',
        stock: p.stock,
        minStock: p.minStock,
      })),
      lowStockItems: lowStock.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category?.name || 'Sin Categoría',
        stock: p.stock,
        minStock: p.minStock,
      })),
    };
  }

  /**
   * Consulta el estado de ocupación de las mesas del salón del restaurante
   */
  async getTablesSummary(restaurantId: string | null): Promise<TablesSummaryReport> {
    if (!restaurantId) {
      return {
        totalTables: 0,
        occupiedTables: 0,
        freeTables: 0,
        occupancyRate: '0%',
        zones: [],
      };
    }

    const zones = await this.prisma.zone.findMany({
      where: { restaurantId },
      include: {
        tables: {
          include: {
            orders: {
              where: { status: 'OPEN', restaurantId },
              take: 1,
            },
          },
        },
      },
    });

    let totalTables = 0;
    let occupiedTables = 0;
    let freeTables = 0;

    const zoneDetails = zones.map((z) => {
      const zTotal = z.tables.length;
      const zOccupied = z.tables.filter((t) => t.status === 'OCCUPIED' || t.orders.length > 0).length;
      const zFree = zTotal - zOccupied;

      totalTables += zTotal;
      occupiedTables += zOccupied;
      freeTables += zFree;

      return {
        zoneName: z.name,
        totalTables: zTotal,
        occupied: zOccupied,
        free: zFree,
      };
    });

    return {
      totalTables,
      occupiedTables,
      freeTables,
      occupancyRate: totalTables > 0 ? `${Math.round((occupiedTables / totalTables) * 100)}%` : '0%',
      zones: zoneDetails,
    };
  }
}
