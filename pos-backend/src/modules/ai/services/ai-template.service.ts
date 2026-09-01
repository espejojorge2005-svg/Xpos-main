import { Injectable } from '@nestjs/common';
import { AiDataContext, DailyForecast } from '../ai.types';

@Injectable()
export class AiTemplateService {
  /**
   * Generador semántico para respuestas analíticas estructuradas
   */
  generateResponse(userMessage: string, ctx: AiDataContext): string {
    const msg = userMessage.toLowerCase();
    const { salesToday, topProducts, stockAlerts, tablesSummary, forecast } = ctx;

    // 1. Resumen de Ventas / Ingresos de Hoy
    if (msg.includes('venta') || msg.includes('vendido') || msg.includes('ingreso') || msg.includes('caja') || msg.includes('hoy') || msg.includes('resumen')) {
      return this.renderSalesSummary(salesToday);
    }

    // 2. Ranking de Platos Más / Menos Vendidos
    if (msg.includes('plato') || msg.includes('producto') || msg.includes('estrella') || msg.includes('top') || msg.includes('mas vendido') || msg.includes('más vendido') || msg.includes('popular')) {
      return this.renderTopProducts(topProducts);
    }

    // 3. Alertas de Stock e Inventario
    if (msg.includes('stock') || msg.includes('inventario') || msg.includes('alerta') || msg.includes('agota') || msg.includes('quedan') || msg.includes('insumo')) {
      return this.renderStockAlerts(stockAlerts);
    }

    // 4. Predicción y Proyecciones de Demanda
    if (msg.includes('predic') || msg.includes('proyecci') || msg.includes('futuro') || msg.includes('estim') || msg.includes('semana') || msg.includes('sabado') || msg.includes('sábado') || msg.includes('domingo') || msg.includes('mañana')) {
      return this.renderForecast(forecast);
    }

    // 5. Estado de Mesas y Salón
    if (msg.includes('mesa') || msg.includes('salon') || msg.includes('salón') || msg.includes('terraza') || msg.includes('ocupad')) {
      return this.renderTablesSummary(tablesSummary);
    }

    // 6. Menú Principal de Ayuda
    return this.renderHelpMenu();
  }

  private renderSalesSummary(salesToday: AiDataContext['salesToday']): string {
    const methodsList = Object.entries(salesToday.paymentBreakdown)
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

  private renderTopProducts(topProducts: AiDataContext['topProducts']): string {
    const topList = topProducts.topSelling
      .map((p, idx) => `${idx + 1}. **${p.name}** (${p.category}) — **${p.quantity} pedidos** | *S/ ${p.revenue.toFixed(2)} recaudados*`)
      .join('\n');

    const leastList = topProducts.leastSelling.length > 0
      ? topProducts.leastSelling.map((p) => `• ${p.name} (${p.quantity} uds)`).join(', ')
      : 'Todos los productos tienen buena rotación.';

    return `### 🏆 Ranking de Platos Más Vendidos (Últimos 30 días)

${topList || 'Aún no hay suficientes ventas registradas para generar el ranking.'}

---
📉 **Platos con menor rotación reciente:**
${leastList}

💡 **Recomendación ChefAI:** Impulsa los platos estrella como sugerencia del día y considera promociones o combos para los productos con menor salida.`;
  }

  private renderStockAlerts(stockAlerts: AiDataContext['stockAlerts']): string {
    const lowList = stockAlerts.lowStockItems
      .map((i) => `⚠️ **${i.name}**: Quedan **${i.stock} unidades** *(Mínimo requerido: ${i.minStock})*`)
      .join('\n');

    const outList = stockAlerts.outOfStockItems
      .map((i) => `❌ **${i.name}**: **0 unidades** (Agotado)`)
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

  private renderForecast(forecast: DailyForecast[]): string {
    const forecastList = forecast.slice(0, 5)
      .map((f) => {
        const dishesStr = f.topExpectedDishes.map((d) => `${d.name} (~${d.estimatedQuantity} uds)`).join(', ');
        return `📅 **${f.dayName} (${f.date}):**
  - **Venta Proyectada:** \`S/ ${f.projectedRevenue.toFixed(2)}\` (~${f.projectedOrders} pedidos)
  - **Platos más demandados:** ${dishesStr || 'Platos del menú habitual'}`;
      })
      .join('\n\n');

    const totalWeekend = forecast
      .filter((f) => f.dayName === 'Viernes' || f.dayName === 'Sábado' || f.dayName === 'Domingo')
      .reduce((sum, f) => sum + f.projectedRevenue, 0);

    return `### 🔮 Proyección Predictiva de Ventas (Próximos Días)

Esta estimación se calcula analizando el comportamiento de consumo y ventas de las últimas 4 semanas en tu restaurante:

${forecastList}

---
🌟 **Proyección del Fin de Semana (Vie - Dom):** \`S/ ${totalWeekend.toFixed(2)}\`

💡 **Consejo Operativo:** Asegura abastecimiento suficiente de los platos con mayor demanda proyectada y programa el personal de cocina y salón adecuado para las horas pico.`;
  }

  private renderTablesSummary(tablesSummary: AiDataContext['tablesSummary']): string {
    const zonesStr = tablesSummary.zones
      .map((z) => `• **${z.zoneName}**: ${z.occupied} ocupadas / ${z.free} libres (Total: ${z.totalTables})`)
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

  private renderHelpMenu(): string {
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
