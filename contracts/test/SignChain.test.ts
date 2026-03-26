import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignChain, Forwarder } from '../typechain-types';

describe('SignChain', function () {
  let signChain: SignChain;
  let forwarder: Forwarder;

  beforeEach(async function () {
    const [relayer] = await ethers.getSigners();

    const ForwarderFactory = await ethers.getContractFactory('Forwarder');
    forwarder = await ForwarderFactory.deploy('SignChainForwarder');
    await forwarder.waitForDeployment();

    const SignChainFactory = await ethers.getContractFactory('SignChain');
    signChain = await SignChainFactory.deploy(
      await forwarder.getAddress(),
      relayer.address
    );
    await signChain.waitForDeployment();
  });

  it('should emit DocumentAnchored event on anchor', async function () {
    const [signer] = await ethers.getSigners();
    const compositeHash = ethers.keccak256(ethers.toUtf8Bytes('test-document'));
    const previousTxHash = ethers.ZeroHash;

    await expect(signChain.anchorDocument(compositeHash, previousTxHash))
      .to.emit(signChain, 'DocumentAnchored')
      .withArgs(compositeHash, signer.address, previousTxHash, (ts: bigint) => ts > 0n);
  });

  it('should allow chaining anchors with previousTxHash', async function () {
    const compositeHash1 = ethers.keccak256(ethers.toUtf8Bytes('doc-1'));
    const compositeHash2 = ethers.keccak256(ethers.toUtf8Bytes('doc-2'));

    const tx1 = await signChain.anchorDocument(compositeHash1, ethers.ZeroHash);
    const receipt1 = await tx1.wait();

    const tx2 = await signChain.anchorDocument(compositeHash2, receipt1!.hash);
    const receipt2 = await tx2.wait();

    // Verify the second event has the first tx hash as previousTxHash
    const filter = signChain.filters.DocumentAnchored(compositeHash2);
    const events = await signChain.queryFilter(filter, receipt2!.blockNumber);
    expect(events).to.have.length(1);
    expect(events[0].args.previousTxHash).to.equal(receipt1!.hash);
  });

  it('should store the trusted relayer address', async function () {
    const [relayer] = await ethers.getSigners();
    expect(await signChain.trustedRelayer()).to.equal(relayer.address);
  });

  it('should reject calls from non-relayer addresses', async function () {
    const [, unauthorized] = await ethers.getSigners();
    const compositeHash = ethers.keccak256(ethers.toUtf8Bytes('fake-doc'));

    await expect(
      signChain.connect(unauthorized).anchorDocument(compositeHash, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(signChain, 'UnauthorizedRelayer');
  });
});
