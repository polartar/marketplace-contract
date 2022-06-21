
async function main() {
    const deployer = await ethers.getSigner();
    console.log(`deployer address: ${deployer.address}`);
    const contractFactory = await ethers.getContractFactory("OfferContract");
    const offers = hre.config.networks[hre.network.name].offers;


    const upgrade = await upgrades.upgradeProxy(offers, contractFactory);
    console.log(`market upgraded to ${upgrade.address}`);

    // grant server role to auction
   const { market } = hre.config.networks[hre.network.name];
   const marketFactory = await ethers.getContractFactory("Marketplace");
   const marketContract = await marketFactory.attach(market);
   const serverRole = await marketContract.SERVER_ROLE();
   await marketContract.grantRole(serverRole, offers); 


   // verify script
    //  const { market, staker } = hre.config.networks[hre.network.name];
  //  await hre.run("verify:verify", {
  //   address: offers,
  //   contract: "contracts/OfferContract.sol:OfferContract",
  //   constructorArguments: [ 
        // market,
        // staker
  //   ]
  // });
}

main();