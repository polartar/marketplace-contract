const hre = require("hardhat");

async function main() {
  const { membership } = hre.config.networks[hre.network.name];
  const { upgrades } = hre;
  // We get the contract to deploy
  const stakerFactory = await ethers.getContractFactory("MembershipStaker");
  const stakerContract = await upgrades.deployProxy(stakerFactory, [membership]);

  //testnet 

  await stakerContract.deployed();
  console.log("staker deployed to:", stakerContract.address); 
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
