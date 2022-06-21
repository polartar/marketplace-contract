const hre = require("hardhat");

async function main() {
  const { market, staker } = hre.config.networks[hre.network.name];
  const { upgrades } = hre;
  // We get the contract to deploy
  const NFTAuction = await ethers.getContractFactory("NFTAuction");
  const nftAuction = await upgrades.deployProxy(NFTAuction, [market, staker], {
      kind : "uups"
    });
  // We get the contract to deploy

  await nftAuction.deployed();
  console.log("NFTAuction deployed to:", nftAuction.address);

  // grant server role to auction
  const marketFactory = await ethers.getContractFactory("Marketplace");
  const marketContract = await marketFactory.attach(market);
  const serverRole = await marketContract.SERVER_ROLE();
  await marketContract.grantRole(serverRole, nftAuction.address);

  console.log("Granted server role");

  // verify script
  //  await hre.run("verify:verify", {
  //   address: "",
  //   contract: "contracts/NFTAuction.sol:NFTAuction",
  //   constructorArguments: [ 
        // market,
        // staker
  //   ]
  // });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
