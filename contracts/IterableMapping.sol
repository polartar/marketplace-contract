// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

library IterableMapping{

    struct Listing {
        uint256 listingId;
        uint256 nftId;
        address seller;
        address nft;
        uint256 price;
        uint256 fee;
        address purchaser;
        bool is1155;
        uint256 listingTime;
        uint256 saleTime;
        uint256 endingTime;
        uint256 royalty;
    }

    struct Map {
        bytes32[] keys;
        mapping(uint256 => bytes32) idToKey;
        mapping(bytes32 => Listing) values;
        mapping(bytes32 => uint) indexOf;
        mapping(bytes32 => bool) inserted;
    }

    function contains(Map storage map, bytes32 key) internal view returns (bool){
        return map.inserted[key];
    }

    function containsId(Map storage map, uint256 id) internal view returns (bool){
        return map.idToKey[id] != bytes32(0);
    }

    function get(Map storage map, bytes32 key) internal view returns (Listing storage) {
        return map.values[key];
    }

    function getById(Map storage map, uint256 id) internal view returns (Listing storage){
        return get(map, map.idToKey[id]);
    }

    function keyForId(Map storage map, uint256 id) internal view returns (bytes32){
        return map.idToKey[id];
    }

    function size(Map storage map) internal view returns (uint) {
        return map.keys.length;
    }

    function paged(Map storage map, uint256 _page, uint16 _pageSize) internal view returns (Listing[] memory){
        if(size(map) == 0){
            return new Listing[](0);
        }

        Listing[] memory result = new Listing[](_pageSize);
        uint16 returnCounter = 0;
        for(uint i = _pageSize * _page - _pageSize; i < _pageSize * _page; i++ ){
            if(i >= size(map)){
                break;
            }
            result[returnCounter] = get(map, map.keys[i]);
            returnCounter++;
        }
        return result;
    }

    function set(
        Map storage map,
        bytes32 key,
        Listing memory val
    ) internal {
        if (map.inserted[key]) {
            map.values[key] = val;
            map.idToKey[val.listingId] = key;
        } else {
            map.inserted[key] = true;
            map.values[key] = val;
            map.indexOf[key] = map.keys.length;
            map.keys.push(key);
            map.idToKey[val.listingId] = key;
        }
    }

    function remove(Map storage map, bytes32 key) internal {
        if (!map.inserted[key]) {
            return;
        }

        delete map.idToKey[map.values[key].listingId];
        delete map.inserted[key];
        delete map.values[key];

        uint index = map.indexOf[key];
        uint lastIndex = map.keys.length - 1;
        bytes32 lastKey = map.keys[lastIndex];

        map.indexOf[lastKey] = index;
        delete map.indexOf[key];

        map.keys[index] = lastKey;
        map.keys.pop();
    }
}