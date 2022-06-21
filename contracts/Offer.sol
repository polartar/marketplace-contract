// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "./SafePct.sol";
import "./conduit/ConduitLib.sol";

struct Royalty {
    address ipHolder;
    uint16 percent;
}
abstract contract Market {
    //Returns fee as a percent in 10k scale (ie 300 = 3%)
    function fee(address user) public virtual view returns (uint16 userFee);
    function addToEscrow(address _address) external virtual payable;
    function cancelActive(address _nft, uint256 _id, address _seller) virtual external;
    function transferToken(ConduitItemType _type, address _tokenAddress, address _from, address _to, uint256 _identifier, uint256 _amount) virtual public;
    function calculateRoyalty(address _contract, uint256 _id, uint256 _price) public virtual view returns (uint256 royaltyAmount) ;
    function payRoyalty(address _contract, uint256 _id, uint256 _price) public virtual payable;
}

enum Status {
    Created,
    Rejected,
    Cancelled,
    Accepted,
    Updated
}
struct Offer {
    address nft;
    address seller;
    address buyer;
    address coinAddress;
    Status status;
    uint256 id;
    uint256 amount;
    uint256 date;
}

contract OfferContract is ReentrancyGuardUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {

    event OfferMade(address indexed nft, uint256 id, uint256 offerIndex, address indexed buyer, uint256 amount, address coinAddress, uint256 time); 
    event OfferUpdated(address indexed nft, uint256 id, uint256 offerIndex, address indexed buyer, uint256 amount, address coinAddress, uint256 time); 
    event OfferCancelled(address indexed nft, uint256 id, uint256 offerIndex, address indexed buyer, uint256 time); 
    event OfferAccepted(address indexed nft, uint256 id, uint256 offerIndex, address indexed buyer, address indexed seller, uint256 amount, address coinAddress, uint256 time); 
    event OfferRejected(address indexed nft, uint256 id, uint256 offerIndex, address indexed buyer, address indexed seller, uint256 amount, address coinAddress, uint256 time); 

    event CollectionOfferMade(address indexed nft, uint256 offerIndex, address indexed buyer, uint256 amount, uint256 time); 
    event CollectionOfferUpdated(address indexed nft, uint256 offerIndex, address indexed buyer, uint256 amount, uint256 time); 
    event CollectionOfferCancelled(address indexed nft, uint256 offerIndex, address indexed buyer, uint256 time); 
    event CollectionOfferAccepted(address indexed nft, uint256 tokenId, uint256 offerIndex, address indexed buyer, address indexed seller, uint256 amount, uint256 time); 

    using ERC165Checker for address;
    using SafePct for uint256;
    using SafeMathLite for uint256;
    
    uint128 constant internal SCALE = 10000;
    bytes4 public constant IID_IERC1155 = type(IERC1155).interfaceId;
    bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;
    
    mapping(bytes32 => Offer[]) offers;
    bytes32[] offerHashes;

    Market marketContract;
    address payable stakerAddress;

    bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');
    bytes32 public constant STAFF_ROLE = keccak256('STAFF_ROLE');

    // userInfo.  wallet => hash => offerIndex
    mapping(address => mapping(bytes32 => uint256)) userOfferInfo;

    mapping(address => Offer[]) collectionOffers;
    mapping(address => mapping(address => uint256)) userCollectionOfferInfo;

    modifier onlyNFT(address _nft) {
        require(is1155(_nft) || is721(_nft), "unsupported type");
        _;
    }

    function initialize(address payable _market, address payable _stakerAddress) public initializer {
         marketContract = Market(_market);
         stakerAddress = _stakerAddress;
         __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override { }

    function generateHash(address _nft, uint256 _nftId) public pure returns(bytes32) {
        return keccak256(abi.encodePacked(_nft, _nftId));
    }

    function getOffers(address _nft, uint256 _id) public view returns(Offer[] memory) {
        bytes32 hash = generateHash(_nft, _id);

        return offers[hash];
    }

    function getOffer(bytes32 _hash, uint256 _offerIndex) public view returns(bool, Offer memory offer) {
        bool isExist;

        if (offers[_hash].length <= 0) {
            return (false, offer);
        }
        if (offers[_hash][_offerIndex].nft != address(0) ) {
            isExist = true;
        }
        return (isExist, offers[_hash][_offerIndex]);
    }

    function is721(address _nft) public view returns(bool){
        return _nft.supportsInterface(IID_IERC721);
    }
   
    function is1155(address _nft) public view returns(bool){
        return _nft.supportsInterface(IID_IERC1155);
    }

    // function makeOfferWithToken(address _nft, uint256 _id, uint256 _amount, address _coinAddress) external onlyNFT(_nft) {
    //     uint256 balance = IERC20(_coinAddress).balanceOf(msg.sender);
    //     require(_amount <= balance, "not enough funds");
    //     (bool success) = IERC20(_coinAddress).transferFrom(msg.sender, address(this), _amount);
    //     require(success == true, "transfer token failed");
        
    //     bytes32 hash = generateHash(_nft, _id);
    //     Offer memory _offer;
    //     _offer.nft = _nft;
    //     _offer.id = _id;
    //     _offer.buyer = msg.sender;
    //     _offer.amount = _amount;
    //     _offer.coinAddress = _coinAddress;
    //     _offer.date = block.timestamp;
    //     _offer.status = Status.Created;

    //     offers[hash].push(_offer);

    //     emit  OfferMade(_nft, _id, msg.sender, _amount, _coinAddress, block.timestamp); 
    // }

    function makeOffer(address _nft, uint256 _id) external payable onlyNFT(_nft) {
        require(0 < msg.value, "invalid amount");

        bytes32 hash = generateHash(_nft, _id);

        // check if the offer already exists
        uint256 offerIndex = userOfferInfo[msg.sender][hash];

        if (offerIndex == 0 
            || offers[hash][offerIndex - 1].status == Status.Rejected 
            || offers[hash][offerIndex - 1].status == Status.Cancelled
            || offers[hash][offerIndex - 1].status == Status.Accepted) {
            Offer memory _offer;
            _offer.nft = _nft;
            _offer.id = _id;
            _offer.buyer = msg.sender;
            _offer.amount = msg.value;
            _offer.date = block.timestamp;
            _offer.status = Status.Created;

            offers[hash].push(_offer);
            userOfferInfo[msg.sender][hash] = offers[hash].length;
            offerIndex = offers[hash].length;
            emit  OfferMade(_nft, _id, offerIndex - 1, msg.sender, msg.value, address(0), _offer.date);
        } else {
           revert("already exist");
        }
    }

    function updateOffer(bytes32 hash, uint256 offerIndex) external payable {
        (bool isExist, Offer memory _offer) = getOffer(hash, offerIndex);
        require(isExist, "offer not exist");
        require(_offer.buyer == msg.sender, "not offer owner");
        require(0 < msg.value, "invalid amount");
        
        // offerIndex starts from 1
        if (offers[hash][offerIndex].status == Status.Rejected 
            || offers[hash][offerIndex].status == Status.Cancelled
            || offers[hash][offerIndex].status == Status.Accepted) {
                revert("update is unavailable");
        }

        //should increase the offer amount
        _offer.amount += msg.value;
        _offer.date = block.timestamp;
        _offer.status = Status.Updated;

        offers[hash][offerIndex] = _offer;
        emit  OfferUpdated(_offer.nft, _offer.id, offerIndex, msg.sender, _offer.amount, address(0), _offer.date);
     }

    function cancelOffer(bytes32 _hash, uint256 _offerIndex) external nonReentrant{
        (bool isExist, Offer memory _offer) = getOffer(_hash, _offerIndex);
        require(isExist, "offer not exist");
        require(_offer.status == Status.Created || _offer.status == Status.Updated, "offer is not opened");

        if (!hasRole(STAFF_ROLE, msg.sender)) {
            require(_offer.buyer == msg.sender, "incorrect buyer");
        }

        offers[_hash][_offerIndex].status = Status.Cancelled;
        offers[_hash][_offerIndex].date = block.timestamp;

        if (_offer.coinAddress != address(0)) {
            revert("not support crc20");
            // IERC20(_offer.coinAddress).transfer(_offer.buyer, _offer.amount);
        } else {
           (bool sent, ) = payable(_offer.buyer).call{value:_offer.amount}("");
           require(sent, "transfer failed");
        }

        emit  OfferCancelled(_offer.nft, _offer.id, _offerIndex,  _offer.buyer, block.timestamp); 
    }

    function acceptOffer(bytes32 _hash, uint256 _offerIndex) external nonReentrant {
        (bool isExist, Offer memory _offer) = getOffer(_hash, _offerIndex);
        require(isExist, "offer not exist");

        require(_offer.status == Status.Created || _offer.status == Status.Updated, "offer is not opened");
        if (is721(_offer.nft)) {
            require(IERC721(_offer.nft).ownerOf(_offer.id) == msg.sender, "not nft owner");
        } else {
            require(IERC1155(_offer.nft).balanceOf(msg.sender, _offer.id) > 0 , "not enough balance for token");
        }
        
         offers[_hash][_offerIndex].status = Status.Accepted;
         offers[_hash][_offerIndex].seller = msg.sender;
         offers[_hash][_offerIndex].date = block.timestamp;

        uint256 fee = marketContract.fee(msg.sender);
      
        uint256 royaltyAmount = marketContract.calculateRoyalty(_offer.nft, _offer.id, _offer.amount);

        uint256 amountFee = _offer.amount.mulDiv(fee, SCALE); 
        uint256 amount = _offer.amount - amountFee - royaltyAmount;

        if (_offer.coinAddress != address(0)) {
            revert("not support crc20");
        } else {
            if (royaltyAmount >0 ) {
                marketContract.payRoyalty{value: royaltyAmount}(_offer.nft, _offer.id, _offer.amount);
            }
            
            uint256 stakerFee;
            bool sent;
            if (amountFee >0 ) {
                stakerFee = amountFee.mulDiv(1, 2); 
                (sent, ) = (stakerAddress).call{value: stakerFee}("");
                require(sent, "transfer staker fee failed");
            }

           (sent, ) = (address(marketContract)).call{value: amountFee - stakerFee}("");
            require(sent, "transfer fee failed");
 
            (sent, ) = payable(msg.sender).call{value: amount}("");
            require(sent, "transfer failed to the seller");

            marketContract.cancelActive(_offer.nft, _offer.id, msg.sender);
        }

        // reject other offers for this nft
        // rejectAllOffers(_hash);
        _transferToken(_offer.nft, msg.sender, _offer.buyer, _offer.id);

        emit OfferAccepted(_offer.nft, _offer.id, _offerIndex, _offer.buyer, msg.sender, _offer.amount, _offer.coinAddress, block.timestamp); 
    }
        
    function rejectOffer(bytes32 _hash, uint256 _offerIndex) public nonReentrant {
        (bool isExist, Offer memory _offer) = getOffer(_hash, _offerIndex);
        require(isExist, "offer not exist");

        if (is721(_offer.nft)) {
            require(IERC721(_offer.nft).ownerOf(_offer.id) == msg.sender, "not nft owner");
        } else {
            revert("shouldn't reject 1155");
        }

        require(_offer.status == Status.Created || _offer.status == Status.Updated, "offer is not opened");
        
        offerRejection(offers[_hash][_offerIndex]);
        emit OfferRejected(_offer.nft, _offer.id, _offerIndex, _offer.buyer, msg.sender, _offer.amount, _offer.coinAddress, block.timestamp); 
    }

    function offerRejection(Offer storage _offer) private {
        _offer.status = Status.Rejected;
        _offer.seller = msg.sender;
        _offer.date = block.timestamp;
        
        bool sent;
        if (_offer.coinAddress != address(0)) {
            revert("not support crc20");
            // sent = IERC20(_offer.coinAddress).transfer(_offer.buyer, _offer.amount);
        } else {
           (sent, ) = payable(_offer.buyer).call{value:_offer.amount}("");
        }

        require(sent, "transfer failed");
    }

    function getCollectionOffers(address _collection) public view returns(Offer[] memory) {
        return collectionOffers[_collection];
    }

    function getCollectionOffer(address _collection, uint256 _offerIndex) public view returns(bool, Offer memory offer) {
        bool isExist;

        if (collectionOffers[_collection].length <= 0) {
            return (false, offer);
        }
        if (collectionOffers[_collection][_offerIndex].nft != address(0) ) {
            isExist = true;
        }
        return (isExist, collectionOffers[_collection][_offerIndex]);
    }

    function makeCollectionOffer(address _nft) external payable onlyNFT(_nft) {
        require(0 < msg.value, "invalid amount");

        // check if the offer already exists
        uint256 offerIndex = userCollectionOfferInfo[msg.sender][_nft];

        if (offerIndex == 0 
            || collectionOffers[_nft][offerIndex - 1].status == Status.Cancelled
            || collectionOffers[_nft][offerIndex - 1].status == Status.Accepted) {
            Offer memory _offer;
            _offer.nft = _nft;
            _offer.buyer = msg.sender;
            _offer.amount = msg.value;
            _offer.date = block.timestamp;
            _offer.status = Status.Created;

            collectionOffers[_nft].push(_offer);
            userCollectionOfferInfo[msg.sender][_nft] = collectionOffers[_nft].length;
            offerIndex = collectionOffers[_nft].length;
            emit  CollectionOfferMade(_nft, offerIndex - 1, msg.sender, msg.value, _offer.date);
        } else {
            Offer memory _offer = collectionOffers[_nft][offerIndex - 1];
            //should increase the offer amount
            _offer.amount += msg.value;
            _offer.date = block.timestamp;
            _offer.status = Status.Updated;

            collectionOffers[_nft][offerIndex - 1] = _offer;
            emit  CollectionOfferUpdated(_nft, offerIndex - 1, msg.sender, _offer.amount, _offer.date);
        }
    }

    function cancelCollectionOffer(address _collection, uint256 _offerIndex) external nonReentrant{
        (bool isExist, Offer memory _offer) = getCollectionOffer(_collection, _offerIndex);
        require(isExist, "offer not exist");
        require(_offer.status == Status.Created || _offer.status == Status.Updated, "offer is not opened");

        if (!hasRole(STAFF_ROLE, msg.sender)) {
            require(_offer.buyer == msg.sender, "incorrect buyer");
        }

        collectionOffers[_collection][_offerIndex].status = Status.Cancelled;
        collectionOffers[_collection][_offerIndex].date = block.timestamp;

        (bool sent, ) = payable(_offer.buyer).call{value:_offer.amount}("");
         require(sent, "transfer failed");

        emit  CollectionOfferCancelled(_offer.nft, _offerIndex,  _offer.buyer, block.timestamp); 
    }

    function acceptCollectionOffer(address _collection, uint256 _offerIndex, uint256 _tokenId) external nonReentrant {
        (bool isExist, Offer memory _offer) = getCollectionOffer(_collection, _offerIndex);
        require(isExist, "offer not exist");

        require(_offer.status == Status.Created || _offer.status == Status.Updated, "offer is not opened");
        if (is721(_collection)) {
            require(IERC721(_collection).ownerOf(_tokenId) == msg.sender, "not token owner");
        } else {
            require(IERC1155(_collection).balanceOf(msg.sender, _tokenId) > 0 , "not enough balance for token");
        }
        
         collectionOffers[_collection][_offerIndex].status = Status.Accepted;
         collectionOffers[_collection][_offerIndex].seller = msg.sender;
         collectionOffers[_collection][_offerIndex].date = block.timestamp;
         collectionOffers[_collection][_offerIndex].id = _tokenId;

        uint256 fee = marketContract.fee(msg.sender);

        uint256 royaltyAmount = marketContract.calculateRoyalty(_collection, _tokenId, _offer.amount);
        // Royalty memory royalty = marketContract.getRoyalty(_collection);

        uint256 amountFee = _offer.amount.mulDiv(fee, SCALE); 
        // uint256 royaltyAmount = _offer.amount.mulDiv(royalty.percent, SCALE); 
        uint256 amount = _offer.amount - amountFee - royaltyAmount;

      
        // marketContract.addToEscrow{value: royaltyAmount}(royalty.ipHolder);
        marketContract.payRoyalty{value: royaltyAmount}(_offer.nft, _offer.id, _offer.amount);
        uint256 stakerFee = amountFee.mulDiv(1, 2);
        (bool sent, ) = (address(marketContract)).call{value: amountFee - stakerFee}("");
        require(sent, "transfer fee failed");

        (sent, ) = (stakerAddress).call{value: stakerFee}("");
        require(sent, "transfer staker fee failed");

        (sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "transfer failed to the seller");

        marketContract.cancelActive(_collection, _tokenId, msg.sender);

        _transferToken(_collection, msg.sender, _offer.buyer, _tokenId);
        
        emit CollectionOfferAccepted(_collection, _tokenId, _offerIndex, _offer.buyer, msg.sender, _offer.amount, block.timestamp); 
    }

    function _transferToken(address _token, address _from, address _to, uint256 _tokenId) private {
         //transfer nft
        if (is721(_token)) {
            marketContract.transferToken(ConduitItemType.ERC721,_token, _from, _to, _tokenId, 1);
        } else {
            marketContract.transferToken(ConduitItemType.ERC1155,_token, _from, _to, _tokenId, 1);
        }
    }
}