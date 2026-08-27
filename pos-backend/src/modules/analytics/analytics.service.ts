import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async getAnalytics(fromString?: string, toString?: string) {
    const now = new Date();
    let from: Date;
    let to: Date;

    if (fromString) {
      const parts = fromString.split('-');
      if (parts.length === 3) {
        from = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
      } else {
        from = new Date(fromString);
        from.setHours(0, 0, 0, 0);
      }
    } else {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
    }

    if (toString) {
      const parts = toString.split('-');
      if (parts.length === 3) {
        to = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
      } else {
        to = new Date(toString);
        to.setHours(23, 59, 59, 999);
      }
    } else {
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
    }

    const restaurantId = this.cls.get('restaurantId');
    const orderWhere: any = {
      status: 'CLOSED',
      updatedAt: { gte: from, lte: to },
    };
    if (restaurantId) {
      orderWhere.restaurantId = restaurantId;
    }

    const paymentWhere: any = {
      createdAt: { gte: from, lte: to },
    };
    if (restaurantId) {
      paymentWhere.order = { restaurantId };
    }

    // ── 1. PAYMENTS in range ─────────────────────────────────────────────────
    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      include: { order: { include: { items: { where: { parentItemId: null } }, table: true } } },
    });

    // ── 2. ORDERS with items in range ────────────────────────────────────────
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      include: { items: { where: { parentItemId: null }, include: { product: { include: { category: true } } } } },
    });

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalTips    = payments.reduce((s, p) => s + Number(p.tipAmount || 0), 0);
    const totalOrders  = orders.length;
    const avgTicket    = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Top payment method
    const methodTotals: Record<string, number> = {};
    for (const p of payments) {
      const m = String(p.paymentMethod || 'CASH');
      methodTotals[m] = (methodTotals[m] ?? 0) + Number(p.amount || 0);
    }
    const topPaymentMethod = Object.entries(methodTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    // ── Revenue by day ────────────────────────────────────────────────────────
    const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
    for (const p of payments) {
      const day = p.createdAt ? p.createdAt.toISOString().slice(0, 10) : from.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, orders: 0 };
      byDay[day].revenue += Number(p.amount || 0);
    }
    for (const o of orders) {
      const day = o.updatedAt ? o.updatedAt.toISOString().slice(0, 10) : from.toISOString().slice(0, 10);
      if (byDay[day]) byDay[day].orders += 1;
      else byDay[day] = { date: day, revenue: 0, orders: 1 };
    }
    const revenueByDay = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    // ── Top products ──────────────────────────────────────────────────────────
    const prodMap: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};
    for (const order of orders) {
      for (const item of order.items || []) {
        const pid = item.productId || item.id;
        const prodName = item.product?.name || 'Producto';
        const catName = item.product?.category?.name || 'General';
        if (!prodMap[pid]) prodMap[pid] = { name: prodName, category: catName, quantity: 0, revenue: 0 };
        prodMap[pid].quantity += Number(item.quantity || 0);
        prodMap[pid].revenue  += Number(item.unitPrice || 0) * Number(item.quantity || 0);
      }
    }
    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Payment methods breakdown ─────────────────────────────────────────────
    const methodMap: Record<string, { method: string; amount: number; count: number }> = {};
    for (const p of payments) {
      const m = String(p.paymentMethod || 'CASH');
      if (!methodMap[m]) methodMap[m] = { method: m, amount: 0, count: 0 };
      methodMap[m].amount += Number(p.amount || 0);
      methodMap[m].count  += 1;
    }
    const paymentMethods = Object.values(methodMap);

    // ── Hourly heatmap ────────────────────────────────────────────────────────
    const hourlyMap: Record<number, { hour: number; orders: number; revenue: number }> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = { hour: h, orders: 0, revenue: 0 };
    for (const p of payments) {
      if (p.createdAt) {
        const h = p.createdAt.getHours();
        if (hourlyMap[h]) {
          hourlyMap[h].revenue += Number(p.amount || 0);
        }
      }
    }
    for (const o of orders) {
      if (o.updatedAt) {
        const h = o.updatedAt.getHours();
        if (hourlyMap[h]) {
          hourlyMap[h].orders += 1;
        }
      }
    }
    const hourlyHeatmap = Object.values(hourlyMap);

    return {
      kpis: { totalRevenue, totalTips, totalOrders, avgTicket, topPaymentMethod },
      revenueByDay,
      topProducts,
      paymentMethods,
      hourlyHeatmap,
    };
  }
}

