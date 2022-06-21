// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ConduitLib.sol";

contract Conduit {
    error InvalidERC721TransferAmount();
    error InvalidItemType();
    
    function execute(ConduitTransfer[] memory transfers)
        internal
    {
       
        // Retrieve the total number of transfers and place on the stack.
        uint256 totalStandardTransfers = transfers.length;

        // Iterate over each transfer.
        for (uint256 i = 0; i < totalStandardTransfers; ) {
            // Retrieve the transfer in question.
            ConduitTransfer memory standardTransfer = transfers[i];

            // Perform the transfer.
            _transfer(standardTransfer);

            // Skip overflow check as for loop is indexed starting at zero.
            unchecked {
                ++i;
            }
        }
    }
    function _transfer(ConduitTransfer memory item) private {
        // If the item type indicates Ether or a native token...
        if (item.itemType == ConduitItemType.ERC20) {
            // Transfer ERC20 token.
            IERC20(item.token).transferFrom(item.from, item.to, item.amount);
        } else if (item.itemType == ConduitItemType.ERC721) {
            // Ensure that exactly one 721 item is being transferred.
            if (item.amount != 1) {
                revert InvalidERC721TransferAmount();
            }

            IERC721(item.token).transferFrom(item.from, item.to, item.identifier);

        } else if (item.itemType == ConduitItemType.ERC1155) {
            IERC1155(item.token).safeTransferFrom(item.from, item.to, item.identifier, item.amount, "");
            // Transfer ERC1155 token.
        } else {
            // Throw with an error.
            revert InvalidItemType();
        }
    }
}
