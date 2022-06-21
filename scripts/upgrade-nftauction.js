
async function main() {
    const deployer = await ethers.getSigner();
    console.log(`deployer address: ${deployer.address}`);

    const contractFactory = await ethers.getContractFactory("NFTAuction");
    const nftAuction = hre.config.networks[hre.network.name].nftauction;


    const upgrade = await upgrades.upgradeProxy(nftAuction, contractFactory);
    console.log(`Auction upgraded to ${upgrade.address}`);


    // verify script
    // const { market, staker } = hre.config.networks[hre.network.name];
    // await hre.run("verify:verify", {
    //  address: nftAuction,
    //  contract: "contracts/NFTAuction.sol:NFTAuction",
    //  constructorArguments: [ 
    //      market,
    //      staker
    //  ]
    // });
}

main();