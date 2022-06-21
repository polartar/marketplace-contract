// SPDX-License-Identifier: Unlicense 
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC1155ReceiverUpgradeable.sol";

interface IMembershipStaker is IERC1155ReceiverUpgradeable {

    /**
     * @dev Emitted when `staker` adds stakes one or more memberships for a new `totalStaked`
     */
    event MembershipStaked(address indexed staker, uint256 totalStaked);

    /**
     * @dev Emmited when `staker` unstaked for a new `totalStaked`
     */
     event MembershipUnstaked(address indexed staker, uint256 totalStaked);

     function stake(uint256 amount) external;

     function unstake(uint256 amount) external;

     function amountStaked(address staker) external view returns (uint256);

     function totalStaked() external view returns (uint256);

     function currentStaked() external view returns (address[] memory stakers, uint256[] memory amounts);

}