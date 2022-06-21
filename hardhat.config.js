require("@nomiclabs/hardhat-ethers");
require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-abi-exporter');
require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
// const key = process.env.SIGNER
module.exports = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  // defaultNetwork: "cronos_testnet",
  networks : {
    hardhat :{

    },
    cronos : {
      url : "https://gateway.nebkas.ro/",
      chainId: 25,
      gasPrice: 5000000000000,
      accounts: process.env.SIGNER !== undefined ? [process.env.SIGNER] : [],
      gasPrice: 5000000000000,
      membership: '0x8d9232Ebc4f06B7b8005CCff0ca401675ceb25F5',
      market : '0x7a3CdB2364f92369a602CAE81167d0679087e6a3',
      staker : '0xeb074cc764F20d8fE4317ab63f45A85bcE2bEcB1',
      offers : '0x016b347aEB70cC45E3BbaF324feB3c7C464E18B0',
      nftauction: ''
    },
    cronos_testnet : {
      url : "https://rpc.ebisusbay.biz/",
      chainId : 338,
      gasPrice: 5000000000000,
      accounts:  process.env.SIGNER !== undefined ? [process.env.SIGNER] : [],
      membership: '0x3F1590A5984C89e6d5831bFB76788F3517Cdf034',
      market : '0xb3cB12e7F9e442ef799a2B7e92f65ab8710d7b27',
      staker : '0x70A9989dd73B026B34462BE158963587dD9ca16f',
      offers : '0x8Dd84fb5d7f8A504BA2398243D768C604f8Daf5E',
      nftauction: ''
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 20000
  },
  etherscan: {
    apiKey: process.env.CRONOS_API_KEY
   }
};
