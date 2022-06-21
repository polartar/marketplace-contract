// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./NFTAuction.sol";

contract NFTAuctionV2 is NFTAuction {

    function name() public pure returns (string memory){
        return "v2";
    }
}
