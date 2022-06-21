const hre = require("hardhat");

async function main() {
  const { membership, owner } = hre.config.args;
  // We get the contract to deploy
  const Bundle = await hre.ethers.getContractFactory("Bundle");

  const bundle = await Bundle.deploy("Bundle NFT", "Bundle");

  await bundle.deployed();
  console.log("Bundle deployed to:", bundle.address); 
  // --testnet 0x78D9401589D7CA83b013a48c78E7f52490B45beA

  //  transfer ownership
   const tx = await bundle.transferOwnership(owner);
   await tx.wait();
   const newOwner = await bundle.owner();
   console.log(`owner is now: ${newOwner}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
