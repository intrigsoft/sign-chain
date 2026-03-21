// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract SignChain is ERC2771Context {
    event DocumentAnchored(
        bytes32 indexed compositeHash,
        address indexed signer,
        bytes32 previousTxHash,
        uint256 timestamp
    );

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    function anchorDocument(
        bytes32 compositeHash,
        bytes32 previousTxHash
    ) external {
        emit DocumentAnchored(
            compositeHash,
            _msgSender(),
            previousTxHash,
            block.timestamp
        );
    }
}
