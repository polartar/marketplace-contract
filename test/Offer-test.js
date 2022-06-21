const { expect } = require("chai");
const { ethers, upgrades  } = require("hardhat");
const parseEther = ethers.utils.parseEther;

describe("Test Offer contract", function () {
  let offerContractFactory;
  let mockMarketFactory;
  let mockERC1155Factory;
  let mockERC721Factory;
  let membershipFactory
  // let mockERC20Factory;
  let mockStakerFactory;

  let offerContract;
  let mockMarket;
  let accounts;
  let mockERC1155
  // let mockERC20;
  let mockERC721;
  let memberships
  let mockStaker;

  before(async() => {
    accounts = await ethers.getSigners();
    mockMarketFactory = await ethers.getContractFactory("Marketplace"); 
    mockERC1155Factory = await ethers.getContractFactory("Mock1155");
    mockERC721Factory = await ethers.getContractFactory("BasicNFT");
    membershipFactory = await ethers.getContractFactory("EbisusBayMembership");
    // mockERC20Factory = await ethers.getContractFactory("MockERC20");
    offerContractFactory = await ethers.getContractFactory("OfferContract");
    mockStakerFactory = await ethers.getContractFactory("MembershipStakerV2");
 })

  beforeEach(async function () {
    memberships = await membershipFactory.deploy();
    await memberships.deployed();

    mockMarket = await upgrades.deployProxy(mockMarketFactory, [memberships.address], {
      kind : "uups"
    });
    await mockMarket.deployed();
  
    mockStaker = await upgrades.deployProxy(mockStakerFactory, [memberships.address], {
      kind : "uups"
    });
    await mockStaker.deployed();


    mockERC1155 = await mockERC1155Factory.deploy();
    await mockERC1155.deployed();
    await mockERC1155.mint(1, 4);
    await mockERC1155.mint(2, 4);

    mockERC721 = await mockERC721Factory.deploy();
    await mockERC721.deployed();
    await mockERC721.safeMint(accounts[0].address);
    await mockERC721.safeMint(accounts[0].address);

    
    await mockERC1155.setApprovalForAll(mockMarket.address, true);
    await mockERC721.setApprovalForAll(mockMarket.address, true);
   
    await mockMarket.grantRole(await mockMarket.STAFF_ROLE(), accounts[0].address)
    await mockMarket.registerRoyalty(mockERC1155.address, accounts[3].address, 500);
    await mockMarket.registerRoyalty(mockERC721.address, accounts[3].address, 500);
    // creat mock ERC20 token contract for impersonating Loot contract
    // mockERC20 = await mockERC20Factory.deploy();
    // await mockERC20.deployed();

    offerContract = await upgrades.deployProxy(offerContractFactory, [mockMarket.address, mockStaker.address]);

    await offerContract.deployed();

    await mockERC1155.setApprovalForAll(offerContract.address, true);
    await mockERC721.setApprovalForAll(offerContract.address, true);

    await mockMarket.grantRole(await mockMarket.SERVER_ROLE(), offerContract.address);
  })

  it('should only let admin upgrade', async () => {
    await offerContract.grantRole(await offerContract.UPGRADER_ROLE(), accounts[1].address);

    let v2 = await ethers.getContractFactory("Offer2Contract", accounts[2]);
    await expect(upgrades.upgradeProxy(offerContract.address, v2)).to.be.reverted;
    
    v2 = await ethers.getContractFactory("Offer2Contract", accounts[1]);
    const upgrade = await upgrades.upgradeProxy(offerContract.address, v2);
    await expect(await upgrade.name()).to.eq("v2");
  })

  it("Should make offer", async function () {    
    await expect(offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })).to.emit(offerContract, "OfferMade");
    
    // await mockERC20.transfer(accounts[2].address, parseEther("100"));
    // await mockERC20.connect(accounts[2]).approve(offerContract.address, parseEther("100"));
    // await expect( offerContract.connect(accounts[2]).makeOfferWithToken(
    //   mockERC1155.address, 1, parseEther("30"), mockERC20.address)
    // ).to.emit(offerContract, "OfferMade");
    

    const offers = await offerContract.getOffers(mockERC1155.address, 1);
    
    expect(offers.length).to.be.equal(1)

    expect(offers[0].nft).to.be.equal(mockERC1155.address)
    expect(offers[0].buyer).to.be.equal(accounts[1].address)
    expect(offers[0].amount).to.be.equal(parseEther("20"))
    expect(offers[0].status).to.be.equal(0)

    // expect(offers[1].nft).to.be.equal(mockERC1155.address)
    // expect(offers[1].buyer).to.be.equal(accounts[2].address)
    // expect(offers[1].amount).to.be.equal(parseEther("30"))
    // expect(offers[1].status).to.be.equal(0)
    // expect(offers[1].coinAddress).to.be.equal(mockERC20.address)
  });

  it("Should cancel offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    // await mockERC20.transfer(accounts[2].address, parseEther("100"));
    // await mockERC20.connect(accounts[2]).approve(offerContract.address, parseEther("100"));
    // await offerContract.connect(accounts[2]).makeOfferWithToken(mockERC1155.address, 2, parseEther("30"), mockERC20.address)
    
    const hash1 = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]);
    // const hash2 = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 2]); 
    await expect( offerContract.connect(accounts[1]).cancelOffer(hash1, 0)).to.emit(offerContract, "OfferCancelled")
    // await expect( offerContract.connect(accounts[2]).cancelOffer(hash2, 0)).to.emit(offerContract, "OfferCancelled")

    const offer1 = await offerContract.getOffer(hash1, 0);
    expect(offer1[1].status).to.be.equal(2);

    // const offer2 = await offerContract.getOffer(hash2, 0);
    // expect(offer2[1].status).to.be.equal(2);

  });

  it("Should staff can cancel the offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    
    const hash1 = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]);
    await expect( offerContract.connect(accounts[2]).cancelOffer(hash1, 0)).to.be.revertedWith("incorrect buyer");

    await offerContract.grantRole(await offerContract.STAFF_ROLE(), accounts[2].address)
    await expect( offerContract.connect(accounts[2]).cancelOffer(hash1, 0)).to.emit(offerContract, "OfferCancelled")
    const offer1 = await offerContract.getOffer(hash1, 0);
    expect(offer1[1].status).to.be.equal(2);
  });

  it("Should refund Cro when cancelling offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 
    
    await expect(() => offerContract.connect(accounts[1]).cancelOffer(hash, 0)).to.changeEtherBalance(accounts[1], parseEther("20"));
  });

  // it("Should refund CRC20 token when cancelling offer", async function () {
  //   await mockERC20.transfer(accounts[1].address, parseEther("100"));
  //   await mockERC20.connect(accounts[1]).approve(offerContract.address, parseEther("100"));
  //   await offerContract.connect(accounts[1]).makeOfferWithToken(mockERC1155.address, 1, parseEther("30"), mockERC20.address)
  //   const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 
    
  //   await expect(() => offerContract.connect(accounts[1]).cancelOffer(hash, 0)).to.changeTokenBalance(mockERC20, accounts[1], parseEther("30"));
  // });

  it("Should reject offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC721.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]); 
    await expect( offerContract.rejectOffer(hash, 0)).to.emit(offerContract, "OfferRejected")

    const offer = await offerContract.getOffer(hash, 0);
    expect(offer[1].status).to.be.equal(1);

  });
  it("Should refund Cro when rejecting offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC721.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]); 

    await expect(() => offerContract.rejectOffer(hash, 0)).to.changeEtherBalance(accounts[1], parseEther("20"));
  });

  // it("Should refund CRC20 when rejecting offer", async function () {
  //   await mockERC20.transfer(accounts[1].address, parseEther("100"));
  //   await mockERC20.connect(accounts[1]).approve(offerContract.address, parseEther("100"));
  //   await offerContract.connect(accounts[1]).makeOfferWithToken(mockERC1155.address, 1, parseEther("30"), mockERC20.address)
  //   const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 

  //   await expect(() => offerContract.rejectOffer(hash, 0)).to.changeTokenBalance(mockERC20, accounts[1], parseEther("30"));
  // });

  it("Should accept offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 

    await expect( offerContract.acceptOffer(hash, 0)).to.emit(offerContract, "OfferAccepted")

    const offer = await offerContract.getOffer(hash, 0);
    expect(offer[1].status).to.be.equal(3);

  });

  it("Should transfer 0.3 Cro to market contract, 0.3Cro to staker contract and transfer 1155nft when accepting offer", async function () {
    await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 3, 1, ethers.utils.formatBytes32String(""));
    await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 2, 20, ethers.utils.formatBytes32String(""));

    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const initBalance = await mockERC1155.balanceOf(accounts[0].address, 1)
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 

    await expect( () => offerContract.acceptOffer(hash, 0)).to.changeEtherBalance(mockMarket, parseEther("0.3"));
    expect(await  ethers.provider.getBalance(mockStaker.address)).to.be.equal(parseEther("0.3"));

    const afterBalance = await mockERC1155.balanceOf(accounts[0].address, 1)
    const buyerBalancer = await mockERC1155.balanceOf(accounts[1].address, 1)

    expect(initBalance.toString()).to.be.equal("4");
    expect(afterBalance.toString()).to.be.equal("3");
    expect(buyerBalancer.toString()).to.be.equal("1");
  });


  it("Should transfer 1 Cro royalty when accepting offer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 

    await offerContract.acceptOffer(hash, 0);
    await expect( () => mockMarket.withdrawPayments(accounts[3].address)).to.changeEtherBalance(accounts[3], parseEther("1"));
  });

  it("Should transfer 18.4 Cro to seller when accepting offer", async function () {
    await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 3, 1, ethers.utils.formatBytes32String(""));
    await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 2, 20, ethers.utils.formatBytes32String(""));

    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 

    await expect( () => offerContract.acceptOffer(hash, 0)).to.changeEtherBalance(accounts[0], parseEther("18.4"));
  });

  // it("Should transfer 0.6 CRC20 to the market contract and transfer 721 nft when accepting offer", async function () {
  //   await mockERC20.transfer(accounts[1].address, parseEther("100"));
  //   await mockERC20.connect(accounts[1]).approve(offerContract.address, parseEther("100"));
  //   await offerContract.connect(accounts[1]).makeOfferWithToken(mockERC721.address, 1, parseEther("20"), mockERC20.address)
    
  //   const initBalance = await mockERC721.balanceOf(accounts[0].address)
  //   const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]); 
  //   await mockERC721.approve(offerContract.address, 1)
  //   await expect( () => offerContract.acceptOffer(hash, 0)).to.changeTokenBalance(mockERC20, mockMarket, parseEther("0.6"));

  //   const afterBalance = await mockERC721.balanceOf(accounts[0].address)
  //   const buyerBalancer = await mockERC721.balanceOf(accounts[1].address)

  //   expect(initBalance.toString()).to.be.equal("1");
  //   expect(afterBalance.toString()).to.be.equal("0");
  //   expect(buyerBalancer.toString()).to.be.equal("1");
  // });

  // it("Should transfer 1 CRC20 royalty when accepting offer", async function () {
  //   await mockERC20.transfer(accounts[1].address, parseEther("100"));
  //   await mockERC20.connect(accounts[1]).approve(offerContract.address, parseEther("100"));
  //   await offerContract.connect(accounts[1]).makeOfferWithToken(mockERC721.address, 1, parseEther("20"), mockERC20.address)

  //   const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]); 
  //   await mockERC721.approve(offerContract.address, 1)
  //   await expect( () => offerContract.acceptOffer(hash, 0)).to.changeTokenBalance(mockERC20, accounts[3], parseEther("1"));
  // });

  // it("Should transfer 18.4 CRC20 to seller when accepting offer", async function () {
  //   await mockERC20.transfer(accounts[1].address, parseEther("100"));
  //   await mockERC20.connect(accounts[1]).approve(offerContract.address, parseEther("100"));
  //   await offerContract.connect(accounts[1]).makeOfferWithToken(mockERC721.address, 1, parseEther("20"), mockERC20.address)
  //   const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]); 
  //   await mockERC721.approve(offerContract.address, 1)
  //   await expect( () => offerContract.acceptOffer(hash, 0)).to.changeTokenBalance(mockERC20, accounts[0], parseEther("18.4"));
  // });

  // it("Should reject other offers when accepting offer", async function () {
  //   await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
  //     from: accounts[1].address,
  //     value: parseEther("20")
  //   })

  //   await offerContract.connect(accounts[2]).makeOffer(mockERC1155.address, 1, {
  //     from: accounts[2].address,
  //     value: parseEther("30")
  //   })

  //   await offerContract.connect(accounts[4]).makeOffer(mockERC1155.address, 1, {
  //     from: accounts[4].address,
  //     value: parseEther("40")
  //   })

  //   const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 

  //   expect( await offerContract.acceptOffer(hash, 1)).to.changeEtherBalance(accounts[4], parseEther("40"));
    
  //   const offers = await offerContract.getOffers(mockERC1155.address, 1);
    
  //   expect(offers[0].status).to.be.equal(1)
  //   expect(offers[2].status).to.be.equal(1)
  // });

  it("Should check is721()", async function () {
    expect( await offerContract.is721(mockERC721.address)).to.be.equal(true);
    expect( await offerContract.is721(mockERC1155.address)).to.be.equal(false);
  });

  it("Should check is1155()", async function () {
    expect( await offerContract.is1155(accounts[0].address)).to.be.equal(false);
    expect( await offerContract.is1155(mockERC1155.address)).to.be.equal(true);
  });
 
  it("Should only accept NFT when making offer", async function () {
    await expect( offerContract.makeOffer(accounts[1].address, 1))
    .to.be.revertedWith("unsupported type");  
  });

  it("Should not cancell the offer when not exist", async function () {
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 
    await expect( offerContract.cancelOffer(hash, 0))
    .to.be.revertedWith("offer not exist");  
  });

  it("Should not cancell the offer when incorrect buyer", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 
    await expect( offerContract.cancelOffer(hash, 0))
    .to.be.revertedWith("incorrect buyer");  
  });

  it("Should not cancell the offer when offer is not opened", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]);
    await offerContract.acceptOffer(hash, 0);

    await expect( offerContract.connect(accounts[1]).cancelOffer(hash, 0))
    .to.be.revertedWith("offer is not opened");  
  });

  it("Should not accept the offer when not exist", async function () {
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]); 
    await expect( offerContract.acceptOffer(hash, 0))
    .to.be.revertedWith("offer not exist");  
  });

 
  it("Should not accept the offer when offer is not opened", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]);
    await offerContract.acceptOffer(hash, 0);
   
    await expect( offerContract.acceptOffer(hash, 0))
    .to.be.revertedWith("offer is not opened");  
  });

  it("Should not accept the offer when seller is not the owner of the nft", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC721.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);
    
    await expect( offerContract.connect(accounts[1]).acceptOffer(hash, 0))
    .to.be.revertedWith("not nft owner");  
  });

  it("Should not accept the offer when seller doesn't have enough balance for ERC1155", async function () {
    await offerContract.connect(accounts[1]).makeOffer(mockERC1155.address, 1, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC1155.address, 1]);
    
    await expect( offerContract.connect(accounts[1]).acceptOffer(hash, 0))
    .to.be.revertedWith("not enough balance for token");  
  });

  it("Should not reject the offer when offer is not opened", async function () {
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);
    await offerContract.acceptOffer(hash, 0);
    
    await expect( offerContract.rejectOffer(hash, 0))
    .to.be.revertedWith("offer is not opened");  
  });

  it("Should not make new one if already exist", async function () {
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })

    await expect(offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })).to.be.revertedWith("already exist");
    
    // already cancelled
    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);
    await offerContract.cancelOffer(hash, 0);
    await expect(offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })).to.emit(offerContract, "OfferMade");

    expect((await offerContract.getOffers(mockERC721.address, 1)).length).to.be.eq(2);
  });

  it("Should update offer", async function () {
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);

    await expect(offerContract.connect(accounts[1]).updateOffer(hash, 0, {
      from: accounts[1].address,
      value: parseEther("30")
    })).to.be.revertedWith("not offer owner");

    // should update the offer
    await expect(offerContract.updateOffer(hash, 0, {
      from: accounts[0].address,
      value: parseEther("30")
    })).to.emit(offerContract, "OfferUpdated");

    
    const offer = await offerContract.getOffer(hash, 0);

    expect(offer[1].nft).to.be.equal(mockERC721.address)
    expect(offer[1].buyer).to.be.equal(accounts[0].address)
    expect(offer[1].amount).to.be.equal(parseEther("50"))
    expect(offer[1].status).to.be.equal(4)    
  });

  it("Should create another offer when upading accepted offer", async function () {
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);
    await offerContract.acceptOffer(hash, 0);
    
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("30")
    })

    const offer1 = await offerContract.getOffer(hash, 0);

    expect(offer1[1].nft).to.be.equal(mockERC721.address)
    expect(offer1[1].buyer).to.be.equal(accounts[0].address)
    expect(offer1[1].amount).to.be.equal(parseEther("20"))
    expect(offer1[1].status).to.be.equal(3)    

    const offer2 = await offerContract.getOffer(hash, 1);

    expect(offer2[1].nft).to.be.equal(mockERC721.address)
    expect(offer2[1].buyer).to.be.equal(accounts[0].address)
    expect(offer2[1].amount).to.be.equal(parseEther("30"))
    expect(offer2[1].status).to.be.equal(0);
  });

  it("Should create another offer when upading rejected offer", async function () {
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);
    await offerContract.rejectOffer(hash, 0);
    
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("30")
    })

    const offer1 = await offerContract.getOffer(hash, 0);

    expect(offer1[1].nft).to.be.equal(mockERC721.address)
    expect(offer1[1].buyer).to.be.equal(accounts[0].address)
    expect(offer1[1].amount).to.be.equal(parseEther("20"))
    expect(offer1[1].status).to.be.equal(1)    

    const offer2 = await offerContract.getOffer(hash, 1);

    expect(offer2[1].nft).to.be.equal(mockERC721.address)
    expect(offer2[1].buyer).to.be.equal(accounts[0].address)
    expect(offer2[1].amount).to.be.equal(parseEther("30"))
    expect(offer2[1].status).to.be.equal(0)    
  });

  it("Should create another offer when upading cancelled offer", async function () {
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("20")
    })

    const hash = ethers.utils.solidityKeccak256(["address", "uint"], [mockERC721.address, 1]);
    await offerContract.cancelOffer(hash, 0);
    
    await offerContract.makeOffer(mockERC721.address, 1, {
      from: accounts[0].address,
      value: parseEther("30")
    })

    const offer1 = await offerContract.getOffer(hash, 0);

    expect(offer1[1].nft).to.be.equal(mockERC721.address)
    expect(offer1[1].buyer).to.be.equal(accounts[0].address)
    expect(offer1[1].amount).to.be.equal(parseEther("20"))
    expect(offer1[1].status).to.be.equal(2)    

    const offer2 = await offerContract.getOffer(hash, 1);

    expect(offer2[1].nft).to.be.equal(mockERC721.address)
    expect(offer2[1].buyer).to.be.equal(accounts[0].address)
    expect(offer2[1].amount).to.be.equal(parseEther("30"))
    expect(offer2[1].status).to.be.equal(0)    
  });



  describe("Test entire collection features", function () {
    it("Should make offer for collection", async function () {    
      await expect(offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })).to.emit(offerContract, "CollectionOfferMade");
      
      const offers = await offerContract.getCollectionOffers(mockERC1155.address);
      
      expect(offers.length).to.be.equal(1)

      expect(offers[0].nft).to.be.equal(mockERC1155.address)
      expect(offers[0].buyer).to.be.equal(accounts[1].address)
      expect(offers[0].amount).to.be.equal(parseEther("20"))
      expect(offers[0].status).to.be.equal(0)
    });

    it("Should cancel offer for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })
    
      await expect( offerContract.connect(accounts[1]).cancelCollectionOffer(mockERC1155.address, 0)).to.emit(offerContract, "CollectionOfferCancelled")

      const offer1 = await offerContract.getCollectionOffer(mockERC1155.address, 0);
      expect(offer1[1].status).to.be.equal(2);
    });

    it("Should staff can cancel the offer for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })
      
      await expect( offerContract.connect(accounts[2]).cancelCollectionOffer(mockERC1155.address, 0)).to.be.revertedWith("incorrect buyer");

      await offerContract.grantRole(await offerContract.STAFF_ROLE(), accounts[2].address)
      await expect( offerContract.connect(accounts[2]).cancelCollectionOffer(mockERC1155.address, 0)).to.emit(offerContract, "CollectionOfferCancelled")
      const offer1 = await offerContract.getCollectionOffer(mockERC1155.address, 0);
      expect(offer1[1].status).to.be.equal(2);
    });

    it("Should refund Cro when cancelling offer for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await expect(() => offerContract.connect(accounts[1]).cancelCollectionOffer(mockERC1155.address, 0)).to.changeEtherBalance(accounts[1], parseEther("20"));
    });

    it("Should accept offer for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await expect( offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1)).to.emit(offerContract, "CollectionOfferAccepted")

      const offer = await offerContract.getCollectionOffer(mockERC1155.address, 0);
      expect(offer[1].status).to.be.equal(3);

    });

    it("Should transfer 0.3 Cro to market contract, 0.3Cro to staker contract and transfer 1155nft when accepting collection offer", async function () {
      await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 3, 1, ethers.utils.formatBytes32String(""));
      await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 2, 20, ethers.utils.formatBytes32String(""));

      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })
      const initBalance = await mockERC1155.balanceOf(accounts[0].address, 1)

      await expect( () => offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1)).to.changeEtherBalance(mockMarket, parseEther("0.3"));
      expect(await  ethers.provider.getBalance(mockStaker.address)).to.be.equal(parseEther("0.3"));

      const afterBalance = await mockERC1155.balanceOf(accounts[0].address, 1)
      const buyerBalancer = await mockERC1155.balanceOf(accounts[1].address, 1)

      expect(initBalance.toString()).to.be.equal("4");
      expect(afterBalance.toString()).to.be.equal("3");
      expect(buyerBalancer.toString()).to.be.equal("1");
    });


    it("Should transfer 1 Cro royalty when accepting offer", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1);
      await expect( () => mockMarket.withdrawPayments(accounts[3].address)).to.changeEtherBalance(accounts[3], parseEther("1"));
    });

    it("Should transfer 18.4 Cro to seller when accepting offer", async function () {
      await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 3, 1, ethers.utils.formatBytes32String(""));
      await memberships.safeTransferFrom(accounts[0].address, accounts[5].address, 2, 20, ethers.utils.formatBytes32String(""));

      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await expect( () => offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1)).to.changeEtherBalance(accounts[0], parseEther("18.4"));
    });

    it("Should only accept NFT when making offer for collection", async function () {
      await expect( offerContract.makeCollectionOffer(accounts[1].address))
      .to.be.revertedWith("unsupported type");  
    });

    it("Should not cancell the offer when not exist for collection", async function () {
      await expect( offerContract.cancelCollectionOffer(mockERC1155.address, 0))
      .to.be.revertedWith("offer not exist");  
    });

    it("Should not cancell the offer when incorrect buyer for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await expect( offerContract.cancelCollectionOffer(mockERC1155.address, 0))
      .to.be.revertedWith("incorrect buyer");  
    });

    it("Should not cancell the offer when offer is not opened for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1);

      await expect( offerContract.connect(accounts[1]).cancelCollectionOffer(mockERC1155.address, 0))
      .to.be.revertedWith("offer is not opened");  
    });

    it("Should not accept the offer when not exist for collection", async function () {
      await expect( offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1))
      .to.be.revertedWith("offer not exist");  
    });

  
    it("Should not accept the offer when offer is not opened for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })

      await offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1);
    
      await expect( offerContract.acceptCollectionOffer(mockERC1155.address, 0, 1))
      .to.be.revertedWith("offer is not opened");  
    });

    it("Should not accept the offer when seller is not the owner of the nft for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC721.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })
      
      await expect( offerContract.connect(accounts[2]).acceptCollectionOffer(mockERC721.address, 0, 1))
      .to.be.revertedWith("not token owner");  
    });

    it("Should not accept the offer when seller doesn't have enough balance for ERC1155 for collection", async function () {
      await offerContract.connect(accounts[1]).makeCollectionOffer(mockERC1155.address, {
        from: accounts[1].address,
        value: parseEther("20")
      })
    
      await expect( offerContract.connect(accounts[2]).acceptCollectionOffer(mockERC1155.address, 0, 1))
      .to.be.revertedWith("not enough balance for token");  
    });

    it("Should update offer for collection", async function () {
      await offerContract.makeCollectionOffer(mockERC721.address, {
        from: accounts[0].address,
        value: parseEther("20")
      })

      // should update the offer
      await expect(offerContract.makeCollectionOffer(mockERC721.address, {
        from: accounts[0].address,
        value: parseEther("30")
      })).to.emit(offerContract, "CollectionOfferUpdated");
    
      const offer = await offerContract.getCollectionOffer(mockERC721.address, 0);

      expect(offer[1].nft).to.be.equal(mockERC721.address)
      expect(offer[1].buyer).to.be.equal(accounts[0].address)
      expect(offer[1].amount).to.be.equal(parseEther("50"))
      expect(offer[1].status).to.be.equal(4)    
    });

    it("Should create another offer when upading accepted offer for collection", async function () {
      await offerContract.makeCollectionOffer(mockERC721.address, {
        from: accounts[0].address,
        value: parseEther("20")
      })

      await offerContract.acceptCollectionOffer(mockERC721.address, 0, 1);
      
      await offerContract.makeCollectionOffer(mockERC721.address, {
        from: accounts[0].address,
        value: parseEther("30")
      })

      const offer1 = await offerContract.getCollectionOffer(mockERC721.address, 0);

      expect(offer1[1].nft).to.be.equal(mockERC721.address)
      expect(offer1[1].buyer).to.be.equal(accounts[0].address)
      expect(offer1[1].amount).to.be.equal(parseEther("20"))
      expect(offer1[1].status).to.be.equal(3)    

      const offer2 = await offerContract.getCollectionOffer(mockERC721.address, 1);

      expect(offer2[1].nft).to.be.equal(mockERC721.address)
      expect(offer2[1].buyer).to.be.equal(accounts[0].address)
      expect(offer2[1].amount).to.be.equal(parseEther("30"))
      expect(offer2[1].status).to.be.equal(0);
    });

    it("Should create another offer when upading cancelled offer for collection", async function () {
      await offerContract.makeCollectionOffer(mockERC721.address, {
        from: accounts[0].address,
        value: parseEther("20")
      })

      await offerContract.cancelCollectionOffer(mockERC721.address, 0);
      
      await offerContract.makeCollectionOffer(mockERC721.address, {
        from: accounts[0].address,
        value: parseEther("30")
      })

      const offer1 = await offerContract.getCollectionOffer(mockERC721.address, 0);

      expect(offer1[1].nft).to.be.equal(mockERC721.address)
      expect(offer1[1].buyer).to.be.equal(accounts[0].address)
      expect(offer1[1].amount).to.be.equal(parseEther("20"))
      expect(offer1[1].status).to.be.equal(2)    

      const offer2 = await offerContract.getCollectionOffer(mockERC721.address, 1);

      expect(offer2[1].nft).to.be.equal(mockERC721.address)
      expect(offer2[1].buyer).to.be.equal(accounts[0].address)
      expect(offer2[1].amount).to.be.equal(parseEther("30"))
      expect(offer2[1].status).to.be.equal(0)    
    });
  })
}); 