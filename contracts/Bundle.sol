// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "./IBundle.sol";
import "hardhat/console.sol";

contract Bundle is IBundle, IERC1155Receiver, ERC721Enumerable {
    using ERC165Checker for address;
    using Counters for Counters.Counter;

    Counters.Counter public tokenId;
    mapping(uint256 => address[]) bundleAddresses;
    mapping(uint256 => uint256[]) bundleIds;

    string private constant uri = "data:application/json;base64,eyJuYW1lIiA6ICJORlQgQnVuZGxlIiwgImRlc2NyaXB0aW9uIiA6ICJNYWRlIGJ5IGh0dHBzOi8vYXBwLmViaXN1c2JheS5jb20ifQ==";
    
    constructor(string memory name, string memory symbol) ERC721(name, symbol){
        tokenId.increment();
    }

    function wrap(address[] calldata _tokens, uint256[] calldata _ids) external override{
        uint256 _tokenId = tokenId.current();
        _mint(msg.sender, _tokenId);
        bundleAddresses[_tokenId] = _tokens;
        bundleIds[_tokenId] = _ids;

        _transferBundles(msg.sender, address(this), _tokenId);

        emit BundleCreated(_tokenId, _tokens, _ids);
    }

    function _transferBundles(address _from, address _to, uint256 _tokenId) private {
        uint256[] memory _ids = bundleIds[_tokenId];
        address[] memory _tokens = bundleAddresses[_tokenId];

        uint256 len = _tokens.length;
        require(len == _ids.length, "invalid length");
        for (uint256 i = 0; i < len; i ++) {
            if (isERC1155(_tokens[i])) {
                IERC1155(_tokens[i]).safeTransferFrom(_from, _to, _ids[i], 1, "");
            } else if (isERC721(_tokens[i])) {
                IERC721(_tokens[i]).transferFrom(_from, _to, _ids[i]);
            }
        } 
    }

    function contents(uint256 _id) external view override returns (address[] memory, uint[] memory) {
        return (bundleAddresses[_id], bundleIds[_id]);
    }

    function unwrap(uint _tokenId) external override {
        _burn(_tokenId);
        _transferBundles(address(this), msg.sender, _tokenId);
        
        emit BundleDestroyed(_tokenId);
    }

    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        require(_exists(_tokenId),"ERC721Metadata: URI query for nonexistent token");
        return uri;
    }

    function isERC721(address _contract) public view returns(bool){
        return _contract.supportsInterface(type(IERC721).interfaceId);
    }
   
    function isERC1155(address _contract) public view returns(bool){
        return _contract.supportsInterface(type(IERC1155).interfaceId);
    }  

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external virtual override returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external virtual override returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC721Enumerable) returns (bool){
        return interfaceId == type(IBundle).interfaceId;
    }

    function _beforeTokenTransfer(address _from, address _to, uint256 _tokenId) internal override {
        super._beforeTokenTransfer(_from, _to, _tokenId);
    }
}