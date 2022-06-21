// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IBundle {
    event BundleCreated(uint indexed id, address[] contracts, uint[] ids);
    event BundleDestroyed(uint indexed id) ;
    
    function wrap(address[] calldata _tokens, uint256[] calldata _ids) external;

    function contents(uint256 _id) external view returns (address[] memory, uint[] memory);

    function unwrap(uint _id) external;
}