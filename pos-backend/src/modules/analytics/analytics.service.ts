import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

function getTzDateBoundaries(fromString: string, toString: string, timeZone = 'America/Lima') {
  const parsePart = (str: string, isEnd = false) => {
    const parts = str.split('-').map(Number);
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || 1;
    const d = parts[2] || 1;
    const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const invUtc = new Date(startUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    const localInTz = new Date(startUtc.toLocaleString('en-US', { timeZone }));
    const offsetMs = invUtc.getTime() - localInTz.getTime();

    if (isEnd) {
      return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) + offsetMs);
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + offsetMs);
  };

  const from = parsePart(fromString, false);
  const to = parsePart(toString, true);
  return { from, to };
}

function formatDateInTz(date: Date, timeZone = 'America/Lima'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

function formatHourInTz(date: Date, timeZone = 'America/Lima'): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    const h = hourPart ? parseInt(hourPart.value, 10) : date.getUTCHours();
    return h === 24 ? 0 : h;
  } catch {
    return date.getHours();
  }
}

function enumerateDatesInRange(fromString: string, toString: string): string[] {
  let [startStr, endStr] = [fromString, toString];
  if (startStr > endStr) {
    [startStr, endStr] = [endStr, startStr];
  }
  const dates: string[] = [];
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = endStr.split('-').map(Number);
  const cur = new Date(Date.UTC(y1, m1 - 1, d1));
  const end = new Date(Date.UTC(y2, m2 - 1, d2));

  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async getAnalytics(
    fromString?: string,
    toString?: string,
    restaurantIdParam?: string | null,
    clientTimezone = 'America/Lima',
  ) {
    let timeZone = clientTimezone || 'America/Lima';
    try {
      Intl.DateTimeFormat(undefined, { timeZone });
    } catch {
      timeZone = 'America/Lima';
    }

    const now = new Date();
    const todayStr = formatDateInTz(now, timeZone);
    const fromStr = fromString || todayStr;
    const toStr = toString || todayStr;

    const { from, to } = getTzDateBoundaries(fromStr, toStr, timeZone);

    const clsId = this.cls.get('restaurantId');
    const restaurantId = (restaurantIdParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantIdParam))
      ? restaurantIdParam
      : (clsId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clsId) ? clsId : null);

    // 1. Pagos del rango en la zona horaria del cliente
    const paymentWhere: any = {
      createdAt: { gte: from, lte: to },
      ...(restaurantId ? { order: { restaurantId } } : { order: { restaurantId: '00000000-0000-0000-0000-000000000000' } }),
    };

    // 2. Órdenes cerradas que tengan pagos en el rango O hayan sido creadas en el rango
    // (Evita incluir órdenes huérfanas de días pasados editadas hoy vía updatedAt)
    const orderWhere: any = {
      status: 'CLOSED',
      OR: [
        { payments: { some: { createdAt: { gte: from, lte: to } } } },
        { createdAt: { gte: from, lte: to } },
      ],
      ...(restaurantId ? { restaurantId } : { restaurantId: '00000000-0000-0000-0000-000000000000' }),
    };

    // Consultas concurrentes
    const [payments, orders] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: {
          id: true,
          orderId: true,
          amount: true,
          tipAmount: true,
          paymentMethod: true,
          createdAt: true,
        },
      }),
      this.prisma.order.findMany({
        where: orderWhere,
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          payments: {
            select: {
              id: true,
              createdAt: true,
              amount: true,
            },
          },
          items: {
            where: { parentItemId: null },
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              product: {
                select: {
                  name: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalTips = payments.reduce((s, p) => s + Number(p.tipAmount || 0), 0);
    const totalOrders = orders.length;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Top payment method
    const methodTotals: Record<string, number> = {};
    for (const p of payments) {
      const m = String(p.paymentMethod || 'CASH');
      methodTotals[m] = (methodTotals[m] ?? 0) + Number(p.amount || 0);
    }
    const topPaymentMethod = Object.entries(methodTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    // ── Revenue by day (Inicialización exhaustiva de todos los días del rango) ──
    const dateList = enumerateDatesInRange(fromStr, toStr);
    const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
    for (const d of dateList) {
      byDay[d] = { date: d, revenue: 0, orders: 0 };
    }

    for (const p of payments) {
      const day = formatDateInTz(p.createdAt, timeZone);
      if (byDay[day]) {
        byDay[day].revenue += Number(p.amount || 0);
      }
    }

    for (const o of orders) {
      const pInRange = o.payments?.find((p) => p.createdAt >= from && p.createdAt <= to);
      const dateToUse = pInRange ? pInRange.createdAt : o.createdAt;
      const day = formatDateInTz(dateToUse, timeZone);
      if (byDay[day]) {
        byDay[day].orders += 1;
      }
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
        prodMap[pid].revenue += Number(item.unitPrice || 0) * Number(item.quantity || 0);
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
      methodMap[m].count += 1;
    }
    const paymentMethods = Object.values(methodMap);

    // ── Hourly heatmap (0 a 23 en la zona horaria del restaurante) ────────────
    const hourlyMap: Record<number, { hour: number; orders: number; revenue: number }> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = { hour: h, orders: 0, revenue: 0 };

    for (const p of payments) {
      if (p.createdAt) {
        const h = formatHourInTz(p.createdAt, timeZone);
        if (hourlyMap[h]) {
          hourlyMap[h].revenue += Number(p.amount || 0);
        }
      }
    }

    for (const o of orders) {
      const pInRange = o.payments?.find((p) => p.createdAt >= from && p.createdAt <= to);
      const dateToUse = pInRange ? pInRange.createdAt : o.createdAt;
      if (dateToUse) {
        const h = formatHourInTz(dateToUse, timeZone);
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
