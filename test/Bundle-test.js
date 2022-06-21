const { expect } = require("chai");
const { ethers } = require("hardhat");
const parseEther = ethers.utils.parseEther;

describe("Test Bundle Drop contract", function () {
  let bundleFactory;
  let mockERC1155Factory;
  let mockERC721Factory;
  let mockERC1155;
  let mockERC721;
  let bundle;
  let accounts;
  
  beforeEach(async function () {
    accounts = await ethers.getSigners();
    mockERC1155Factory = await ethers.getContractFactory("Mock1155");
    mockERC721Factory = await ethers.getContractFactory("BasicNFT");
    bundleFactory = await ethers.getContractFactory("Bundle");
  })

  beforeEach(async function () {
    mockERC1155 = await mockERC1155Factory.deploy();
    await mockERC1155.deployed();
    await mockERC1155.mint(1, 5);
    await mockERC1155.mint(2, 3);

    mockERC721 = await mockERC721Factory.deploy();
    await mockERC721.deployed();

    mockERC721.safeMint(accounts[0].address);
    mockERC721.safeMint(accounts[1].address);

    bundle = await bundleFactory.deploy("Bundle contract", "BC");
    await bundle.deployed();

    await mockERC1155.setApprovalForAll(bundle.address, true);
    await mockERC721.setApprovalForAll(bundle.address, true);
  })
  
  it("Should wrap bundle", async function () {
    await expect(bundle.wrap([mockERC1155.address, mockERC1155.address, mockERC721.address], [1, 1, 0, 1])).to.be.revertedWith("invalid length");
    await expect(bundle.wrap([mockERC1155.address, mockERC1155.address, mockERC721.address], [1, 1, 1])).to.be.reverted;
    await expect(bundle.wrap([mockERC1155.address, mockERC1155.address, mockERC721.address], [1, 1, 0])).to.emit(bundle, "BundleCreated");

    expect(await mockERC1155.balanceOf(bundle.address, 1)).to.be.equal(2);
    expect(await mockERC721.ownerOf(0)).to.be.equal(bundle.address);
  });

  it("Should return bundles", async function () {     
    await bundle.wrap([mockERC1155.address, mockERC1155.address, mockERC721.address], [1, 1, 0]);

    const bundles = await bundle.contents(1);
    expect(bundles[0][0]).to.be.equal(mockERC1155.address)
    expect(bundles[0][1]).to.be.equal(mockERC1155.address)
    expect(bundles[0][2]).to.be.equal(mockERC721.address)

    expect(bundles[1][0]).to.be.equal(1)
    expect(bundles[1][1]).to.be.equal(1)
    expect(bundles[1][2]).to.be.equal(0)
  });

  it("Should unwrap bundles", async function () {     
    await bundle.wrap([mockERC1155.address, mockERC1155.address, mockERC721.address], [1, 1, 0]);

    expect(await mockERC1155.balanceOf(accounts[0].address, 1)).to.be.equal(3);
    expect(await mockERC721.ownerOf(0)).to.be.equal(bundle.address);

    await expect(bundle.unwrap(1)).to.emit(bundle, "BundleDestroyed");
    expect(await mockERC1155.balanceOf(accounts[0].address, 1)).to.be.equal(5);
    expect(await mockERC721.ownerOf(0)).to.be.equal(accounts[0].address);

  });
  
  it("Should return token uri", async function () {    
    await bundle.wrap([mockERC1155.address, mockERC1155.address, mockERC721.address], [1, 1, 0]);

    expect(await bundle.tokenURI(1)).to.be.equal("data:application/json;base64,eyJuYW1lIiA6ICJORlQgQnVuZGxlIiwgImRlc2NyaXB0aW9uIiA6ICJNYWRlIGJ5IGh0dHBzOi8vYXBwLmViaXN1c2JheS5jb20ifQ==");
  });

  it("Should check supports interface", async function () {    
    // IBundle 0x3751cb04
    // IERC165 0x01ffc9a7
    // IERC721 0x80ac58cd
    expect(await bundle.supportsInterface("0x3751cb04")).to.be.equal(true);
    expect(await bundle.supportsInterface("0x01ffc9a7")).to.be.equal(false);
    expect(await bundle.supportsInterface("0x80ac58cd")).to.be.equal(false);
  });
}); 


