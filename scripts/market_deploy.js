
async function main() {
    const deployer = await ethers.getSigner();
    console.log(`deployer address: ${deployer.address}`);
    const contractFactory = await ethers.getContractFactory("Marketplace");
    const  memberships = hre.config.networks[hre.network.name].membership;

    const admin = process.env.LEDGER_PUBLIC;
    console.log(`admin address: ${admin}`);
    console.log(`memberships address: ${memberships}`)

    const market = await upgrades.deployProxy(contractFactory, [memberships], {kind: 'uups'});
    console.log(`market deployed to ${market.address}`);


    const adminRole = await market.DEFAULT_ADMIN_ROLE();
    const upgradeRole = await market.UPGRADER_ROLE();
    const staffRole = await market.STAFF_ROLE();
    console.log(`adminRole: ${adminRole}`);
    console.log(`upgradeRole: ${upgradeRole}`);
    console.log(`staffRole: ${staffRole}`);

    console.log("granting admin");
    await market.grantRole(adminRole, admin);
    
    console.log("granting upgrade");
    await market.grantRole(upgradeRole, deployer);

    console.log("granting staff")
    await market.grantRole(staffRole, admin);
    await market.grantRole(staffRole, deployer);
    console.log('permissions set');
}

main();