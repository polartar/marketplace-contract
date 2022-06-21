// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1155ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "./conduit/ConduitLib.sol";
import "./SafePct.sol";

struct Royalty {
    address ipHolder;
    uint16 percent;
}

interface IMarket {
    function addToEscrow(address _address) external payable;
    function cancelActive(address _nft, uint256 _nftId, address _seller) external;
    function calculateRoyalty(address _contract, uint256 _id, uint256 _price) external view returns (uint256 royaltyAmount) ;
    function payRoyalty(address _contract, uint256 _id, uint256 _price) external payable;
    function transferToken(ConduitItemType _type, address _tokenAddress, address _from, address _to, uint256 _identifier, uint256 _amount) external;
    function fee(address user) external view returns (uint16 userFee);
}

struct Auction {
    address nft;
    address payable seller;
    address highestBidder;
    bool ended;
    bool isValue;
    uint nftId;
    uint startingBid;
    uint highestBid;
    uint endAt;
    uint hashId;
    uint quantity;
    uint minimumBid;
    uint buyNowPrice;
}
struct BidInfo{
  uint value;
  uint created;
  address bidder;
  bool hasWithdrawn;
}

contract NFTAuction is OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable, IERC1155ReceiverUpgradeable {
    event Bid(bytes32 indexed auctionHash, uint256 indexed auctionIndex, uint256 indexed bidIndex, address sender, uint amount);
    event CreateAuction(bytes32 indexed auctionHash, uint256 auctionIndex, address indexed tokenAddress, uint256 tokenId, uint256 quantity, uint256 startingBid, uint256 buyNowPrice, address indexed seller, uint256 hashId);
    event Withdraw(bytes32 indexed auctionHash, uint256 indexed auctionIndex, uint256 indexed bidIndex, address bidder, uint amount);
    event Accept(bytes32 indexed auctionHash, uint256 indexed auctionIndex, address winner, uint amount);
    event Cancel(bytes32 indexed auctionHash, uint256 indexed auctionIndex, address seller);
    event TimeIncreased(bytes32 indexed auctionHash,  uint256 indexed auctionIndex, address sender, uint increasedMinutes);
    event BuyNow(bytes32 indexed auctionHash, uint256 indexed auctionIndex, uint256 buyNowPrice, address buyer);

    using ERC165Checker for address;
    using SafePct for uint256;
    uint16 constant private SCALE = 10000;
    //AuctionId to Auction Data
    mapping(bytes32 => Auction[]) public auctions;
    mapping(bytes32 => mapping(uint256 => mapping(address => BidInfo[]))) bids;
    bytes32[] public auctionHashes;
    address public marketAddress;
    address public stakeAddress;

    bytes4 public constant IID_IERC1155 = type(IERC1155).interfaceId;
    bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;

    modifier onlyAuctionOwner(bytes32 _auctionHash, uint256 _auctionIndex) {
        require(auctions[_auctionHash][_auctionIndex].seller == msg.sender, "not seller");
        _;
    }

    modifier onlyAuctionAvailable(bytes32 _auctionHash, uint256 _auctionIndex) {
        require(auctions[_auctionHash].length !=0 
                && auctions[_auctionHash][_auctionIndex].isValue,
            "auction not available");
        _;
    }

    modifier onlyAuctionHashExist(bytes32 _auctionHash, uint256 _auctionIndex) {
        require(auctions[_auctionHash].length !=0, "not exist auction");
        _;
    }

    function initialize(address _marketAddress, address _stakeAddress) public initializer{
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Ownable_init();

        marketAddress = _marketAddress;
        stakeAddress = _stakeAddress;
    }

    function generateHash(address _sender, address _collection, uint256 _nftId, uint256 _quantity) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_sender, _collection, _nftId, _quantity));
    }

    function is721(address _nft) public view returns(bool){
        return _nft.supportsInterface(IID_IERC721);
    }
   
    function is1155(address _nft) public view returns(bool){
        return _nft.supportsInterface(IID_IERC1155);
    }

    function _transferNFT(address _nft, address _from, address _to, uint256 _nftId, uint256 _quantity) private {
        if (is721(_nft)) {
            IERC721(_nft).transferFrom(_from, _to, _nftId);
        } else {
            IERC1155(_nft).safeTransferFrom(_from, _to, _nftId, _quantity, "");
        }
    }

    function count() public view returns(uint){
        return auctionHashes.length;
    }

    function hashes() public view returns(bytes32[] memory){
        return auctionHashes;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyOwner
        override
    {}
    
    function _createAuction(bytes32 _auctionHash, address _nft, uint _nftId, uint256 _quantity, uint256 _startingBid, uint256 _buyNowPrice, address _seller, uint256 runTime) internal {
        auctionHashes.push(_auctionHash);
       
        Auction memory auction;
        auction.nft = _nft;
        auction.nftId = _nftId;
        auction.seller = payable(_seller);
        auction.startingBid = _startingBid;
        auction.isValue = true;
        auction.hashId = count() - 1;
        auction.endAt = block.timestamp + runTime;
        auction.quantity = _quantity;
        auction.buyNowPrice = _buyNowPrice;
        
        auctions[_auctionHash].push(auction);

        uint length = auctions[_auctionHash].length;
        auctions[_auctionHash][length-1].minimumBid = minimumBid(_auctionHash, length - 1);

        emit CreateAuction(_auctionHash, length - 1, _nft, _nftId, _quantity, _startingBid, _buyNowPrice, _seller, auction.hashId);
    }

    // create auction
    function createAuction(address _nft, uint _nftId, uint256 _quantity, uint _startingBid, uint _buyNowPrice, uint _runTime) external {
        require(_runTime <= 2 weeks, "invalid runtime");
        require(_startingBid > 0, "invalid startingBid");
        require(_buyNowPrice >= 0, "invalid buyNowPrice");
        require(_quantity > 0, "invalid quantity");

        bytes32 auctionHash = generateHash(msg.sender, _nft, _nftId, _quantity);
        if (is721(_nft)) {
            require(IERC721(_nft).ownerOf(_nftId) == msg.sender, "not owner of token");
        } else if (is1155(_nft)) { 
            require(IERC1155(_nft).balanceOf(msg.sender, _nftId) >= _quantity, "insufficient balance");
        } else {
            revert("not supported nft");
        }
        
        if (is721(_nft)) {
            IMarket(marketAddress).transferToken(ConduitItemType.ERC721, _nft, msg.sender, address(this), _nftId, 1);
        } else {
            IMarket(marketAddress).transferToken(ConduitItemType.ERC1155 ,_nft, msg.sender, address(this), _nftId, _quantity);
        }
        
        _createAuction(auctionHash, _nft, _nftId, _quantity, _startingBid, _buyNowPrice, msg.sender, _runTime);

        IMarket(marketAddress).cancelActive(_nft, _nftId, msg.sender);
    }

    // get the seller of the auction
    function getSeller(bytes32 _auctionHash, uint256 _auctionIndex) public onlyOwner onlyAuctionHashExist(_auctionHash, _auctionIndex) view returns(address) {
        return auctions[_auctionHash][_auctionIndex].seller;
    }

    function getAuction(bytes32 _auctionHash, uint256 _auctionIndex) public onlyAuctionHashExist(_auctionHash, _auctionIndex) view returns(Auction memory) {
        return auctions[_auctionHash][_auctionIndex];
    }

    function getBidIndex(bytes32 _auctionHash, uint256 _auctionIndex, address _address) private view returns (uint256) {
        uint256 len = bids[_auctionHash][_auctionIndex][_address].length;
        
        for(uint256 i = 0; i < len;) {
            if (bids[_auctionHash][_auctionIndex][_address][i].bidder == _address && !bids[_auctionHash][_auctionIndex][_address][i].hasWithdrawn) {
                return i;
            }
            unchecked {
                ++i;
            }
        }
        
        return type(uint256).max;
    }

    function getAuctionsByHash(bytes32 hash) public view returns (Auction[] memory) {
        return auctions[hash];
    }

    function _payRoyalty(address _contract, uint256 _nftId, uint256 _auctionPrice) private {
        uint256 royaltyAmount = IMarket(marketAddress).calculateRoyalty(_contract, _nftId, _auctionPrice);
        if (royaltyAmount > 0) {
            IMarket(marketAddress).payRoyalty{value: royaltyAmount}(_contract, _nftId, _auctionPrice);
        }
        
        uint256 fee = IMarket(marketAddress).fee(msg.sender);
        uint256 amountFee = _auctionPrice.mulDiv(fee, SCALE);

        uint256 stakerFee;
        bool sent;
        if (amountFee > 0) {
            stakerFee = amountFee.mulDiv(1, 2);
            (sent, ) = payable(stakeAddress).call{value: stakerFee}("");
            require(sent, "transfer staker fee failed");
        }
        (sent, ) = (address(marketAddress)).call{value: amountFee - stakerFee}("");
        require(sent, "transfer fee failed");

        (sent, ) = (msg.sender).call{value: _auctionPrice - amountFee - royaltyAmount}("");
        require(sent, "transfer reward failed");
    }

    function getBuyNowPrice(bytes32 _auctionHash, uint256 _auctionIndex) public view returns(uint256) {
        Auction memory auction = auctions[_auctionHash][_auctionIndex];
        return auction.buyNowPrice;
    }

    // buy the NFT from the auction immediately
    function buyNow(bytes32 _auctionHash, uint256 _auctionIndex) external payable onlyAuctionAvailable(_auctionHash, _auctionIndex) {
        Auction memory auction = auctions[_auctionHash][_auctionIndex];
        require(auction.buyNowPrice != 0, "unavailable buy now");
        require(auction.buyNowPrice == msg.value, "invalid price");
        require(auction.seller != msg.sender, "not available for token seller");
        require(!auction.ended, "auction ended");
        require(block.timestamp < auction.endAt, "ended");

        auctions[_auctionHash][_auctionIndex].ended = true;
        _transferNFT(auction.nft, address(this), msg.sender, auction.nftId, auction.quantity);

        // pay royalty
        _payRoyalty(auction.nft, auction.nftId, auction.buyNowPrice);

        emit BuyNow(_auctionHash, _auctionIndex, auction.buyNowPrice, msg.sender);
    }

    function bid(bytes32 _auctionHash, uint256 _auctionIndex) external payable onlyAuctionAvailable(_auctionHash, _auctionIndex) {
        Auction memory auction = auctions[_auctionHash][_auctionIndex];
        require(auction.seller != msg.sender, "not available for token seller");
        require(!auction.ended, "auction ended");
        require(block.timestamp < auction.endAt, "ended");

        uint bidIndex = getBidIndex(_auctionHash, _auctionIndex,  msg.sender);
        uint newBidAmount = msg.value;
        if (type(uint256).max != bidIndex) {
            newBidAmount = bids[_auctionHash][_auctionIndex][msg.sender][bidIndex].value + msg.value;
            
            require(newBidAmount >= minimumBid(_auctionHash, _auctionIndex), "not miniumbid");
            bids[_auctionHash][_auctionIndex][msg.sender][bidIndex].value = newBidAmount;
            bids[_auctionHash][_auctionIndex][msg.sender][bidIndex].created = block.timestamp;
         } else {
            require(msg.value >= minimumBid(_auctionHash, _auctionIndex), "not miniumbid");

            BidInfo memory newBid;
            newBid.value = msg.value;
            newBid.bidder = msg.sender;
            newBid.created = block.timestamp;

            bidIndex = bids[_auctionHash][_auctionIndex][msg.sender].length;
            bids[_auctionHash][_auctionIndex][msg.sender].push(newBid);
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = newBidAmount;

        if (block.timestamp > auction.endAt - 10 minutes) {
            auction.endAt += 10 minutes;
            emit TimeIncreased(_auctionHash, _auctionIndex, msg.sender, 10);    
        }
        auctions[_auctionHash][_auctionIndex] = auction;
        auctions[_auctionHash][_auctionIndex].minimumBid = minimumBid(_auctionHash, _auctionIndex);
        emit Bid(_auctionHash, _auctionIndex, bidIndex, msg.sender, newBidAmount);
    }

    function minimumBid(bytes32 _auctionHash, uint256 _auctionIndex) public view onlyAuctionHashExist(_auctionHash, _auctionIndex) returns(uint) {
        uint highestBid = auctions[_auctionHash][_auctionIndex].highestBid;
        
        // if this is the first bid, it will return the starting bid
        if (highestBid == 0) {
            return auctions[_auctionHash][_auctionIndex].startingBid;
        }

        uint increaseBid;

        if (highestBid <= 100 ether) {
            increaseBid = 10 ether;
        } else if (highestBid <= 1000 ether) {
            increaseBid = 50 ether;
        } else if (highestBid <= 5000 ether) {
            increaseBid = 100 ether;
        } else if (highestBid <= 10000 ether) {
            increaseBid = 250 ether;
        } else {
            increaseBid = 500 ether;
        }

        return highestBid + increaseBid;
    }

    function withdraw(bytes32 _auctionHash, uint256 _auctionIndex) external onlyAuctionHashExist(_auctionHash, _auctionIndex) nonReentrant {
        Auction memory auction = auctions[_auctionHash][_auctionIndex];
        if (auction.isValue) {
            require(auction.highestBidder != msg.sender, "not available for highest bidder");
        }
        
        uint bidIndex = getBidIndex(_auctionHash, _auctionIndex, msg.sender);
        require(type(uint256).max != bidIndex, "no bidder exist");

        uint balance = bids[_auctionHash][_auctionIndex][msg.sender][bidIndex].value;   

        bids[_auctionHash][_auctionIndex][msg.sender][bidIndex].hasWithdrawn = true;
        payable(msg.sender).transfer(balance);

        emit Withdraw(_auctionHash, _auctionIndex, bidIndex, msg.sender, balance);
    }
    
    // return all bids that are not high bids and not already withdrawn
    function returnBidsToWallets(bytes32 _auctionHash, uint256 _auctionIndex, address[] calldata _users) external onlyOwner () {
        uint256 len = _users.length;
        address highestBidder = auctions[_auctionHash][_auctionIndex].highestBidder;
        for (uint i = 0; i < len;) {
            if ( _users[i] != highestBidder ) {
                uint256 bidLen = bids[_auctionHash][_auctionIndex][_users[i]].length;
                if (bidLen > 0) {
                    BidInfo memory _bid = bids[_auctionHash][_auctionIndex][_users[i]][bidLen - 1];

                    if ( !_bid.hasWithdrawn) {
                        bids[_auctionHash][_auctionIndex][_users[i]][bidLen - 1].hasWithdrawn = true;
                        (bool sent, ) = _bid.bidder.call{value: _bid.value}("");
                        require(sent, "transfer failed");
                    }
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    function accept(bytes32 _auctionHash, uint256 _auctionIndex) external 
        onlyAuctionAvailable(_auctionHash, _auctionIndex) 
        onlyAuctionOwner(_auctionHash, _auctionIndex)
        nonReentrant
    {
        Auction memory auction = auctions[_auctionHash][_auctionIndex];
        require(!auction.ended, "ended");

        if (auction.highestBidder != address(0)) {
            auctions[_auctionHash][_auctionIndex].ended = true;
            _transferNFT(auction.nft, address(this), auction.highestBidder, auction.nftId, auction.quantity);

            _payRoyalty(auction.nft, auction.nftId, auction.highestBid);
            
            emit Accept(_auctionHash, _auctionIndex, auction.highestBidder, auction.highestBid);
        } else {
            revert("highest bidder not set");
        }
    }

    function cancel(bytes32 _auctionHash, uint256 _auctionIndex) external 
        onlyAuctionAvailable(_auctionHash, _auctionIndex) 
        onlyAuctionOwner(_auctionHash, _auctionIndex)
        nonReentrant
    {
        Auction memory auction = auctions[_auctionHash][_auctionIndex];
        require(!auction.ended, "ended");
        require(block.timestamp + 1 days <= auction.endAt, "time passed");

        auction.isValue = false;
        auction.ended = true;
        auctions[_auctionHash][_auctionIndex] = auction;

        _transferNFT(auction.nft, address(this), auction.seller, auction.nftId, auction.quantity);

        emit Cancel(_auctionHash, _auctionIndex, msg.sender);
    }
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external virtual override returns (bytes4) {
        return IERC1155ReceiverUpgradeable.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external virtual override returns (bytes4) {
        return IERC1155ReceiverUpgradeable.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external virtual override view returns (bool){
        return interfaceId == type(IERC165).interfaceId;
    }    
}