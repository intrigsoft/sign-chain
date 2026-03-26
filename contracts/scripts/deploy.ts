import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  // Deploy Forwarder
  const Forwarder = await ethers.getContractFactory('Forwarder');
  const forwarder = await Forwarder.deploy('SignChainForwarder');
  await forwarder.waitForDeployment();
  const forwarderAddress = await forwarder.getAddress();
  console.log('Forwarder deployed to:', forwarderAddress);

  // Deploy SignChain with deployer as trusted relayer (override via RELAYER_ADDRESS env var)
  const relayerAddress = process.env.RELAYER_ADDRESS || deployer.address;
  const SignChain = await ethers.getContractFactory('SignChain');
  const signChain = await SignChain.deploy(forwarderAddress, relayerAddress);
  await signChain.waitForDeployment();
  const signChainAddress = await signChain.getAddress();
  console.log('SignChain deployed to:', signChainAddress);
  console.log('Trusted relayer:', relayerAddress);

  // Write addresses to .env.local
  const envContent = [
    `SIGNCHAIN_CONTRACT_ADDRESS=${signChainAddress}`,
    `FORWARDER_CONTRACT_ADDRESS=${forwarderAddress}`,
    `DEPLOYER_ADDRESS=${deployer.address}`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(__dirname, '..', '.env.local'), envContent);
  console.log('Contract addresses written to .env.local');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
