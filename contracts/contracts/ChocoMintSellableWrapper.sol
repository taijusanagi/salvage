// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import "@openzeppelin/contracts/finance/PaymentSplitter.sol";

contract ChocoMintSellableWrapper is PaymentSplitter {
  constructor(
    address[] memory _payees,
    uint256[] memory _shares
  ) PaymentSplitter(_payees, _shares) {}

  function sell() public payable {}

}
