import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { ChatMessageDto } from './dto/chat-query.dto';
import { AiAnalyticsService } from './services/ai-analytics.service';
import { AiForecastService } from './services/ai-forecast.service';
import { AiLlmService } from './services/ai-llm.service';
import { AiTemplateService } from './services/ai-template.service';
import { AiDataContext } from './ai.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly analyticsService: AiAnalyticsService,
    private readonly forecastService: AiForecastService,
    private readonly llmService: AiLlmService,
    private readonly templateService: AiTemplateService,
  ) {}

  /**
   * Resuelve el ID del restaurante autenticado con aislamiento multi-tenant
   */
  private async resolveTenantRestaurantId(reqUser?: any): Promise<string | null> {
    const clsRestId = this.cls.get('restaurantId');
    if (clsRestId) return clsRestId;
    if (reqUser?.restaurantId) return reqUser.restaurantId;

    const defaultRest = await this.prisma.restaurant.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    return defaultRest ? defaultRest.id : null;
  }

  /**
   * Manejador principal de consultas del Chatbot ChefAI
   */
  async handleChatQuery(
    message: string,
    history: ChatMessageDto[] = [],
    reqUser?: any,
  ): Promise<{ reply: string; data?: any }> {
    const restaurantId = await this.resolveTenantRestaurantId(reqUser);
    const userMsg = (message || '').trim();

    // 1. Recopilar datos contextuales de la base de datos
    const [salesToday, topProducts, stockAlerts, tablesSummary, forecast] = await Promise.all([
      this.analyticsService.getRealtimeSalesSummary(restaurantId),
      this.analyticsService.getTopProducts(restaurantId, 30),
      this.analyticsService.getStockAlerts(restaurantId),
      this.analyticsService.getTablesSummary(restaurantId),
      this.forecastService.getSalesForecast(restaurantId, 7),
    ]);

    const contextData: AiDataContext = {
      salesToday,
      topProducts,
      stockAlerts,
      tablesSummary,
      forecast,
    };

    // 2. Intentar responder mediante LLM (Gemini o OpenAI si hay API Key configurada)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      const geminiReply = await this.llmService.askGemini(geminiKey, userMsg, history, contextData);
      if (geminiReply) return { reply: geminiReply };
    }

    if (openaiKey) {
      const openaiReply = await this.llmService.askOpenAi(openaiKey, userMsg, history, contextData);
      if (openaiReply) return { reply: openaiReply };
    }

    // 3. Respuesta analítica y semántica mediante el motor interno
    const reply = this.templateService.generateResponse(userMsg, contextData);
    return { reply };
  }
}
