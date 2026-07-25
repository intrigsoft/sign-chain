import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

// Deployer/relayer key is injected via env at deploy time (never committed).
const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.27',
    settings: {
      evmVersion: 'cancun',
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    polygonAmoy: {
      url: process.env.RPC_URL || 'https://rpc-amoy.polygon.technology',
      chainId: 80002,
      accounts,
    },
    polygon: {
      url: process.env.RPC_URL || 'https://polygon-rpc.com',
      chainId: 137,
      accounts,
    },
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
