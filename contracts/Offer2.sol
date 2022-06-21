// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./Offer.sol";

contract Offer2Contract is OfferContract {
    function name() public pure returns (string memory){
        return "v2";
    }
}