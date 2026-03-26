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

    address public immutable trustedRelayer;

    error UnauthorizedRelayer(address caller);

    modifier onlyRelayer() {
        if (msg.sender != trustedRelayer) {
            revert UnauthorizedRelayer(msg.sender);
        }
        _;
    }

    constructor(
        address trustedForwarder,
        address _trustedRelayer
    ) ERC2771Context(trustedForwarder) {
        trustedRelayer = _trustedRelayer;
    }

    function anchorDocument(
        bytes32 compositeHash,
        bytes32 previousTxHash
    ) external onlyRelayer {
        emit DocumentAnchored(
            compositeHash,
            _msgSender(),
            previousTxHash,
            block.timestamp
        );
    }
}
