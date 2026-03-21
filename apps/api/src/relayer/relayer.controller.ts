import { Controller, Post, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { RelayerService } from './relayer.service';
import { RelayRequestDto } from './relay.dto';

@Controller('relay')
export class RelayerController {
  constructor(private readonly relayerService: RelayerService) {}

  @Post()
  async relay(@Body() dto: RelayRequestDto, @Req() req: Request) {
    return this.relayerService.relay(dto, req.user!.id);
  }
}
