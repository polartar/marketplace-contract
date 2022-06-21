
async function main() {
    const deployer = await ethers.getSigner();
    console.log(`deployer address: ${deployer.address}`);
    const contractFactory = await ethers.getContractFactory("Marketplace");
    const market = hre.config.networks[hre.network.name].market;
    console.log(`upgrading :${market}`);

    const upgrade = await upgrades.upgradeProxy(market, contractFactory);
    console.log(`market upgraded to ${upgrade.address}`);

     // verify script
    //  const membership = hre.config.networks[hre.network.name].membership;
  //  await hre.run("verify:verify", {
  //   address: market,
  //   contract: "contracts/Marketplace.sol:Marketplace",
  //   constructorArguments: [ 
        // membership
  //   ]
  // });
}

main();