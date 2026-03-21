import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

@Module({
  imports: [BlockchainModule, PrismaModule],
  controllers: [VerifyController],
  providers: [VerifyService],
})
export class VerifyModule {}
