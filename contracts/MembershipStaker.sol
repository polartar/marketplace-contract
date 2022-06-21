// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "./IMembershipStaker.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

import "./RewardsPool.sol";
import "hardhat/console.sol";


contract MembershipStaker is Initializable, 
IMembershipStaker,
OwnableUpgradeable, 
ReentrancyGuardUpgradeable, 
ERC1155ReceiverUpgradeable,
UUPSUpgradeable {

     using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
     using CountersUpgradeable for CountersUpgradeable.Counter;

     uint64 private constant VIP_ID = 2;
     IERC1155 private membershipContract;
     bool internal isInitPeriod;

    uint256 internal stakeCount;
    EnumerableSetUpgradeable.AddressSet internal stakers;    
    mapping(address => uint) internal balances;
    
    CountersUpgradeable.Counter public rewardsId;
    uint256 public epochLength;
    RewardsPool[] public pools;
    RewardsPool public curPool;
    RewardsPool public completedPool;

     function initialize(address _memberships) initializer public {
         __Ownable_init();
         __ReentrancyGuard_init();
         __ERC1155Receiver_init();
         __UUPSUpgradeable_init();
         membershipContract = IERC1155(_memberships);
         isInitPeriod = true;
         epochLength = 14 days;
     }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyOwner
        override
    {}

    function stake(uint256 amount) override virtual external {
        require(amount > 0, "invalid amount");
        require(membershipContract.balanceOf(msg.sender, VIP_ID) >= amount, "invalid balance");
        balances[msg.sender] = balances[msg.sender] + amount;
        stakeCount += amount;
        stakers.add(msg.sender);
        membershipContract.safeTransferFrom(msg.sender, address(this), VIP_ID, amount, "");
        updatePool();
        emit MembershipStaked(msg.sender, balances[msg.sender]);
    }

    function unstake(uint256 amount) override virtual external nonReentrant {
        require(balances[msg.sender] >= amount, "invalid amount");
        membershipContract.safeTransferFrom(address(this), msg.sender, VIP_ID, amount, "");
        balances[msg.sender] = balances[msg.sender] - amount;
        stakeCount -= amount;
        if(balances[msg.sender] == 0){
            stakers.remove(msg.sender);
        }
        updatePool();
        emit MembershipUnstaked(msg.sender, balances[msg.sender]);
    }

    function amountStaked(address staker) override external view returns (uint256){
        return balances[staker];
    }

    function totalStaked() override external view returns (uint256){
        return stakeCount;
    }

    function onERC1155Received(
        address operator,
        address,
        uint256,
        uint256,
        bytes calldata
    ) public virtual override returns (bytes4) {
        require(operator == address(this), "invalid operator");
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        revert("batches not accepted");
    }

    function currentStaked() override public view returns (address[] memory, uint256[] memory){
         address[] memory _stakers = stakers.values();
         uint[] memory _amounts = new uint[](stakers.length());
         for (uint i = 0; i < _stakers.length; i++){
             _amounts[i] = balances[_stakers[i]];
         }
         return (_stakers, _amounts);
    }

    //Pool
    function updatePool() public virtual {
        if(isInitPeriod) return;
        if(address(curPool) == address(0) || curPool.isClosed()){
            (address[] memory accounts, uint256[] memory amounts) = currentStaked();
            if(accounts.length > 0){
                RewardsPool newPool = new RewardsPool(block.timestamp + epochLength, accounts, amounts);
                pools.push(newPool);
                rewardsId.increment();
                if(address(completedPool) != address(0)){
                    completedPool.forwardUnclaimed(newPool);
                }
                if(address(this).balance > 0){
                    newPool.addReward{value : address(this).balance}();
                }
                completedPool = curPool;
                curPool = newPool;
            }
        }
    }

    receive() external payable virtual{
        updatePool();
        if(address(curPool) != address(0) && address(this).balance > 0){
            curPool.addReward{value: msg.value}();
        }   
    }

    function currentPoolId() public view returns(uint256){
        return rewardsId.current();
    }

    function periodEnd() public virtual view returns (uint256){
        if(address(curPool) == address(0)) return 0;
        return curPool.endTime();
    }

    function poolBalance() public virtual view returns (uint256){
        if(address(curPool) != address(0)){ 
            return curPool.totalReceived();
        } else {
            return address(this).balance;
        }
    }

    function harvest(address payable _address) external virtual{
        if(address(completedPool) != address(0)){
            completedPool.release(_address);
        }
        updatePool();
    }

    // OWNER
    function setEpochLength(uint _length) external onlyOwner {
        epochLength = _length;
    }

    function endInitPeriod() external virtual onlyOwner {
        isInitPeriod = false;
        updatePool();
    }

    function getVIPID() internal pure returns(uint64){
        return VIP_ID;
    }

    function getMemberShipAddress() internal view returns(IERC1155){
        return membershipContract;
    }
}