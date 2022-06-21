// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

enum ConduitItemType {
    NATIVE, // unused
    ERC20,
    ERC721,
    ERC1155
}

struct ConduitTransfer {
    ConduitItemType itemType;
    address token;
    address from;
    address to;
    uint256 identifier;
    uint256 amount;
}