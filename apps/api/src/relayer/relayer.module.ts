import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RelayerController } from './relayer.controller';
import { RelayerService } from './relayer.service';

@Module({
  imports: [BlockchainModule],
  controllers: [RelayerController],
  providers: [RelayerService],
})
export class RelayerModule {}
