const { expect } = require("chai");
const { ethers, waffle, upgrades } = require("hardhat");
const parseEther = ethers.utils.parseEther;

const runTime = 3600 * 24 * 7;
async function init() {
    accounts = await ethers.getSigners();

    const MockNFT = await ethers.getContractFactory("BasicNFT");
    mockNFT = await MockNFT.deploy();
    await mockNFT.deployed();

    await mockNFT.safeMint(accounts[0].address);
    await mockNFT.safeMint(accounts[0].address);
    await mockNFT.safeMint(accounts[0].address);
    await mockNFT.safeMint(accounts[0].address);
    await mockNFT.safeMint(accounts[1].address);

    stakingFactory = await ethers.getContractFactory("MembershipStaker")
    marketFactory = await ethers.getContractFactory("Marketplace");
    membershipFactory = await ethers.getContractFactory("EbisusBayMembership");
    memberships = await membershipFactory.deploy();
    await memberships.deployed();

    marketContract = await upgrades.deployProxy(marketFactory, [memberships.address], {
        kind : "uups"
    });
    stakerContract = await upgrades.deployProxy(stakingFactory, [memberships.address], {
        kind : "uups"
    });

    const NFTAuction = await ethers.getContractFactory("NFTAuction");
    nftAuction = await upgrades.deployProxy(NFTAuction, [marketContract.address, stakerContract.address], {
      kind : "uups"
    });

    await nftAuction.deployed();
    await mockNFT.setApprovalForAll(marketContract.address, true);
    await mockNFT.connect(accounts[1]).setApprovalForAll(marketContract.address, true);
    await mockNFT.connect(accounts[2]).setApprovalForAll(marketContract.address, true);

    await marketContract.grantRole(await marketContract.SERVER_ROLE(), nftAuction.address);

    // token Id '2' auction with '10' starting amount for owner
    await nftAuction.createAuction(mockNFT.address, 2, 1, parseEther("10"), parseEther("100"), runTime);

    // token Id '3' auction with '10' starting amount for owner
    await nftAuction.createAuction(mockNFT.address, 3, 1, parseEther("10"), 0, runTime);

    // token Id '4' auction with '10' starting amount for account1
    await nftAuction.connect(accounts[1]).createAuction(mockNFT.address, 4, 1, parseEther("10"), 0, runTime);
    const auctionHashes=  [];
    auctionHashes[0] = await nftAuction.generateHash(accounts[0].address, mockNFT.address, 2, 1)
    auctionHashes[1] = await nftAuction.generateHash(accounts[0].address, mockNFT.address, 3, 1)
    auctionHashes[2] = await nftAuction.generateHash(accounts[1].address, mockNFT.address, 4, 1)

    return {
      nftAuction,
      mockNFT,
      accounts,
      auctionHashes
    }
}

describe("Test upgrade", function () {
  it ("Should allow only admin to upgrade", async function() {
    it('should only let admin upgrade', async () => {
      let v2 = await ethers.getContractFactory("NFTAuctionV2");
      await expect(upgrades.upgradeProxy(nftAuction.address, v2)).to.be.reverted;
      v2 = await ethers.getContractFactory("NFTAuctionV2", admin);
      const upgrade = await upgrades.upgradeProxy(market.address, v2);
      await expect(await upgrade.name()).to.eq("v2");
  })
  })
})

describe("Test NFTauction createAuction()", function () {
  let nftAuction;
  let mockNFT;
  let accounts;
  let auctionHashes = [];

  it("Should set the seller of auction with the caller", async function () {
    const initData = await init();

    ({accounts, nftAuction, mockNFT, auctionHashes} = initData);

    const seller1 = await nftAuction.getSeller(auctionHashes[0], 0);
    const seller2 = await nftAuction.getSeller(auctionHashes[1], 0);

    expect( seller1 ).to.equal(accounts[0].address);
    expect( seller2 ).to.equal(accounts[0].address);
  });

  it("Should transfer nft when creating auction", async function () {
    expect(await mockNFT.ownerOf(0)).to.be.equal(accounts[0].address);
    await nftAuction.createAuction(mockNFT.address, 0, 1, parseEther("10"), 0, runTime);
    expect(await mockNFT.ownerOf(0)).to.be.equal(nftAuction.address);
  });

  it("Should not create for the not owner of token", async function () {
    await mockNFT.safeMint(accounts[2].address);
    await expect( nftAuction.connect(accounts[1]).createAuction(mockNFT.address, 5, 1, parseEther("10"), 0,  runTime)).to.be.revertedWith("not owner of token");
  });
 
  // it("Should not create when revoke the permission", async function () {
  //   await mockNFT.connect(accounts[2]).setApprovalForAll(nftAuction.address, false);
  //   await expect( nftAuction.connect(accounts[2]).createAuction(mockNFT.address, 5, 1, parseEther("10"), runTime)).to.be.revertedWith("seller revoked approval");
  // });
})

describe("Test NFTauction bid()", function () {
  let nftAuction;
  let mockNFT;
  let accounts;
  let auctionHashes = [];

  beforeEach(async function () {
    const initData = await init();

    ({accounts, nftAuction, mockNFT, auctionHashes} = initData);
  })
  
  
  it("Should not bid for the token seller", async function () {
    await expect( nftAuction.bid(auctionHashes[0], 0)).to.be.revertedWith("not available for token seller");
    await expect( nftAuction.bid(auctionHashes[1], 0)).to.be.revertedWith("not available for token seller");
    await expect( nftAuction.connect(accounts[1]).bid(auctionHashes[2], 0)).to.be.revertedWith("not available for token seller");
  });

  it("Should not bid after end time passed", async function () {
    await ethers.provider.send('evm_increaseTime', [runTime + 1]);
    await ethers.provider.send('evm_mine');

    await expect( nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("15")
    })).to.be.revertedWith("ended");
  });
  
  it("Should not bid with samller amount than minium bid ", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("15")
    })
    // when current highest bid is 15;
    await expect( nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("24")
    })).to.be.revertedWith("not miniumbid");

    // bid with 25
    await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
      from: accounts[3].address,
      value: parseEther("25")
    })

    await nftAuction.connect(accounts[4]).bid(auctionHashes[0], 0, {
      from: accounts[4].address,
      value: parseEther("101")
    })
    // when current highest bid is 101;
    await expect( nftAuction.connect(accounts[5]).bid(auctionHashes[0], 0, {
      from: accounts[5].address,
      value: parseEther("150")
    })).to.be.revertedWith("not miniumbid");
  });
  
  it("Should increase end time with 10 mins", async function () {
    await ethers.provider.send('evm_increaseTime', [runTime - 600]);
    await ethers.provider.send('evm_mine');

    await expect( nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })).to.emit(nftAuction, "TimeIncreased")
    .withArgs(auctionHashes[0], 0, accounts[1].address, 10);
  });

  it("Should increase end time with 10 mins for multiple actions", async function () {
    await ethers.provider.send('evm_increaseTime', [runTime - 600]);
    await ethers.provider.send('evm_mine');

    await expect( nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })).to.emit(nftAuction, "TimeIncreased")
    .withArgs(auctionHashes[0], 0, accounts[1].address, 10);

    await expect( nftAuction.connect(accounts[2]).bid(auctionHashes[2], 0, {
      from: accounts[2].address,
      value: parseEther("20")
    })).to.emit(nftAuction, "TimeIncreased")
    .withArgs(auctionHashes[2], 0, accounts[2].address, 10);
  });

  it("Should emit Bid event", async function () {
    await expect( nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })).to.emit(nftAuction, "Bid")
  });

  it("Should update the existing Bid", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("35")
    });
    
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("25")
    });

    const auction = await nftAuction.getAuction(auctionHashes[0], 0);

    expect(auction.highestBid).to.be.equal(parseEther("45"))
  });
  
  it("Should not update when adding balance is not greater than minium bid", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })

    await expect(nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("35")
    }));
    
    await (expect(nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("24")
    }))).to.be.revertedWith("not miniumbid");;
  });
 
  it("Should emit Bid event for muliple acutions", async function () {
    await expect( nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })).to.emit(nftAuction, "Bid")
    .withArgs(auctionHashes[0], 0, 0, accounts[1].address, parseEther("20"));

    await expect( nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("40")
    })).to.emit(nftAuction, "Bid")
    .withArgs(auctionHashes[0], 0, 0, accounts[2].address, parseEther("40"));
   
    await expect( nftAuction.connect(accounts[2]).bid(auctionHashes[2], 0, {
      from: accounts[2].address,
      value: parseEther("30")
    })).to.emit(nftAuction, "Bid")
    .withArgs(auctionHashes[2], 0, 0, accounts[2].address, parseEther("30"));
  });
});

describe("Test NFTAuction accept()", function () {
  let nftAuction;
  let mockNFT;
  let accounts;
  let auctionHashes = [];
  
  beforeEach(async function () {
    const initData = await init();

    ({accounts, nftAuction, mockNFT, auctionHashes} = initData);
  })

  it("Should not accept when not exist", async function () {
    await expect( nftAuction.accept(ethers.utils.formatBytes32String("testhash"), 0)).to.be.revertedWith("auction not available");
  });
  
  it("Should not accept after ended", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    await ethers.provider.send('evm_increaseTime', [runTime + 1]);
    await ethers.provider.send('evm_mine');
    
    await nftAuction.accept(auctionHashes[0], 0);

    await expect( nftAuction.accept(auctionHashes[0], 0)).to.be.revertedWith("ended");
  });

  it("Should pay to the seller and send NFTs to highest bidders: multiple actions for Token2 and Token3", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("20")
    })
    await nftAuction.connect(accounts[2]).bid(auctionHashes[1], 0, {
      from: accounts[2].address,
      value: parseEther("30")
    })

    await ethers.provider.send('evm_increaseTime', [runTime + 1]);
    await ethers.provider.send('evm_mine');

    // the fee is 0 because it has more than 3 vips
    await expect(() => nftAuction.accept(auctionHashes[0], 0)).to.changeEtherBalance(accounts[0], parseEther("20"));
    await expect(() => nftAuction.accept(auctionHashes[1], 0)).to.changeEtherBalance(accounts[0], parseEther("30"));
    
    expect( await mockNFT.ownerOf(2)).to.equal(accounts[1].address);    
    expect( await mockNFT.ownerOf(3)).to.equal(accounts[2].address);
  });

  it("Should 5% fee when not VIP", async function () {
    await nftAuction.connect(accounts[3]).bid(auctionHashes[2], 0, {
      from: accounts[3].address,
      value: parseEther("20")
    })
   
    await ethers.provider.send('evm_increaseTime', [runTime + 1]);
    await ethers.provider.send('evm_mine');

    // the fee is 5%
    await expect(() => nftAuction.connect(accounts[1]).accept(auctionHashes[2], 0)).to.changeEtherBalance(accounts[1], parseEther("19"));   
  });
});

describe("Test NFTAuction cancel()", function () {
  let nftAuction;
  let mockNFT;
  let auctionHashes = [];
  
  beforeEach(async function () {
    const initData = await init();

    ({nftAuction, mockNFT, auctionHashes} = initData);
  })
 
  it("Should not accept after ended", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    
    await nftAuction.accept(auctionHashes[0], 0);

    await expect( nftAuction.cancel(auctionHashes[0], 0)).to.be.revertedWith("ended");
  });

 
  it("Should not accept after canceled", async function () {
    await nftAuction.cancel(auctionHashes[0], 0);

    await expect( nftAuction.accept(auctionHashes[0], 0)).to.be.revertedWith("auction not available");
  });

  it("Should cancel auction till 24 hours before expiration of auction ", async function () {
    await ethers.provider.send('evm_increaseTime', [60 * 60 * 24 * 5 + 1]);
    await ethers.provider.send('evm_mine');
    // transfer back the nft
    expect(await mockNFT.ownerOf(2)).to.be.equal(nftAuction.address);
    await nftAuction.cancel(auctionHashes[0], 0);
    expect(await mockNFT.ownerOf(2)).to.be.equal(accounts[0].address);

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 24]);
    await ethers.provider.send('evm_mine');
    await expect(nftAuction.cancel(auctionHashes[1], 0)).to.be.revertedWith("time passed");
  });
  
  it("Should create another one after canceled", async function () {
    await ethers.provider.send('evm_increaseTime', [runTime - 24 * 3600 - 10]);
    await ethers.provider.send('evm_mine');
    await nftAuction.cancel(auctionHashes[0], 0);

    // create another auction
    await nftAuction.createAuction(mockNFT.address, 2, 1, parseEther("200"), 0, runTime);
    const auctions = await nftAuction.getAuctionsByHash(auctionHashes[0]);
    expect(auctions.length).to.be.equal(2);
    expect(auctions[1].startingBid).to.be.equal(parseEther("200"));
  });
});

describe("Test NFTauction withdraw()", function () {
  let nftAuction;
  let mockNFT;
  let accounts;
  let auctionHashes = []

  beforeEach(async function () {
    const initData = await init();

    ({accounts, nftAuction, mockNFT, auctionHashes} = initData);
  })

  it("Should withdraw the bid for outbid: account1", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("21")
    });
    await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
      from: accounts[3].address,
      value: parseEther("31")
    });

    await nftAuction.accept(auctionHashes[0], 0);
 
    // for not existing bidder
    await expect( nftAuction.connect(accounts[4]).withdraw(auctionHashes[0], 0)).to.be.revertedWith("no bidder exist");

    await expect(() => nftAuction.connect(accounts[1]).withdraw(auctionHashes[0], 0)).to.be.changeEtherBalance(accounts[1], parseEther("11"));
    await expect(() => nftAuction.connect(accounts[2]).withdraw(auctionHashes[0], 0)).to.be.changeEtherBalance(accounts[2], parseEther("21"));
  });

  it("Should not withdraw for the highest bidder", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0,{
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0,{
      from: accounts[2].address,
      value: parseEther("21")
    });

   await nftAuction.accept(auctionHashes[0], 0);

   // for highest bidder
   await expect( nftAuction.connect(accounts[2]).withdraw(auctionHashes[0], 0)).to.be.revertedWith("not available for highest bidder");
  });
  
  it("Should not withdraw after withdrawn", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0,{
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0,{
      from: accounts[2].address,
      value: parseEther("21")
    });

   await nftAuction.accept(auctionHashes[0], 0);

   await nftAuction.connect(accounts[1]).withdraw(auctionHashes[0], 0);

   await expect( nftAuction.connect(accounts[1]).withdraw(auctionHashes[0], 0)).to.be.revertedWith("no bidder exist");
  });

  it("Should allow withdraw for the highest bidder after cancelling the auction", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0,{
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0,{
      from: accounts[2].address,
      value: parseEther("21")
    });

   await nftAuction.cancel(auctionHashes[0], 0);

   // for highest bidder
   expect( await nftAuction.connect(accounts[2]).withdraw(auctionHashes[0], 0)).to.be.changeEtherBalance(accounts[2], parseEther("21"));
  });
});

// describe("Test NFTauction getAllBids()", function () {
//   let nftAuction;
//   let accounts;
//   let auctionHashes = []

//   beforeEach(async function () {
//     const initData = await init();

//     ({accounts, nftAuction, auctionHashes} = initData);
//   })

  // it("Should return all bids", async function () {
  //   await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
  //     from: accounts[1].address,
  //     value: parseEther("11")
  //   });
  //   await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
  //     from: accounts[2].address,
  //     value: parseEther("21")
  //   });
  //   await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
  //     from: accounts[3].address,
  //     value: parseEther("31")
  //   });
   
  //   const bids = await nftAuction.getAllBids(auctionHashes[0], 0);

  //   expect(bids.length).to.be.equal(3);
  //   expect(bids[0].bidder).to.be.equal(accounts[1].address);
  //   expect(bids[1].bidder).to.be.equal(accounts[2].address);
  //   expect(bids[2].bidder).to.be.equal(accounts[3].address);
  // });
// });


describe("Test NFTauction returnBidsToWallets()", function () {
  let nftAuction;
  let accounts;
  let auctionHashes = []

  beforeEach(async function () {
    const initData = await init();

    ({accounts, nftAuction, auctionHashes} = initData);
  })

  it("Should refund money for all users except highest bidder and withdrawn bidder", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("21")
    });
    await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
      from: accounts[3].address,
      value: parseEther("31")
    });
    
    await nftAuction.connect(accounts[4]).bid(auctionHashes[0], 0, {
      from: accounts[4].address,
      value: parseEther("42")
    });

    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("31")
    });

    const account1InitialBalance = await waffle.provider.getBalance(accounts[1].address);
    const account2InitialBalance = await waffle.provider.getBalance(accounts[2].address); // highest bidder
    const account3InitialBalance = await waffle.provider.getBalance(accounts[3].address);
    
    await nftAuction.connect(accounts[4]).withdraw(auctionHashes[0], 0);
    const account4InitialBalance = await waffle.provider.getBalance(accounts[4].address); //withdrawn bidder

    await nftAuction.returnBidsToWallets(auctionHashes[0], 0, [accounts[0].address,accounts[1].address, accounts[2].address, accounts[3].address, accounts[4].address, ]);

    const account1AfterBalance = await waffle.provider.getBalance(accounts[1].address);
    const account2AfterBalance = await waffle.provider.getBalance(accounts[2].address);
    const account3AfterBalance = await waffle.provider.getBalance(accounts[3].address);
    const account4AfterBalance = await waffle.provider.getBalance(accounts[4].address);
    expect(account1InitialBalance.add(parseEther("11"))).to.be.equal(account1AfterBalance);
    expect(account3InitialBalance.add(parseEther("31"))).to.be.equal(account3AfterBalance);
    expect(account2InitialBalance.toString()).to.be.equal(account2AfterBalance.toString());
    expect(account4InitialBalance.toString()).to.be.equal(account4AfterBalance.toString());

    await expect( nftAuction.connect(accounts[4]).withdraw(auctionHashes[0], 0)).to.be.revertedWith("no bidder exist");
  });

  it("Should not returns bids multiple times", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("21")
    });
    await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
      from: accounts[3].address,
      value: parseEther("31")
    });
    
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("31")
    });

    await nftAuction.returnBidsToWallets(auctionHashes[0], 0, [accounts[1].address, accounts[2].address, accounts[3].address]);
    const account1InitialBalance = await waffle.provider.getBalance(accounts[1].address);
    const account2InitialBalance = await waffle.provider.getBalance(accounts[2].address); // highest bidder
    const account3InitialBalance = await waffle.provider.getBalance(accounts[3].address);
    // returns bids multiple times
    await nftAuction.returnBidsToWallets(auctionHashes[0], 0, [accounts[1].address, accounts[2].address, accounts[3].address]);

    const account1AfterBalance = await waffle.provider.getBalance(accounts[1].address);
    const account2AfterBalance = await waffle.provider.getBalance(accounts[2].address);
    const account3AfterBalance = await waffle.provider.getBalance(accounts[3].address);
 
    expect(account1InitialBalance.toString()).to.be.equal(account1AfterBalance.toString());
    expect(account2InitialBalance.toString()).to.be.equal(account2AfterBalance.toString());
    expect(account3InitialBalance.toString()).to.be.equal(account3AfterBalance.toString());
  });

  it("Should not call for not owner", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("21")
    });
   
    await expect(nftAuction.connect(accounts[1]).returnBidsToWallets(auctionHashes[0], 0, [accounts[0].address])).to.be.revertedWith("Ownable: caller is not the owner");
  });
});

describe("Test NFTauction minimumBid()", function () {
  let nftAuction;
  let accounts;
  let auctionHashes = []

  beforeEach(async function () {
    const initData = await init();

    ({accounts, nftAuction, auctionHashes} = initData);
  })

    it("Should include the correct minimumBid in the Auction", async function () {
      // await nftAuction.startAll();
      let auction = await nftAuction.getAuction(auctionHashes[0], 0);
      expect(auction.minimumBid).to.be.equal(parseEther("10"));

      await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, { value: parseEther("11")});
      auction = await nftAuction.getAuction(auctionHashes[0], 0);
      expect(auction.minimumBid).to.be.equal(parseEther("21"));

      await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {value: parseEther("60")});
      auction = await nftAuction.getAuction(auctionHashes[0], 0);
      expect(auction.minimumBid).to.be.equal(parseEther("70"));
    })

  it("Should return correct next minium bid", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    // when current highest bid is 11
    expect(await nftAuction.minimumBid(auctionHashes[0], 0)).to.be.equal(parseEther("21"));

    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("101")
    });
    
    // when current highest bid is 101
    expect(await nftAuction.minimumBid(auctionHashes[0], 0)).to.be.equal(parseEther("151"));

    await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
      from: accounts[3].address,
      value: parseEther("1001")
    });
    // when current highest bid is 1001
    expect(await nftAuction.minimumBid(auctionHashes[0], 0)).to.be.equal(parseEther("1101"));

    await nftAuction.connect(accounts[4]).bid(auctionHashes[0], 0, {
      from: accounts[4].address,
      value: parseEther("5000")
    });
    // when current highest bid is 5000
    expect(await nftAuction.minimumBid(auctionHashes[0], 0)).to.be.equal(parseEther("5100"));
    
    await nftAuction.connect(accounts[5]).bid(auctionHashes[0], 0, {
      from: accounts[5].address,
      value: parseEther("5100")
    });
    // when current highest bid is 5100
    expect(await nftAuction.minimumBid(auctionHashes[0], 0)).to.be.equal(parseEther("5350"));
    
    //transfer 5000 ETH to accounts[6]
    await accounts[7].sendTransaction({
      to: accounts[6].address,
      value: parseEther("5000")
    })
    await nftAuction.connect(accounts[6]).bid(auctionHashes[0], 0, {
      from: accounts[6].address,
      value: parseEther("10001")
    });
    // when current highest bid is 10001
    expect(await nftAuction.minimumBid(auctionHashes[0], 0)).to.be.equal(parseEther("10501"));
  });
});

describe("Test NFTauction with ERC1155", function () {
    let nftAuction;
    let accounts;
    let mockERC115Factory;
    let mockERC1155

    before(async() => {
      mockERC115Factory = await ethers.getContractFactory("Mock1155");
  });

  beforeEach(async() => {
      mockERC1155 = await mockERC115Factory.deploy();
      await mockERC1155.deployed();

      mockERC1155.mint(1, 10);
      const initData = await init();

     ({accounts, nftAuction} = initData);

     mockERC1155.setApprovalForAll(marketContract.address, true);
  });
    
    it("Should transfer nft when creating auction", async function () {
      expect(await mockERC1155.balanceOf(accounts[0].address, 1)).to.be.equal(10);
      await nftAuction.createAuction(mockERC1155.address, 1, 4, parseEther("10"), 0, runTime);
      expect(await mockERC1155.balanceOf(accounts[0].address, 1)).to.be.equal(6);
      expect(await mockERC1155.balanceOf(nftAuction.address, 1)).to.be.equal(4);
    });
  
    it("Should not create when insufficient balance", async function () {
      await expect( nftAuction.createAuction(mockERC1155.address, 2, 1, parseEther("10"), 0, runTime)).to.be.revertedWith("insufficient balance");
      await expect( nftAuction.createAuction(mockERC1155.address, 1, 11, parseEther("10"), 0, runTime)).to.be.revertedWith("insufficient balance");
    });

    it("Should create multiple auctions with same hash when same quantity", async function () {
      await  nftAuction.createAuction(mockERC1155.address, 1, 2, parseEther("10"), 0, runTime);
      await nftAuction.createAuction(mockERC1155.address, 1, 2, parseEther("11"), 0, runTime);
      await nftAuction.createAuction(mockERC1155.address, 1, 2, parseEther("12"), 0, runTime);
      
      const hash = await nftAuction.generateHash(accounts[0].address, mockERC1155.address, 1, 2);
      const auctions = await nftAuction.getAuctionsByHash(hash);

      expect(auctions.length).to.be.equal(3);
      expect(auctions[0].startingBid).to.be.equal(parseEther("10"));
      expect(auctions[1].startingBid).to.be.equal(parseEther("11"));
      expect(auctions[2].startingBid).to.be.equal(parseEther("12"));
    });

    it("Should create auction with different hash when different quantity", async function () {
      await  nftAuction.createAuction(mockERC1155.address, 1, 2, parseEther("10"), 0, runTime);
      await nftAuction.createAuction(mockERC1155.address, 1, 3, parseEther("11"), 0, runTime);
      
      const hash1 = await nftAuction.generateHash(accounts[0].address, mockERC1155.address, 1, 2);
      auctions = await nftAuction.getAuctionsByHash(hash1);

      expect(auctions.length).to.be.equal(1);
      expect(auctions[0].startingBid).to.be.equal(parseEther("10"));

      const hash2 = await nftAuction.generateHash(accounts[0].address, mockERC1155.address, 1, 3);
      auctions = await nftAuction.getAuctionsByHash(hash2);

      expect(auctions.length).to.be.equal(1);
      expect(auctions[0].startingBid).to.be.equal(parseEther("11"));
    });

    it("Should bid for erc1155 auction", async function() {
      await  nftAuction.createAuction(mockERC1155.address, 1, 2, parseEther("10"), 0, runTime);
      const hash = await nftAuction.generateHash(accounts[0].address, mockERC1155.address, 1, 2);
      await expect(nftAuction.connect(accounts[1]).bid(hash, 0, {
        from: accounts[1].address,
        value: parseEther("9")
      })).to.be.revertedWith("not miniumbid")

      await nftAuction.connect(accounts[1]).bid(hash, 0, {
        from: accounts[1].address,
        value: parseEther("10")
      })
    })
})

describe("Test NFTAuction buyNowPrice()", function () {
  let nftAuction;
  let mockNFT;
  let accounts;
  let auctionHashes = [];
  
  beforeEach(async function () {
    const initData = await init();

    ({accounts, nftAuction, mockNFT, auctionHashes} = initData);
  })

  it("Should not allow by when buyNowPrice not set", async function () {
    await expect(nftAuction.connect(accounts[4]).buyNow(auctionHashes[1], 0, {
      value: parseEther("100")
    })).to.be.revertedWith("unavailable buy now");
  });

  it("Should not allow by when buyNowPrice is invalid", async function () {
    await expect(nftAuction.connect(accounts[4]).buyNow(auctionHashes[0], 0, {
      value: parseEther("40")
    })).to.be.revertedWith("invalid price");
  });

  it("Should buy immediately", async function () {
    await nftAuction.connect(accounts[1]).bid(auctionHashes[0], 0, {
      from: accounts[1].address,
      value: parseEther("11")
    });
    await nftAuction.connect(accounts[2]).bid(auctionHashes[0], 0, {
      from: accounts[2].address,
      value: parseEther("21")
    });
    await nftAuction.connect(accounts[3]).bid(auctionHashes[0], 0, {
      from: accounts[3].address,
      value: parseEther("31")
    });

    await nftAuction.connect(accounts[4]).buyNow(auctionHashes[0], 0, {
      value: parseEther("100")
    });

    expect(await mockNFT.ownerOf(2)).to.be.equal(accounts[4].address);    
  });
});
