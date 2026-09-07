import { IsNotEmpty, IsOptional, IsString, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant' | 'system';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'El contenido del mensaje no debe exceder 2000 caracteres' })
  content: string;
}

export class ChatQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'La consulta no debe exceder 1000 caracteres' })
  message: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
