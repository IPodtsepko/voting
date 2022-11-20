const { expect } = require("chai");

const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VotingToken contract", function () {
    let Status = {
        Discarded: 0,
        Accepted: 1,
        Rejected: 2,
        Indefinite: 3,
    }

    async function deployTokenFixture() {
        const Token = await ethers.getContractFactory("VotingToken");
        const [owner, addr1, addr2] = await ethers.getSigners();

        const hardhatToken = await Token.deploy();

        await hardhatToken.deployed();

        return { Token, hardhatToken, owner, addr1, addr2 };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { hardhatToken, owner } = await loadFixture(deployTokenFixture);
            expect(await hardhatToken.owner()).to.equal(owner.address);
        });

        it("Should assign the total supply of tokens to the owner", async function () {
            const { hardhatToken, owner } = await loadFixture(deployTokenFixture);
            const ownerBalance = await hardhatToken.balanceOf(owner.address);
            expect(await hardhatToken.totalSupply()).to.equal(ownerBalance);
        });

        it("Shoud have valid totalSupply", async function () {
            const { hardhatToken } = await loadFixture(deployTokenFixture);
            expect(await hardhatToken.totalSupply()).to.equal(100e6);
        });
    });

    describe("Transactions", function () {
        it("Should transfer tokens between accounts", async function () {
            const { hardhatToken, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);

            await expect(hardhatToken.transfer(addr1.address, 66 * 10 ** 6))
                .to.changeTokenBalances(hardhatToken, [owner, addr1], [-66 * 10 ** 6, 66 * 10 ** 6]);

            await expect(hardhatToken.connect(addr1).transfer(addr2.address, 33 * 10 ** 6))
                .to.changeTokenBalances(hardhatToken, [addr1, addr2], [-33 * 10 ** 6, 33 * 10 ** 6]);
        });

        it("Should create active proposal and emit 'ProposalCreated' even", async function () {
            const { hardhatToken } = await loadFixture(deployTokenFixture);

            await expect(hardhatToken.propose(123))
                .to.emit(hardhatToken, "ProposalCreated").withArgs(123)

            let activeProposals = (await hardhatToken.activeProposals()).map(hash => Number(hash))
            expect(activeProposals.length).to.equal(1);
            expect(activeProposals[0]).to.equal(123);

            let proposalInfo = await hardhatToken.proposalInfo(123)

            expect(proposalInfo.status).to.equal(Status.Indefinite);

            expect(Number(proposalInfo.total_power_against)).to.equal(0);
            expect(Number(proposalInfo.total_power_for)).to.equal(0);
        });

        it("Must be discarded over time", async function () {
            const { hardhatToken } = await loadFixture(deployTokenFixture);

            await hardhatToken.propose(123)

            let day = 24 * 60 * 60;

            for (let i = 0; i < 3; i++) {
                await time.increase(day);
                expect((await hardhatToken.proposalInfo(123)).status).to.equal(Status.Indefinite);
            }

            await time.increase(1);
            expect((await hardhatToken.proposalInfo(123)).status).to.equal(Status.Discarded);
        });

        it("Up to three proposals must be created", async function () {
            const { hardhatToken } = await loadFixture(deployTokenFixture);

            let day = 24 * 60 * 60;

            for (let i = 0; i < 3; i++) {
                await hardhatToken.propose(i)
            }

            let activeProposals = (await hardhatToken.activeProposals()).map(hash => Number(hash))
            expect(activeProposals.length).to.equal(3);
            expect(activeProposals[0]).to.equal(0);
            expect(activeProposals[1]).to.equal(1);
            expect(activeProposals[2]).to.equal(2);

            await time.increase(3 * day - 2);
            expect((await hardhatToken.proposalInfo(0)).status).to.equal(Status.Indefinite);

            // '0' must be discarded with next transaction.
            await expect(hardhatToken.propose(3))
                .to.emit(hardhatToken, "ProposalDiscarded")
                .withArgs(0);

            activeProposals = (await hardhatToken.activeProposals()).map(hash => Number(hash))
            expect(activeProposals.length).to.equal(3);
            expect(activeProposals[0]).to.equal(3);
            expect(activeProposals[1]).to.equal(1);
            expect(activeProposals[2]).to.equal(2);

            await time.increase(1);
            expect((await hardhatToken.activeProposals()).length).to.equal(2); // '1' discarded

            await time.increase(1);
            expect((await hardhatToken.activeProposals()).length).to.equal(1); // '2' discarded
        });

        it("The creation of proposals should be reverted in case of duplication or if the queue is full",
            async function () {
                const { hardhatToken } = await loadFixture(deployTokenFixture);

                for (let i = 0; i < 3; i++) {
                    await hardhatToken.propose(i)
                    await expect(hardhatToken.propose(i))
                        .to.be.revertedWith("The proposal is already in the queue.");
                }

                for (let i = 0; i < 100; i++) {
                    await expect(hardhatToken.propose(100 + i))
                        .to.be.revertedWith("The limit of active proposals has been reached");
                }
            }
        );


        it("Should react to votes and transfers", async function () {
            const { hardhatToken, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);

            hardhatToken.propose(123);

            await hardhatToken.transfer(addr1.address, 66 * 10 ** 6)
            await hardhatToken.connect(addr1).transfer(addr2.address, 33 * 10 ** 6)

            await expect(hardhatToken.connect(owner).acceptProposal(123))
                .to.emit(hardhatToken, "NewVoteFor").withArgs(owner.address, 123)

            await expect(hardhatToken.connect(addr1).rejectProposal(123))
                .to.emit(hardhatToken, "VotesRatioChanged").withArgs(123, 33e6, 34e6)

            await expect(hardhatToken.connect(addr2).transfer(addr1.address, 16 * 10 ** 6))
                .to.emit(hardhatToken, "VotesRatioChanged").withArgs(123, 49e6, 34e6)

            await expect(hardhatToken.connect(owner).transfer(addr1.address, 1000001))
                .to.emit(hardhatToken, "ProposalRejected").withArgs(123)
        });

        it("The oldest discarded proposal should be ousted", async function () {
            const { hardhatToken } = await loadFixture(deployTokenFixture);

            let day = 24 * 60 * 60;

            // We'll take three slots in the queue
            for (let i = 0; i < 3; i++) {
                await hardhatToken.propose(i)
            }

            await hardhatToken.acceptProposal(0); // owner has 100% tokens => proposal accepted
            await hardhatToken.rejectProposal(2); // owner has 100% tokens => proposal rejected

            // Let's wait until '1' is discarded
            await time.increase(3 * day + 1);

            let proposals = new Set((await hardhatToken.allProposals()).map(hash => Number(hash)));
            expect(proposals.has(0)).true // accepted
            expect(proposals.has(1)).true // discarded
            expect(proposals.has(2)).true // rejected

            await hardhatToken.propose(3);
            await hardhatToken.propose(4);

            proposals = new Set((await hardhatToken.allProposals()).map(hash => Number(hash)));
            expect(proposals.has(1)).true // discarded
            expect(proposals.has(3)).true // indefinite
            expect(proposals.has(4)).true // indefinite

            // Let's wait until '3' and '4' are discarded
            await time.increase(3 * day + 1);

            // '1' should be ousted
            await hardhatToken.propose(5)

            proposals = new Set((await hardhatToken.allProposals()).map(hash => Number(hash)));
            expect(proposals.has(3)).true // discarded
            expect(proposals.has(4)).true // discarded
            expect(proposals.has(5)).true // indefinite

            // Let's wait until '5' is discarded
            await time.increase(3 * day + 1);

            // '3' should be ousted
            await hardhatToken.propose(6)

            proposals = new Set((await hardhatToken.allProposals()).map(hash => Number(hash)));
            expect(proposals.has(4)).true // discarded
            expect(proposals.has(5)).true // discarded
            expect(proposals.has(6)).true // indefinite

            // '4' should be ousted
            await hardhatToken.propose(7)

            proposals = new Set((await hardhatToken.allProposals()).map(hash => Number(hash)));
            expect(proposals.has(5)).true
            expect(proposals.has(6)).true
            expect(proposals.has(7)).true
        });
    });
});
