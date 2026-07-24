import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  zeroHash,
  decodeEventLog,
  type Hash,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const SIGN_CHAIN_ABI = parseAbi([
  'function anchorDocument(bytes32 compositeHash, bytes32 previousTxHash)',
  'event DocumentAnchored(bytes32 indexed compositeHash, address indexed signer, bytes32 previousTxHash, uint256 timestamp)',
]);

export { zeroHash };

export interface AnchorEntry {
  txHash: string;
  compositeHash: string;
  signer: string;
  previousTxHash: string;
  timestamp: number;
}

export async function anchorDocument(
  rpcUrl: string,
  relayerKey: string,
  contractAddress: string,
  compositeHash: string,
  previousTxHash: string
): Promise<{ txHash: string; blockNumber: number }> {
  const transport = http(rpcUrl);
  const account = privateKeyToAccount(relayerKey as Hash);
  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });

  const txHash = await walletClient.writeContract({
    address: contractAddress as Address,
    abi: SIGN_CHAIN_ABI,
    functionName: 'anchorDocument',
    args: [compositeHash as Hash, previousTxHash as Hash],
    account,
    chain: null,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash: receipt.transactionHash,
    blockNumber: Number(receipt.blockNumber),
  };
}

export async function getRelayerBalance(
  rpcUrl: string,
  relayerKey: string
): Promise<bigint> {
  const account = privateKeyToAccount(relayerKey as Hash);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  return publicClient.getBalance({ address: account.address });
}

export async function getAnchorFromTx(
  rpcUrl: string,
  contractAddress: string,
  txHash: string
): Promise<AnchorEntry> {
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const receipt = await publicClient.getTransactionReceipt({
    hash: txHash as Hash,
  });
  if (!receipt) {
    throw new Error(`Transaction ${txHash} not found`);
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;

    try {
      const decoded = decodeEventLog({
        abi: SIGN_CHAIN_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === 'DocumentAnchored') {
        const args = decoded.args as unknown as {
          compositeHash: string;
          signer: string;
          previousTxHash: string;
          timestamp: bigint;
        };
        return {
          txHash: receipt.transactionHash,
          compositeHash: args.compositeHash,
          signer: args.signer,
          previousTxHash: args.previousTxHash,
          timestamp: Number(args.timestamp),
        };
      }
    } catch {
      // not our event
    }
  }

  throw new Error(`No DocumentAnchored event found in tx ${txHash}`);
}
