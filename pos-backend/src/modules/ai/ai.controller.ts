import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatQueryDto } from './dto/chat-query.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatQueryDto, @Request() req: any) {
    const user = req.user;
    return this.aiService.handleChatQuery(body.message, body.history || [], user);
  }
}
