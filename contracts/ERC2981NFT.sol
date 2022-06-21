// SPDX-License-Identifier: Unlicense 
pragma solidity ^0.8.2;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract ERC2981NFT is ERC721Enumerable, Ownable, ERC2981 {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    constructor() ERC721("BasicNFT", "BNFT") {
        
    }

    function safeMint(address to) public  {
        _safeMint(to, _tokenIdCounter.current());
        _tokenIdCounter.increment();
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(tokenId < totalSupply(), "");
        return "ipfs://QmYbg4LjbfitYFMrzsKsrynyXBqybeARGv4mZtGm64W4kg/14.json";
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC2981, ERC721Enumerable) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId) || interfaceId == type(IERC721Enumerable).interfaceId;
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }
}