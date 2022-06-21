
function main() {
    const code = "0x37327257594d6d57524e00000000000000000000000000000000000000000000";
    const decoded = ethers.utils.parseBytes32String(code);
    console.log(decoded);
}

main();


