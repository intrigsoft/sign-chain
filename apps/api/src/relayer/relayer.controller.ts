import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RelayerService } from './relayer.service';
import { RelayRequestDto } from './relay.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('relay')
export class RelayerController {
  constructor(private readonly relayerService: RelayerService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async relay(@Body() dto: RelayRequestDto, @Req() req: Request) {
    return this.relayerService.relay(dto, (req.user as { id: string }).id);
  }
}
