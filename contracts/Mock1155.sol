// SPDX-License-Identifier: Unlicense 
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract Mock1155 is ERC1155 {
    constructor() ERC1155(""){}

    function mint(uint256 id, uint amount) public{
        _mint(msg.sender, id, amount, "");
    }
}