const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");


describe("MembershipStaker", () => {

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

        staker = await upgrades.deployProxy(stakerFactory, [memberships.address], {
            kind : "uups"
        });
        
        await staker.deployed();

    })

    it('init to zero', async() => {
        expect(await staker.totalStaked()).to.eq(0);
    })

    it('should add rewards to the current pool when funding', async () => {
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
          });

        expect(await staker.poolBalance()).to.eq(ethers.utils.parseEther("1.0"));
        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(1);

        await staker.connect(owner).endInitPeriod();
        expect(await staker.poolBalance()).to.eq(ethers.utils.parseEther("1.0"));
        expect(await ethers.provider.getBalance(staker.curPool())).to.eq(ethers.utils.parseEther("1.0"));
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("2.0"), // Sends exactly 2.0 ether
          });

        expect(await ethers.provider.getBalance(staker.curPool())).to.eq(ethers.utils.parseEther("3.0"));
    });

    it('should release the rewards after epoch time', async () => {
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("3.0"), // Sends exactly 3.0 ether
          });

        expect(await staker.poolBalance()).to.eq(ethers.utils.parseEther("3.0"));
        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(2);
        await memberships.connect(bob).setApprovalForAll(staker.address, true);
        await staker.connect(bob).stake(1);

        await staker.connect(owner).endInitPeriod();
        
        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();
        
        // release rewards for alie and bob
        await expect(await staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));
        expect(await ethers.provider.getBalance(staker.completedPool())).to.eq(ethers.utils.parseEther("1.0"));
        await expect(await staker.harvest(bob.address)).to.changeEtherBalance(bob, ethers.utils.parseEther("1.0"));
        expect(await staker.poolBalance()).to.eq(0);

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();

        await expect(staker.harvest(bob.address)).to.be.reverted;
    });

    it('should not release the rewards while initial period and epoch time', async () => {
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("2.0"), // Sends exactly 3.0 ether
          });

        expect(await staker.poolBalance()).to.eq(ethers.utils.parseEther("2.0"));
        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(1);
        await memberships.connect(bob).setApprovalForAll(staker.address, true);
        await staker.connect(bob).stake(1);
        
        // not release while initial period
        await expect(() => staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("0"));

        await staker.connect(owner).endInitPeriod();
        // not release before epoch time
        await expect(() => staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("0"));

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();
        await expect(() => staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("1.0"));
    });

    it('should forward unclaimed reward to the next rewardpool', async () => {
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("3.0"), // Sends exactly 3.0 ether
          });

        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(2);
        await memberships.connect(bob).setApprovalForAll(staker.address, true);
        await staker.connect(bob).stake(1);

        await staker.connect(owner).endInitPeriod();

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();
        
        // release reward for bob
        await expect(await staker.harvest(bob.address)).to.changeEtherBalance(bob, ethers.utils.parseEther("1.0"));
        expect(await staker.poolBalance()).to.eq(0);
        expect(await ethers.provider.getBalance(staker.completedPool())).to.eq(ethers.utils.parseEther("2.0"));

        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("3.0"), // Sends exactly 3.0 ether
          });
        
        expect(await staker.poolBalance()).to.eq(ethers.utils.parseEther("3.0"));
        expect(await ethers.provider.getBalance(staker.completedPool())).to.eq(ethers.utils.parseEther("2.0"));

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();
        // unclaimed 2.0ETH forwarded
        expect(await staker.poolBalance()).to.eq(ethers.utils.parseEther("2.0"));
        expect(await ethers.provider.getBalance(staker.completedPool())).to.eq(ethers.utils.parseEther("3.0"));

        await expect(() => staker.harvest(alice.address)).to.changeEtherBalance(alice, ethers.utils.parseEther("2.0"));
    });

    it('should add to the next pool when staking', async () => {
        await owner.sendTransaction({
            to: staker.address,
            value: ethers.utils.parseEther("2.0"), // Sends exactly 3.0 ether
          });

        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await staker.connect(alice).stake(1);

        await staker.connect(owner).endInitPeriod();

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();

        await memberships.connect(bob).setApprovalForAll(staker.address, true);
        await staker.connect(bob).stake(1);
        await expect(staker.harvest(bob.address)).to.revertedWith('PaymentSplitter: account has no shares');

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();
        await expect(staker.harvest(bob.address)).to.revertedWith('PaymentSplitter: account has no shares');

        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine"); 
        await staker.updatePool();
        await expect(() => staker.harvest(bob.address)).to.changeEtherBalance(bob, ethers.utils.parseEther("1.0"));
    });

    it('should update report the correct number staked', async() => {
        await memberships.connect(alice).setApprovalForAll(staker.address, true);
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
        await memberships.connect(bob).setApprovalForAll(staker.address, true);
        expect(await memberships.balanceOf(bob.address, VIPID)).to.eq(1);
        await staker.connect(bob).stake(1);
        await expect(staker.connect(bob).unstake(2))
            .to.revertedWith('invalid amount');
       await expect(staker.connect(bob).unstake(1))
            .to.emit(staker, "MembershipUnstaked").withArgs(bob.address, 0);     
    });

    it('should report correct amount unstaked', async () => {
        await memberships.connect(alice).setApprovalForAll(staker.address, true);
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
        await memberships.connect(alice).setApprovalForAll(staker.address, true);
        await memberships.connect(bob).setApprovalForAll(staker.address, true);
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