import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelayRequestDto, RelayResponseDto } from './relay.dto';

@Injectable()
export class RelayerService {
  private readonly logger = new Logger(RelayerService.name);
  private readonly quota: number;

  constructor(
    private blockchain: BlockchainService,
    private prisma: PrismaService,
    private config: ConfigService
  ) {
    this.quota = this.config.get<number>('ANCHOR_QUOTA', 50);
  }

  async relay(
    dto: RelayRequestDto,
    userId: string
  ): Promise<RelayResponseDto> {
    // Check user quota
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.anchorCount >= this.quota) {
      throw new BadRequestException(
        `Anchor quota exceeded (${this.quota})`
      );
    }

    // Check relayer balance
    const balance = await this.blockchain.getRelayerBalance();
    if (balance === 0n) {
      throw new ServiceUnavailableException(
        'Relayer wallet has no funds'
      );
    }

    // Call contract directly (dev mode — no EIP-712 meta-tx verification)
    const tx = await this.blockchain.signChainContract.anchorDocument(
      dto.compositeHash,
      dto.previousTxHash
    );
    const receipt = await tx.wait();

    this.logger.log(
      `Anchored ${dto.compositeHash} in tx ${receipt.hash} (block ${receipt.blockNumber})`
    );

    // Store encrypted payload
    await this.prisma.anchor.create({
      data: {
        txHash: receipt.hash,
        compositeHash: dto.compositeHash,
        encryptedPayload: dto.encryptedPayload,
      },
    });

    // Increment anchor count
    await this.prisma.user.update({
      where: { id: userId },
      data: { anchorCount: { increment: 1 } },
    });

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }
}
