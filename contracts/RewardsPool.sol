// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "@openzeppelin/contracts/finance/PaymentSplitter.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract RewardsPool is PaymentSplitter, Ownable{

    using Address for address payable;
    enum State {ACTIVE, CLOSED}

    uint256 private endingTime;
    State public curState;
    uint256 public finalBalance;

    constructor(uint256 endAt, address[] memory stakers, uint256[] memory amounts) PaymentSplitter(stakers, amounts) {
        require(endAt > block.timestamp, "already expired");
        curState = State.ACTIVE;
        endingTime = endAt;
    }

    function updateState() public{
        if(block.timestamp >= endingTime && curState != State.CLOSED){
            finalBalance = address(this).balance + totalReleased();
            curState = State.CLOSED;
        }
    }

    function endTime() public view returns(uint256){
        return endingTime;
    }

    function isClosed() public returns(bool) {
        updateState();
        return curState == State.CLOSED;
    }

    function totalReceived() public view returns(uint256){
        return address(this).balance + totalReleased();
    }

    function addReward() public payable{
        require(curState == State.ACTIVE, "pool is closed");
        emit PaymentReceived(_msgSender(), msg.value);
        updateState();
    }

    receive() override external payable virtual{
        require(curState == State.ACTIVE, "pool is closed");
        emit PaymentReceived(_msgSender(), msg.value);
        updateState();
    }

    function forwardUnclaimed(RewardsPool nextPool) public onlyOwner{
        require(curState == State.CLOSED, "pool is open");
        address next = address(nextPool);
        payable(next).sendValue(address(this).balance);
    }

    fallback() external payable{ 
        require(curState == State.ACTIVE, "pool is closed");
        updateState();
    }
}