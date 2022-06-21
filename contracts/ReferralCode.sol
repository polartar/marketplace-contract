// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract ReferralCode is Ownable {

    using EnumerableSet for EnumerableSet.Bytes32Set;
    EnumerableSet.Bytes32Set private codesInUse;
    mapping(address => bytes32) public codes;
    mapping(bytes32 => address) private _c2a;

    event Registered(address referrer, bytes32 code);

    constructor(){}

    function register(bytes32 _code) public {
        require(codes[msg.sender] == bytes32(0), "Already registered");
        require(!codesInUse.contains(_code), "Code in use");
        codesInUse.add(_code);
        codes[msg.sender] = _code;
        _c2a[_code] = msg.sender;
        emit Registered(msg.sender, _code);
    }

    function registerUser(address _referrer, bytes32 _code) public onlyOwner {
        require(!codesInUse.contains(_code), "Code in use");
        codesInUse.add(_code);
        codes[_referrer] = _code;
        _c2a[_code] = _referrer;
        emit Registered(_referrer, _code);
    }

    function addressLookup(bytes32 _code) internal view returns (address){
        require(_c2a[_code] != address(0), "invalid code");
        return _c2a[_code];
    }

}