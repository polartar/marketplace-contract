const hre = require("hardhat");

async function main() {
    await hre.run("verify:verify", {
      address: "Target Address",
      contract: "contracts/BloodDrive.sol:BloodDrive",
      constructorArguments: [
      ]
    });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
