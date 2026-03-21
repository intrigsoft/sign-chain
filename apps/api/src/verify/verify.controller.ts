import { Controller, Get, Param } from '@nestjs/common';
import { VerifyService } from './verify.service';

@Controller('verify')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Get(':txHash')
  async verify(@Param('txHash') txHash: string) {
    return this.verifyService.verify(txHash);
  }
}
