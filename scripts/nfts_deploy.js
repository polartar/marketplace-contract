async function main() {
    const deployer = await ethers.getSigner();
    console.log(`deployer address: ${deployer.address}`);
    // const contractFactory = await ethers.getContractFactory("EbisusBayMembership");
    // const memberships = await contractFactory.deploy();
    // console.log(`memberships deployed to: ${memberships.address}`);
    // await memberships.updatePrice(0,0,1);
    // await memberships.updatePrice(0,0,2);
    // await memberships.updatePrice(0,0,3);

    const basicFactory = await ethers.getContractFactory("BasicNFT")
    const nft = await basicFactory.deploy();
    console.log(`basic nft deployed to: ${nft.address}`);
}

main();