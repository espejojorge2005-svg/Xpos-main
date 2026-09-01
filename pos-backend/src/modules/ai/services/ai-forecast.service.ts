import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DailyForecast } from '../ai.types';

@Injectable()
export class AiForecastService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Proyecta ventas y demanda de platos para los próximos N días analizando las últimas 4 semanas
   */
  async getSalesForecast(restaurantId: string | null, daysAhead: number = 7): Promise<DailyForecast[]> {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    fourWeeksAgo.setHours(0, 0, 0, 0);

    const whereRest = restaurantId ? { restaurantId } : {};

    const closedOrders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: fourWeeksAgo },
        status: 'CLOSED',
        ...whereRest,
      },
      include: {
        items: {
          where: { parentItemId: null },
          include: { product: true },
        },
      },
    });

    const dayStats: Record<number, { revenues: number[]; orderCounts: number[]; dishCounts: Record<string, number> }> = {};
    for (let i = 0; i < 7; i++) {
      dayStats[i] = { revenues: [], orderCounts: [], dishCounts: {} };
    }

    const ordersByDayKey: Record<string, { dayOfWeek: number; revenue: number; orderCount: number; dishes: Record<string, number> }> = {};

    for (const order of closedOrders) {
      const dayKey = order.createdAt.toISOString().slice(0, 10);
      const dayOfWeek = order.createdAt.getDay();

      if (!ordersByDayKey[dayKey]) {
        ordersByDayKey[dayKey] = { dayOfWeek, revenue: 0, orderCount: 0, dishes: {} };
      }
      ordersByDayKey[dayKey].revenue += Number(order.totalAmount || 0);
      ordersByDayKey[dayKey].orderCount += 1;

      for (const it of order.items) {
        const pName = it.product?.name || 'Producto';
        ordersByDayKey[dayKey].dishes[pName] = (ordersByDayKey[dayKey].dishes[pName] || 0) + it.quantity;
      }
    }

    for (const dayData of Object.values(ordersByDayKey)) {
      dayStats[dayData.dayOfWeek].revenues.push(dayData.revenue);
      dayStats[dayData.dayOfWeek].orderCounts.push(dayData.orderCount);
      for (const [dish, qty] of Object.entries(dayData.dishes)) {
        dayStats[dayData.dayOfWeek].dishCounts[dish] = (dayStats[dayData.dayOfWeek].dishCounts[dish] || 0) + qty;
      }
    }

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const forecast: DailyForecast[] = [];

    const now = new Date();
    for (let d = 1; d <= daysAhead; d++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + d);
      const dow = targetDate.getDay();

      const stats = dayStats[dow];
      let projectedRevenue = 0;
      let projectedOrders = 0;

      if (stats.revenues.length > 0) {
        const revSum = stats.revenues.reduce((a, b) => a + b, 0);
        projectedRevenue = Number((revSum / stats.revenues.length).toFixed(2));

        const orderSum = stats.orderCounts.reduce((a, b) => a + b, 0);
        projectedOrders = Math.round(orderSum / stats.orderCounts.length);
      } else {
        projectedRevenue = 350.0;
        projectedOrders = 8;
      }

      const topDishes = Object.entries(stats.dishCounts)
        .map(([name, totalQty]) => ({
          name,
          estimatedQuantity: Math.max(1, Math.round(totalQty / Math.max(1, stats.revenues.length))),
        }))
        .sort((a, b) => b.estimatedQuantity - a.estimatedQuantity)
        .slice(0, 4);

      forecast.push({
        date: targetDate.toISOString().slice(0, 10),
        dayName: dayNames[dow],
        projectedRevenue,
        projectedOrders,
        topExpectedDishes: topDishes,
      });
    }

    return forecast;
  }
}
