import { Injectable, Logger } from '@nestjs/common';
import { ChatMessageDto } from '../dto/chat-query.dto';
import { AiDataContext } from '../ai.types';

@Injectable()
export class AiLlmService {
  private readonly logger = new Logger(AiLlmService.name);

  /**
   * Intenta consultar a Google Gemini API
   */
  async askGemini(apiKey: string, userMessage: string, history: ChatMessageDto[], contextData: AiDataContext): Promise<string | null> {
    const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

    const systemPrompt = `Eres "ChefAI", el asistente inteligente y asesor de negocios oficial del restaurante.
Tienes acceso en tiempo real a los siguientes datos reales de la base de datos PostgreSQL:

DATOS EN TIEMPO REAL:
- Ventas de hoy: S/ ${contextData.salesToday.totalRevenue.toFixed(2)} (${contextData.salesToday.closedOrdersCount} pedidos cerrados, ${contextData.salesToday.openOrdersCount} pedidos abiertos). Ticket promedio: S/ ${contextData.salesToday.averageTicket.toFixed(2)}.
- Métodos de pago hoy: ${JSON.stringify(contextData.salesToday.paymentBreakdown)}
- Platos más vendidos (últimos 30 días): ${contextData.topProducts.topSelling.map((p) => `${p.name} (${p.quantity} uds - S/ ${p.revenue.toFixed(2)})`).join(', ')}
- Platos menos vendidos / menor salida: ${contextData.topProducts.leastSelling.map((p) => `${p.name} (${p.quantity} uds)`).join(', ')}
- Alertas de Stock: ${contextData.stockAlerts.outOfStockCount} productos agotados, ${contextData.stockAlerts.lowStockCount} productos con stock bajo. Items críticos: ${contextData.stockAlerts.lowStockItems.map((i) => `${i.name} (quedan ${i.stock})`).join(', ')}
- Estado de mesas: ${contextData.tablesSummary.occupiedTables} ocupadas de ${contextData.tablesSummary.totalTables} (${contextData.tablesSummary.occupancyRate} de ocupación).
- Proyección para los próximos días: ${contextData.forecast.slice(0, 3).map((f) => `${f.dayName} (${f.date}): S/ ${f.projectedRevenue.toFixed(2)} est.`).join(' | ')}

REGLAS DE RESPUESTA:
1. Responde siempre en español de forma profesional, cálida, motivadora y con formato Markdown elegante (usa negritas, listas con viñetas y emojis pertinentes).
2. Proporciona datos exactos y da recomendaciones accionables para mejorar las ventas, cuidar el stock o gestionar el salón.
3. Si te piden una predicción, explica de forma sencilla que se basa en la tendencia de las últimas semanas.
4. Mantén tus respuestas claras y directas sin rodeos excesivos.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido. Soy ChefAI y asesoraré al restaurante con la información de su base de datos.' }] },
      ...history.slice(-4).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        });

        if (response.ok) {
          const resData = await response.json();
          const reply = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            return reply;
          }
        } else {
          const errBody = await response.text().catch(() => '');
          this.logger.warn(`Gemini (${model}) status ${response.status}: ${errBody.slice(0, 150)}`);
        }
      } catch (err) {
        this.logger.warn(`Error de red al conectar con Gemini (${model}): ${err}`);
      }
    }

    return null;
  }

  /**
   * Intenta consultar a OpenAI API
   */
  async askOpenAi(apiKey: string, userMessage: string, history: ChatMessageDto[], contextData: AiDataContext): Promise<string | null> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = `Eres "ChefAI", el asistente inteligente del restaurante.
Datos actuales:
- Ventas de hoy: S/ ${contextData.salesToday.totalRevenue.toFixed(2)} (Cerrados: ${contextData.salesToday.closedOrdersCount}, Ticket Promedio: S/ ${contextData.salesToday.averageTicket.toFixed(2)}).
- Platos Top: ${contextData.topProducts.topSelling.map((p) => `${p.name} (${p.quantity} uds)`).join(', ')}.
- Stock Crítico: ${contextData.stockAlerts.lowStockItems.map((i) => `${i.name} (quedan ${i.stock})`).join(', ')}.
- Predicción Próximos días: ${contextData.forecast.slice(0, 3).map((f) => `${f.dayName}: S/ ${f.projectedRevenue.toFixed(2)}`).join(', ')}.
Responde con formato Markdown amigable y sugerencias de valor.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`OpenAI API respondió con status ${response.status}`);
        return null;
      }
      const resData = await response.json();
      return resData?.choices?.[0]?.message?.content || null;
    } catch (err) {
      this.logger.warn(`Error al conectar con OpenAI: ${err}`);
      return null;
    }
  }
}
