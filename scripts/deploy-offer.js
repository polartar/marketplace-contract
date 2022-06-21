const hre = require("hardhat");

async function main() {
  const { market, staker } = hre.config.networks[hre.network.name];
  const { upgrades } = hre;
  // We get the contract to deploy
  const OfferContract = await ethers.getContractFactory("OfferContract");
  const offerContract = await upgrades.deployProxy(OfferContract, [market, staker], {kind: 'uups'});

  //testnet 

  await offerContract.deployed();
  console.log("offerContract deployed to:", offerContract.address); 

   // grant server role to auction
   const marketFactory = await ethers.getContractFactory("Marketplace");
   const marketContract = marketFactory.attach(market);
   const serverRole = await marketContract.SERVER_ROLE();
   await marketContract.grantRole(serverRole, offerContract.address); 
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
