import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

// SignChain ABI — only the parts we need
const SIGN_CHAIN_ABI = [
  'function anchorDocument(bytes32 compositeHash, bytes32 previousTxHash)',
  'event DocumentAnchored(bytes32 indexed compositeHash, address indexed signer, bytes32 previousTxHash, uint256 timestamp)',
];

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  provider: ethers.JsonRpcProvider;
  relayerWallet: ethers.Wallet;
  signChainContract: ethers.Contract;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.config.get<string>('RPC_URL', 'http://127.0.0.1:8545');
    const relayerKey = this.config.get<string>('RELAYER_PRIVATE_KEY');
    const contractAddress = this.config.get<string>(
      'SIGNCHAIN_CONTRACT_ADDRESS'
    );

    if (!relayerKey) {
      this.logger.warn('RELAYER_PRIVATE_KEY not set — relay will fail');
    }
    if (!contractAddress) {
      this.logger.warn(
        'SIGNCHAIN_CONTRACT_ADDRESS not set — relay will fail'
      );
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.relayerWallet = new ethers.Wallet(
      relayerKey || ethers.ZeroHash,
      this.provider
    );
    this.signChainContract = new ethers.Contract(
      contractAddress || ethers.ZeroAddress,
      SIGN_CHAIN_ABI,
      this.relayerWallet
    );

    this.logger.log(`Blockchain service initialized (RPC: ${rpcUrl})`);
  }

  async getRelayerBalance(): Promise<bigint> {
    return this.provider.getBalance(this.relayerWallet.address);
  }
}
