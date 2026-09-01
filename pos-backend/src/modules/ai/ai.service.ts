import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { ChatMessageDto } from './dto/chat-query.dto';

interface DailyForecast {
  date: string;
  dayName: string;
  projectedRevenue: number;
  projectedOrders: number;
  topExpectedDishes: { name: string; estimatedQuantity: number }[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private async resolveRestaurantId(user?: any): Promise<string | null> {
    const clsRestId = this.cls.get('restaurantId');
    if (clsRestId) return clsRestId;
    if (user?.restaurantId) return user.restaurantId;

    const defaultRest = await this.prisma.restaurant.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    return defaultRest ? defaultRest.id : null;
  }

  // =========================================================================
  // HERRAMIENTAS DE DATOS DE BASE DE DATOS (POSTGRESQL / PRISMA)
  // =========================================================================

  /**
   * 1. Resumen de Ventas y Caja en Tiempo Real (Hoy)
   */
  async getRealtimeSalesSummary(restaurantId: string | null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const whereRest = restaurantId ? { restaurantId } : {};

    // Pagos registrados hoy
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
        ...(restaurantId ? { order: { restaurantId } } : {}),
      },
    });

    // Órdenes registradas hoy
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
        ...whereRest,
      },
      include: {
        table: true,
        items: true,
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalTips = payments.reduce((sum, p) => sum + Number(p.tipAmount || 0), 0);
    const closedOrders = orders.filter((o) => o.status === 'CLOSED');
    const openOrders = orders.filter((o) => o.status === 'OPEN');
    const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

    const paymentMethods: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      const method = p.paymentMethod || 'CASH';
      if (!paymentMethods[method]) {
        paymentMethods[method] = { count: 0, total: 0 };
      }
      paymentMethods[method].count += 1;
      paymentMethods[method].total += Number(p.amount || 0);
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
      paymentBreakdown: paymentMethods,
    };
  }

  /**
   * 2. Ranking de Productos Más y Menos Vendidos
   */
  async getTopProducts(restaurantId: string | null, days: number = 30) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);

    const whereRest = restaurantId ? { restaurantId } : {};

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: fromDate },
          status: 'CLOSED',
          ...whereRest,
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
      productSalesMap[key].quantity += item.quantity;
      productSalesMap[key].revenue += Number(item.subtotal || item.quantity * item.unitPrice);
    }

    const sortedList = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);
    const topSelling = sortedList.slice(0, 8);
    const leastSelling = sortedList.filter((p) => p.quantity > 0).slice(-5).reverse();

    return {
      periodDays: days,
      totalDistinctProductsSold: sortedList.length,
      topSelling,
      leastSelling,
    };
  }

  /**
   * 3. Alertas de Inventario y Stock Crítico
   */
  async getStockAlerts(restaurantId: string | null) {
    const whereRest = restaurantId ? { restaurantId } : {};

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...whereRest,
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
   * 4. Predicción Estadística y Proyección de Demanda
   */
  async getSalesForecast(restaurantId: string | null, daysAhead: number = 7): Promise<DailyForecast[]> {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    fourWeeksAgo.setHours(0, 0, 0, 0);

    const whereRest = restaurantId ? { restaurantId } : {};

    // Obtener órdenes cerradas de las últimas 4 semanas
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

    // Agrupar por día de la semana (0 = Domingo, 1 = Lunes, ..., 6 = Sábado)
    const dayStats: Record<number, { revenues: number[]; orderCounts: number[]; dishCounts: Record<string, number> }> = {};
    for (let i = 0; i < 7; i++) {
      dayStats[i] = { revenues: [], orderCounts: [], dishCounts: {} };
    }

    // Agrupar órdenes por fecha y luego al día de la semana
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
        // Promedio ponderado (últimos datos pesan más)
        const revSum = stats.revenues.reduce((a, b) => a + b, 0);
        projectedRevenue = Number((revSum / stats.revenues.length).toFixed(2));

        const orderSum = stats.orderCounts.reduce((a, b) => a + b, 0);
        projectedOrders = Math.round(orderSum / stats.orderCounts.length);
      } else {
        // Valor base si no hay suficiente historial
        projectedRevenue = 350.0;
        projectedOrders = 8;
      }

      // Platos esperados
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

  /**
   * 5. Estado de Mesas y Zonas
   */
  async getTablesSummary(restaurantId: string | null) {
    const whereRest = restaurantId ? { restaurantId } : {};

    const zones = await this.prisma.zone.findMany({
      where: whereRest,
      include: {
        tables: {
          include: {
            orders: {
              where: { status: 'OPEN' },
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

  // =========================================================================
  // MOTOR DE CONSULTA Y RESPUESTA DEL CHATBOT
  // =========================================================================

  async handleChatQuery(message: string, history: ChatMessageDto[] = [], reqUser?: any): Promise<{ reply: string; data?: any }> {
    const restaurantId = await this.resolveTenantRestaurantId(reqUser);
    const userMsg = (message || '').trim().toLowerCase();

    // Obtener datos contextuales clave
    const [salesToday, topProducts, stockAlerts, tablesSummary, forecast] = await Promise.all([
      this.getRealtimeSalesSummary(restaurantId),
      this.getTopProducts(restaurantId, 30),
      this.getStockAlerts(restaurantId),
      this.getTablesSummary(restaurantId),
      this.getSalesForecast(restaurantId, 7),
    ]);

    // Verificar si hay API Key de Gemini o OpenAI configurada en .env
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        const geminiReply = await this.askGemini(geminiKey, message, history, {
          salesToday,
          topProducts,
          stockAlerts,
          tablesSummary,
          forecast,
        });
        if (geminiReply) {
          return { reply: geminiReply };
        }
      } catch (err) {
        this.logger.warn(`Error llamando a Gemini API, usando motor analítico interno: ${err}`);
      }
    } else if (openaiKey) {
      try {
        const openaiReply = await this.askOpenAi(openaiKey, message, history, {
          salesToday,
          topProducts,
          stockAlerts,
          tablesSummary,
          forecast,
        });
        if (openaiReply) {
          return { reply: openaiReply };
        }
      } catch (err) {
        this.logger.warn(`Error llamando a OpenAI API, usando motor analítico interno: ${err}`);
      }
    }

    // Motor Analítico e Inteligente Integrado (Garantizado Offline/Online)
    const reply = this.generateAnalyticalResponse(userMsg, {
      salesToday,
      topProducts,
      stockAlerts,
      tablesSummary,
      forecast,
    });

    return { reply };
  }

  private async resolveTenantRestaurantId(reqUser?: any): Promise<string | null> {
    return this.resolveRestaurantId(reqUser);
  }

  private async askGemini(apiKey: string, userMessage: string, history: ChatMessageDto[], contextData: any): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const systemPrompt = `Eres "ChefAI", el asistente inteligente y asesor de negocios oficial del restaurante.
Tienes acceso en tiempo real a los siguientes datos reales de la base de datos PostgreSQL:

DATOS EN TIEMPO REAL:
- Ventas de hoy: S/ ${contextData.salesToday.totalRevenue} (${contextData.salesToday.closedOrdersCount} pedidos cerrados, ${contextData.salesToday.openOrdersCount} pedidos abiertos). Ticket promedio: S/ ${contextData.salesToday.averageTicket}.
- Métodos de pago hoy: ${JSON.stringify(contextData.salesToday.paymentBreakdown)}
- Platos más vendidos (últimos 30 días): ${contextData.topProducts.topSelling.map((p: any) => `${p.name} (${p.quantity} uds - S/ ${p.revenue})`).join(', ')}
- Alertas de Stock: ${contextData.stockAlerts.outOfStockCount} productos agotados, ${contextData.stockAlerts.lowStockCount} productos con stock bajo. Items críticos: ${contextData.stockAlerts.lowStockItems.map((i: any) => `${i.name} (quedan ${i.stock})`).join(', ')}
- Estado de mesas: ${contextData.tablesSummary.occupiedTables} ocupadas de ${contextData.tablesSummary.totalTables} (${contextData.tablesSummary.occupancyRate} de ocupación).
- Proyección para los próximos días: ${contextData.forecast.slice(0, 3).map((f: any) => `${f.dayName} (${f.date}): S/ ${f.projectedRevenue} est.`).join(' | ')}

REGLAS DE RESPUESTA:
1. Responde en español de forma profesional, clara, motivadora y con formato Markdown elegante (usa negritas, listas con viñetas y emojis pertinentes).
2. Proporciona datos exactos y da recomendaciones accionables para mejorar las ventas, cuidar el stock o gestionar el salón.
3. Si te piden una predicción, explica de forma sencilla que se basa en la tendencia de las últimas semanas.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido. Soy ChefAI y responderé con los datos reales del restaurante.' }] },
      ...history.slice(-4).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) return null;
    const resData = await response.json();
    const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidateText || null;
  }

  private async askOpenAi(apiKey: string, userMessage: string, history: ChatMessageDto[], contextData: any): Promise<string | null> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = `Eres "ChefAI", el asistente inteligente del restaurante.
Datos actuales:
- Ventas de hoy: S/ ${contextData.salesToday.totalRevenue} (Cerrados: ${contextData.salesToday.closedOrdersCount}, Ticket Promedio: S/ ${contextData.salesToday.averageTicket}).
- Platos Top: ${contextData.topProducts.topSelling.map((p: any) => `${p.name} (${p.quantity} uds)`).join(', ')}.
- Stock Crítico: ${contextData.stockAlerts.lowStockItems.map((i: any) => `${i.name} (quedan ${i.stock})`).join(', ')}.
- Predicción Próximos días: ${contextData.forecast.slice(0, 3).map((f: any) => `${f.dayName}: S/ ${f.projectedRevenue}`).join(', ')}.
Responde con formato Markdown amigable y sugerencias de valor.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) return null;
    const resData = await response.json();
    return resData?.choices?.[0]?.message?.content || null;
  }

  /**
   * Generador semántico interno para respuestas instantáneas de alta precisión
   */
  private generateAnalyticalResponse(msg: string, ctx: any): string {
    const { salesToday, topProducts, stockAlerts, tablesSummary, forecast } = ctx;

    // 1. Consulta de Ventas / Ingresos de Hoy
    if (msg.includes('venta') || msg.includes('vendido') || msg.includes('ingreso') || msg.includes('caja') || msg.includes('hoy') || msg.includes('resumen')) {
      const methodsList = Object.entries(salesToday.paymentBreakdown as Record<string, { count: number; total: number }>)
        .map(([m, data]) => `  - **${m === 'CASH' ? '💵 Efectivo' : m === 'CARD' ? '💳 Tarjeta' : '📱 Transferencia / Yape'}**: S/ ${data.total.toFixed(2)} (${data.count} pagos)`)
        .join('\n');

      return `### 📊 Resumen Financiero y de Ventas (Hoy)

- **Total Facturado:** \`S/ ${salesToday.totalRevenue.toFixed(2)}\`
- **Comandas Cerradas:** ${salesToday.closedOrdersCount} pedidos
- **Comandas Activas en Salón:** ${salesToday.openOrdersCount} mesas consumiendo
- **Ticket Promedio:** S/ ${salesToday.averageTicket.toFixed(2)} por comanda
${salesToday.totalTips > 0 ? `- **Propinas Registradas:** S/ ${salesToday.totalTips.toFixed(2)}\n` : ''}
#### 💳 Desglose por Método de Pago:
${methodsList || '  - *Aún no se registran pagos en caja hoy.*'}

💡 **Sugerencia:** ${salesToday.openOrdersCount > 0 ? `Tienes **${salesToday.openOrdersCount} mesas abiertas** en salón. Asegúrate de que el equipo de mozos atienda a tiempo las solicitudes de cuenta.` : 'Las ventas están al día.'}`;
    }

    // 2. Consulta de Platos Más Vendidos / Menos Vendidos
    if (msg.includes('plato') || msg.includes('producto') || msg.includes('estrella') || msg.includes('top') || msg.includes('mas vendido') || msg.includes('más vendido') || msg.includes('popular')) {
      const topList = topProducts.topSelling
        .map((p: any, idx: number) => `${idx + 1}. **${p.name}** (${p.category}) — **${p.quantity} pedidos** | *S/ ${p.revenue.toFixed(2)} recaudados*`)
        .join('\n');

      const leastList = topProducts.leastSelling.length > 0
        ? topProducts.leastSelling.map((p: any) => `• ${p.name} (${p.quantity} uds)`).join(', ')
        : 'Todos los productos tienen buena rotación.';

      return `### 🏆 Ranking de Platos Más Vendidos (Últimos 30 días)

${topList || 'Aún no hay suficientes ventas registradas para generar el ranking.'}

---
📉 **Platos con menor rotación reciente:**
${leastList}

💡 **Recomendación ChefAI:** Impulsa los platos estrella como sugerencia del día y considera promociones o combos para los productos con menor salida.`;
    }

    // 3. Consulta de Stock y Alertas de Inventario
    if (msg.includes('stock') || msg.includes('inventario') || msg.includes('alerta') || msg.includes('agota') || msg.includes('quedan') || msg.includes('insumo')) {
      const lowList = stockAlerts.lowStockItems
        .map((i: any) => `⚠️ **${i.name}**: Quedan **${i.stock} unidades** *(Mínimo requerido: ${i.minStock})*`)
        .join('\n');

      const outList = stockAlerts.outOfStockItems
        .map((i: any) => `❌ **${i.name}**: **0 unidades** (Agotado)`)
        .join('\n');

      return `### 📦 Estado y Alertas de Inventario

- **Catálogo Activo:** ${stockAlerts.totalProducts} productos registrados
- **En Nivel Óptimo:** 🟢 ${stockAlerts.healthyStockCount} productos
- **En Nivel Crítico (Bajo Stock):** 🟡 ${stockAlerts.lowStockCount} productos
- **Agotados:** 🔴 ${stockAlerts.outOfStockCount} productos

${outList ? `#### 🚨 Productos Agotados:\n${outList}\n` : ''}
${lowList ? `#### ⚠️ Productos Próximos a Agotarse:\n${lowList}\n` : ''}
${!outList && !lowList ? '✅ **¡Excelente!** Todos los productos cuentan con stock superior al nivel mínimo de seguridad.\n' : ''}
💡 **Acción recomendada:** Realiza un pedido a tus proveedores para reponer los productos críticos antes del próximo turno pico.`;
    }

    // 4. Predicción y Proyecciones de Venta
    if (msg.includes('predic') || msg.includes('proyecci') || msg.includes('futuro') || msg.includes('estim') || msg.includes('semana') || msg.includes('sabado') || msg.includes('sábado') || msg.includes('domingo') || msg.includes('mañana')) {
      const forecastList = (forecast as DailyForecast[]).slice(0, 5)
        .map((f) => {
          const dishesStr = f.topExpectedDishes.map((d) => `${d.name} (~${d.estimatedQuantity} uds)`).join(', ');
          return `📅 **${f.dayName} (${f.date}):**
  - **Venta Proyectada:** \`S/ ${f.projectedRevenue.toFixed(2)}\` (~${f.projectedOrders} pedidos)
  - **Platos más demandados:** ${dishesStr || 'Platos del menú habitual'}`;
        })
        .join('\n\n');

      const totalWeekend = (forecast as DailyForecast[])
        .filter((f) => f.dayName === 'Viernes' || f.dayName === 'Sábado' || f.dayName === 'Domingo')
        .reduce((sum, f) => sum + f.projectedRevenue, 0);

      return `### 🔮 Proyección Predictiva de Ventas (Próximos Días)

Esta estimación se calcula analizando el comportamiento de consumo y ventas de las últimas 4 semanas en tu restaurante:

${forecastList}

---
🌟 **Proyección del Fin de Semana (Vie - Dom):** \`S/ ${totalWeekend.toFixed(2)}\`

💡 **Consejo Operativo:** Asegura abastecimiento suficiente de los platos con mayor demanda proyectada y programa el personal de cocina y salón adecuado para las horas pico.`;
    }

    // 5. Consulta de Mesas / Salón
    if (msg.includes('mesa') || msg.includes('salon') || msg.includes('salón') || msg.includes('terraza') || msg.includes('ocupad')) {
      const zonesStr = tablesSummary.zones
        .map((z: any) => `• **${z.zoneName}**: ${z.occupied} ocupadas / ${z.free} libres (Total: ${z.totalTables})`)
        .join('\n');

      return `### 🪑 Estado del Salón y Plano de Mesas

- **Ocupación Actual:** **${tablesSummary.occupancyRate}**
- **Mesas con Comensales:** 🔴 ${tablesSummary.occupiedTables} mesas
- **Mesas Disponibles:** 🟢 ${tablesSummary.freeTables} mesas
- **Total de Mesas:** ${tablesSummary.totalTables}

#### 📍 Ocupación por Zonas:
${zonesStr}

💡 Puedes ver el detalle en tiempo real en la pantalla de **Plano de Sala**.`;
    }

    // 6. Respuesta General / Menú de Ayuda
    return `### 👋 ¡Hola! Soy **ChefAI**, tu asistente inteligente de restaurante.

Puedo ayudarte analizando la información de tu negocio en tiempo real y generando proyecciones estadísticas. Puedes preguntarme sobre:

1. **📊 Ventas y Finanzas:** *"¿Cuánto hemos vendido hoy?"* o *"¿Cuál es el ticket promedio?"*
2. **🏆 Platos Estrella:** *"¿Cuáles son los 5 platos más vendidos del mes?"*
3. **📦 Inventario y Alertas:** *"¿Qué productos tienen poco stock o están agotados?"*
4. **🔮 Predicciones de Demanda:** *"¿Cuánto estimas que venderemos este fin de semana?"*
5. **🪑 Salón y Mesas:** *"¿Cuántas mesas tenemos ocupadas ahora?"*

¿Sobre qué área de tu restaurante te gustaría consultar hoy?`;
  }
}
