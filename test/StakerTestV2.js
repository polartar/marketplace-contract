const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");


describe("MembershipStaker2", () => {

    const VIPID = 2;
    const empty = ethers.utils.formatBytes32String("");
    let owner
    let alice
    let bob
    let membershipFactory
    let memberships
    let stakerFactory
    let staker
    let fakeMemberships
    let cs
    
    before(async() => {
        [owner, alice, bob, charlie, cs] = await ethers.getSigners();
        stakerFactory = await ethers.getContractFactory("MembershipStaker");
        membershipFactory = await ethers.getContractFactory("EbisusBayMembership");
    })

    beforeEach(async() => {

        memberships = await membershipFactory.deploy();
        await memberships.deployed();

        await memberships.updatePrice(1000, 50, VIPID);
        await memberships.connect(alice).mint(VIPID, 2, empty, {'value' : 2000})
        await memberships.connect(bob).mint(VIPID, 1, empty, {'value' : 1000})
        await memberships.connect(cs).mint(VIPID, 100, empty, {'value' : 100000})

        const stakerv1 = await upgrades.deployProxy(stakerFactory, [memberships.address], {
            kind : "uups"
        });
        
        await stakerv1.deployed();

        v2 = await ethers.getContractFactory("MembershipStakerV2");
        staker = await upgrades.upgradeProxy(stakerv1.address, v2);

        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await memberships.connect(bob).setApprovalForAll(staker.address, true);
    })

    it('init to zero', async() => {
        expect(await staker.totalStaked()).to.eq(0);
    })

    it ('should not pay before end period', async() => {
        await memberships.connect(cs).setApprovalForAll(staker.address, true);

        await staker.connect(alice).stake(1);
        await staker.connect(bob).stake(1);
        await staker.connect(cs).stake(3);
        
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });

        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });        

        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("0"));
        await staker.endInitPeriod();
        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));
    })

    it ('should add more stakers and split payment correclty', async() => {
        await memberships.connect(cs).setApprovalForAll(staker.address, true);

        await staker.connect(alice).stake(1);
        await staker.connect(bob).stake(1);
        await staker.connect(cs).stake(3);
        
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });

        await staker.endInitPeriod();

        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });        

        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));
        await expect(await staker.harvest(bob.address)).to.changeEtherBalance(bob, ethers.utils.parseEther("2.0"));
        await expect(await staker.harvest(cs.address)).to.changeEtherBalance(cs, ethers.utils.parseEther("6.0"));

        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("0"));
    })

    it ('should return 0 when no staked or no deposited', async() => {
        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("0"));
    })

    it ('should get reward', async() => {
        await memberships.connect(cs).setApprovalForAll(staker.address, true);

        await staker.connect(alice).stake(1);
        await staker.connect(bob).stake(1);
        await staker.connect(cs).stake(3);
        
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });

        await staker.endInitPeriod();

        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });        
        
        expect(await staker.getReward(alice.address)).to.be.equal(ethers.utils.parseEther("2.0"));
        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));
        
        expect(await staker.getReward(alice.address)).to.be.equal(ethers.utils.parseEther("0.0"));
        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("0"));
    })

    it ('should add more deposit and split payment correclty', async() => {
        await staker.endInitPeriod();
        await memberships.connect(cs).setApprovalForAll(staker.address, true);

        await staker.connect(alice).stake(1);
        await staker.connect(bob).stake(1);
        await staker.connect(cs).stake(3);
        
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });  


        await memberships.connect(alice).mint(VIPID, 3, empty, {'value' : 3000})
        await expect(await staker.connect(alice).stake(3)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));     
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("3.0"), // Sends exactly 3.0 ether
          }); 

        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("1.5"));
    })

    it ('should pay reward in the next block', async() => {
        await staker.endInitPeriod();
        await memberships.connect(cs).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(1);
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });  

        await staker.connect(bob).stake(1);
        
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("2.0"), // Sends exactly 2.0 ether
          });

        
        await expect(await staker.harvest(bob.address)).to.changeEtherBalance(bob, ethers.utils.parseEther("1"));
        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("11"));
    })

    it ('should get released reward', async() => {
        await staker.endInitPeriod();
        await memberships.connect(cs).setApprovalForAll(staker.address, true);

        await staker.connect(alice).stake(1);
        await staker.connect(bob).stake(1);
        await staker.connect(cs).stake(3);
        
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("5.0"), // Sends exactly 5.0 ether
          });  


        await memberships.connect(alice).mint(VIPID, 3, empty, {'value' : 3000})
        await expect(await staker.connect(alice).stake(3)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));     
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("3.0"), // Sends exactly 3.0 ether
          }); 

        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("1.5"));

        expect(await staker.getReleasedReward(alice.address)).to.be.equal(ethers.utils.parseEther("3.5"))
    })

    it('should update report the correct number staked', async() => {
        await staker.endInitPeriod();
        expect(await memberships.balanceOf(alice.address, VIPID)).to.eq(2);

        await expect(staker.connect(alice).stake(1))
            .to.emit(staker, "MembershipStaked").withArgs(alice.address, 1);
        
        expect(await staker.amountStaked(alice.address)).to.eq(1);
        expect(await memberships.balanceOf(alice.address, VIPID)).to.eq(1);
        expect(await staker.totalStaked()).to.eq(1);

        await expect(staker.connect(alice).stake(1))
            .to.emit(staker, "MembershipStaked").withArgs(alice.address, 2);

        expect(await staker.amountStaked(alice.address)).to.eq(2);
        expect(await memberships.balanceOf(alice.address, VIPID)).to.eq(0);
        expect(await staker.totalStaked()).to.eq(2);
    });

    it('should not let user unstake more than staked', async () => {
        await staker.endInitPeriod();
        expect(await memberships.balanceOf(bob.address, VIPID)).to.eq(1);
        await staker.connect(bob).stake(1);
        await expect(staker.connect(bob).unstake(2))
            .to.revertedWith('invalid amount');
       await expect(staker.connect(bob).unstake(1))
            .to.emit(staker, "MembershipUnstaked").withArgs(bob.address, 0);     
    });

    it('should report correct amount unstaked', async () => {
        await staker.endInitPeriod();
        expect(await memberships.balanceOf(alice.address, VIPID)).to.eq(2);
        await staker.connect(alice).stake(2)
        expect(await staker.totalStaked()).to.eq(2);
        await expect(staker.connect(alice).unstake(1))
            .to.emit(staker, "MembershipUnstaked").withArgs(alice.address, 1);
        expect(await memberships.balanceOf(alice.address, VIPID)).to.eq(1);
        expect(await staker.amountStaked(alice.address)).to.eq(1);
        expect(await staker.totalStaked()).to.eq(1);
    });

    it('should reject batches', async() => {
        await expect(staker.onERC1155BatchReceived(staker.address, alice.address,[VIPID],[1], empty))
            .to.revertedWith('batches not accepted');
    });  

    it('should reject invalid opperator', async() => {
        await expect(staker.onERC1155Received(alice.address, alice.address, VIPID, 1, empty))
            .to.revertedWith('invalid operator');
    });

    it('should return all stakers and amounts', async() => {
        await staker.endInitPeriod();
        await memberships.connect(cs).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(2);
        await staker.connect(bob).stake(1);
        await staker.connect(cs).stake(10);
        const beforeUnstake = [
            [
                alice.address,
                bob.address,
                cs.address
            ],
            [
                BigNumber.from(2),
                BigNumber.from(1),
                BigNumber.from(10)
            ]
        ]
    
        const result = await staker.currentStaked();

        expect(await staker.currentStaked()).to.eql(beforeUnstake);

        const afterUnstake =[
            [
                alice.address,
                cs.address
            ],
            [
                BigNumber.from(2),
                BigNumber.from(10)
            ]
        ]

        await staker.connect(bob).unstake(1);
        expect(await staker.currentStaked()).to.eql(afterUnstake);
    });
});