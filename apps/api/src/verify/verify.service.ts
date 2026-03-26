import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';

interface AnchorEntry {
  txHash: string;
  compositeHash: string;
  signer: string;
  timestamp: number;
  previousTxHash: string;
}

export interface VerifyResult extends AnchorEntry {
  chain: AnchorEntry[];
  encryptedPayload?: string;
}

// Simple in-memory cache with 60s TTL
const cache = new Map<string, { data: VerifyResult; expiry: number }>();
const CACHE_TTL = 60_000;

@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  private readonly eventFragment = new ethers.Interface([
    'event DocumentAnchored(bytes32 indexed compositeHash, address indexed signer, bytes32 previousTxHash, uint256 timestamp)',
  ]);

  constructor(
    private blockchain: BlockchainService,
    private prisma: PrismaService,
  ) {}

  async verify(txHash: string): Promise<VerifyResult> {
    // Check cache
    const cached = cache.get(txHash);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const entry = await this.getAnchorFromTx(txHash);
    const chain: AnchorEntry[] = [entry];

    // Walk backwards
    let current = entry;
    while (current.previousTxHash !== ethers.ZeroHash) {
      current = await this.getAnchorFromTx(current.previousTxHash);
      chain.push(current);
    }

    // Look up encrypted payload from DB
    const anchor = await this.prisma.anchor.findUnique({
      where: { txHash },
    });

    const result: VerifyResult = {
      ...entry,
      chain,
      encryptedPayload: anchor?.encryptedPayload,
    };

    cache.set(txHash, { data: result, expiry: Date.now() + CACHE_TTL });
    return result;
  }

  private async getAnchorFromTx(txHash: string): Promise<AnchorEntry> {
    const receipt = await this.blockchain.provider.getTransactionReceipt(
      txHash
    );
    if (!receipt) {
      throw new NotFoundException(`Transaction ${txHash} not found`);
    }

    const contractAddress =
      await this.blockchain.signChainContract.getAddress();

    for (const log of receipt.logs) {
      // Only accept events from the official SignChain contract
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) {
        continue;
      }

      try {
        const parsed = this.eventFragment.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === 'DocumentAnchored') {
          const block = await this.blockchain.provider.getBlock(
            receipt.blockNumber
          );
          return {
            txHash: receipt.hash,
            compositeHash: parsed.args[0],
            signer: parsed.args[1],
            previousTxHash: parsed.args[2],
            timestamp: Number(parsed.args[3]),
          };
        }
      } catch {
        // Not our event, skip
      }
    }

    throw new NotFoundException(
      `No DocumentAnchored event found in tx ${txHash}`
    );
  }
}
