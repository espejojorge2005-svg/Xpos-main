import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics(from: Date, to: Date) {
    // Extend 'to' to end of the day
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    // ── 1. PAYMENTS in range ─────────────────────────────────────────────────
    const payments = await this.prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: toEnd } },
      include: { order: { include: { items: { where: { parentItemId: null } }, table: true } } },
    });

    // ── 2. ORDERS with items in range ────────────────────────────────────────
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'CLOSED',
        updatedAt: { gte: from, lte: toEnd },
      },
      include: { items: { where: { parentItemId: null }, include: { product: { include: { category: true } } } } },
    });

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalTips    = payments.reduce((s, p) => s + Number(p.tipAmount), 0);
    const totalOrders  = orders.length;
    const avgTicket    = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Top payment method
    const methodTotals: Record<string, number> = {};
    for (const p of payments) {
      const m = String(p.paymentMethod);
      methodTotals[m] = (methodTotals[m] ?? 0) + Number(p.amount);
    }
    const topPaymentMethod = Object.entries(methodTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    // ── Revenue by day ────────────────────────────────────────────────────────
    const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
    for (const p of payments) {
      const day = p.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, orders: 0 };
      byDay[day].revenue += Number(p.amount);
    }
    for (const o of orders) {
      const day = o.updatedAt.toISOString().slice(0, 10);
      if (byDay[day]) byDay[day].orders += 1;
      else byDay[day] = { date: day, revenue: 0, orders: 1 };
    }
    const revenueByDay = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    // ── Top products ──────────────────────────────────────────────────────────
    const prodMap: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const pid = item.productId;
        if (!prodMap[pid]) prodMap[pid] = { name: item.product.name, category: item.product.category?.name ?? '', quantity: 0, revenue: 0 };
        prodMap[pid].quantity += item.quantity;
        prodMap[pid].revenue  += Number(item.unitPrice) * item.quantity;
      }
    }
    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Payment methods breakdown ─────────────────────────────────────────────
    const methodMap: Record<string, { method: string; amount: number; count: number }> = {};
    for (const p of payments) {
      const m = String(p.paymentMethod);
      if (!methodMap[m]) methodMap[m] = { method: m, amount: 0, count: 0 };
      methodMap[m].amount += Number(p.amount);
      methodMap[m].count  += 1;
    }
    const paymentMethods = Object.values(methodMap);

    // ── Hourly heatmap ────────────────────────────────────────────────────────
    const hourlyMap: Record<number, { hour: number; orders: number; revenue: number }> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = { hour: h, orders: 0, revenue: 0 };
    for (const p of payments) {
      const h = p.createdAt.getHours();
      hourlyMap[h].revenue += Number(p.amount);
    }
    for (const o of orders) {
      const h = o.updatedAt.getHours();
      hourlyMap[h].orders += 1;
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
