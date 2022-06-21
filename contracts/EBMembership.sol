// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "./ReferralCode.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/PullPayment.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "hardhat/console.sol";

contract EbisusBayMembership is ERC1155, Ownable, Pausable, ReferralCode, PullPayment, ReentrancyGuard, ERC1155Burnable {

    using Address for address payable;

    uint64 public constant FOUNDER = 1;
    uint64 public constant VIP = 2;
    uint64 public constant VVIP = 3;

    uint16 public constant MAX_FOUNDER = 10000;
    uint16 public constant MAX_VIP = 1000;
    uint16 public constant MAX_VVIP = 10;

    uint256 public founderCount = 0;
    uint256 public vipCount = 0;
    uint256 public vvipCount = 0;

    uint256 public founderPrice = 250 ether;
    uint256 public founderReferralDiscount = 12.5 ether;

    uint256 public vipPrice = 1000 ether;
    uint256 public vipReferralDiscount = 50 ether;

    uint256 public vvipPrice = 10000 ether;
    uint256 public vvipReferralDiscount = 500 ether;

    mapping(uint64 => string) private uris;

    event NewMember(uint id, uint currentTotal);

    constructor() ERC1155("") {

        uint[] memory ids = new uint[](3);
        ids[0] = FOUNDER;
        ids[1] = VIP;
        ids[2] = VVIP;
        uint[] memory amounts = new uint[](3);
        amounts[0] = 200;
        amounts[1] = 20;
        amounts[2] = 1;
        _mintBatch(msg.sender, ids, amounts, "");
        founderCount = 200;
        vipCount = 20;
        vvipCount = 1;
        setURI("ipfs://QmWeBsK3ZVQ5Lsh2hTgQyrLfgnos4Z5ce6Ycu57a6VuWGT", 1);
        setURI("ipfs://QmexVkHqRbjzL84fANR2WFR4iFVsHKNu1pbpnN1XuaUXAk", 2);
        setURI("ipfs://QmRUY1r5vXY5Sh1wtPKCNmSXwt5peWJzRA2718tZkSZrxo", 3);
    }

     modifier validId(uint256 _id){
        require(_id == FOUNDER || _id ==VIP || _id == VVIP,  "invalid id");
        _;
    }

    function setURI(string memory _newuri, uint16 _id) public onlyOwner validId(_id){
        uris[_id] = _newuri;
        emit URI(_newuri, _id);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function mint(uint256 _id, uint256 _amount, bytes memory _data)
        public
        payable
        validId(_id)
    {
        require(_amount > 0, "invalid amount");
        bytes32 _code;
        assembly {
            _code := mload(add(_data, 32))
        }

        uint price;
        uint discount;
        address referer;
        uint newCount;
        if(_id == FOUNDER){
            price = founderPrice;
            discount = founderReferralDiscount;
            founderCount = SafeMath.add(founderCount, _amount);
            require(founderCount <= MAX_FOUNDER, "too many tokens");
            newCount = founderCount;
        } else if(_id == VIP){
            price = vipPrice;
            discount = vipReferralDiscount;
            vipCount = SafeMath.add(vipCount, _amount);
            require(vipCount <= MAX_VIP, "too many tokens");
            newCount = vipCount;
        } else if(_id == VVIP){
            price = vvipPrice;
            discount = vvipReferralDiscount;
            vvipCount = SafeMath.add(vvipCount, _amount);
            require(vvipCount <= MAX_VVIP, "too many tokens");
            newCount = vvipCount;
        }

        if(_code == bytes32(0)){
            discount = 0;
        } else {
            referer = addressLookup(_code);
        }

        uint finalPrice = SafeMath.mul((price - discount), _amount);
        if (msg.sender != owner()) {
            require(msg.value >= finalPrice, "short on funds");
        }
        
        _mint(msg.sender, _id, _amount, "");
        _asyncTransfer(referer, SafeMath.mul(discount, _amount));
        emit NewMember(_id, newCount);
    }

    function uri(uint256 _id) public view override validId(_id) returns (string memory) {
        return uris[uint64(_id)];
    }

    function _beforeTokenTransfer(address operator, address from, address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        internal
        whenNotPaused
        override
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function updatePrice(uint256 _price, uint256 _discount, uint64 _id) public onlyOwner validId(_id) {
        if(_id == FOUNDER){
            founderPrice = _price;
            founderReferralDiscount = _discount;
        } else if(_id == VIP){
            vipPrice = _price;
            vipReferralDiscount = _discount;
        } else if(_id == VVIP) {
            vvipPrice = _price;
            vvipReferralDiscount = _discount;
        }
    }

    function withdrawPayments(address payable payee) public virtual override nonReentrant{
        super.withdrawPayments(payee);
    }

    function withdraw() public payable onlyOwner {
        payable(msg.sender).sendValue(address(this).balance);
    }
}