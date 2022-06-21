// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "./MembershipStaker.sol";

contract MembershipStakerV2 is MembershipStaker {
    event Harvest (address indexed, uint256 amount);

    struct RewardInfo {
        uint256 totalDistribution;
        uint256 totalReward;
    }

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    uint256 private pendingAmount;
    uint256 private totalDistribution;
    
    mapping(address => RewardInfo) private rewardInfos;
    uint256 public rewardsPaid;

    function harvest(address payable _address) external override {
        payRewards(_address);
    }

    function distribute() private {
        if (pendingAmount > 0 && stakeCount > 0) {
            totalDistribution += pendingAmount / stakeCount;
            pendingAmount = 0;
        }
    }

    function getReward(address _address) external view returns(uint256) {
        if (stakeCount > 0 && totalDistribution > 0 && balances[_address] > 0) {
            uint256 reward = (totalDistribution + pendingAmount / stakeCount - rewardInfos[_address].totalDistribution) * balances[_address];
            return reward;
        } else {
            return 0;
        }
    }

    function getReleasedReward(address _address) external view returns(uint256) {
        return rewardInfos[_address].totalReward;
    }

    function payRewards(address _address) private nonReentrant {
        distribute();

        if(totalDistribution > 0 && balances[_address] > 0) {
            uint256 reward = (totalDistribution - rewardInfos[_address].totalDistribution) * balances[_address];
            rewardInfos[_address].totalDistribution = totalDistribution;
            if (reward > 0) {
                rewardInfos[_address].totalReward += reward;
                (bool success, ) = payable(_address).call{value: reward}("");
                require(success, "failed to pay reward");
                rewardsPaid += reward;
                emit Harvest(_address, reward);
            }
        } else {
            rewardInfos[_address].totalDistribution = totalDistribution;
        }
        
    }

    function stake(uint256 amount) override external {
        require(amount > 0, "invalid amount");
        require(getMemberShipAddress().balanceOf(msg.sender, getVIPID()) >= amount, "invalid balance");
        payRewards(msg.sender);

        balances[msg.sender] = balances[msg.sender] + amount;
        stakeCount += amount;
        stakers.add(msg.sender);
        getMemberShipAddress().safeTransferFrom(msg.sender, address(this), getVIPID(), amount, "");

        emit MembershipStaked(msg.sender, balances[msg.sender]);
    }

    function unstake(uint256 amount) override external {
        require(balances[msg.sender] >= amount, "invalid amount");
        payRewards(msg.sender);

        getMemberShipAddress().safeTransferFrom(address(this), msg.sender, getVIPID(), amount, "");
        balances[msg.sender] = balances[msg.sender] - amount;
        stakeCount -= amount;
        if(balances[msg.sender] == 0){
            stakers.remove(msg.sender);
        }

        emit MembershipUnstaked(msg.sender, balances[msg.sender]);
    }

    receive() external payable virtual override{
        if(isInitPeriod) return;
        pendingAmount += msg.value;
    }

    function endInitPeriod() external override onlyOwner {
        require(isInitPeriod, "already begun");
        isInitPeriod = false;
        pendingAmount = address(this).balance;
        distribute();
    }

    function poolBalance() public view override returns (uint256){
       return pendingAmount;
    }

    function periodEnd() public override view returns (uint256){
        return block.timestamp;
    }

    function name() public pure returns (string memory){
        return "v2";
    }
    function updatePool() public virtual override {
    }
}
