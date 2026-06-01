import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { VoteChain } from "../typechain-types";

describe("VoteChain", function () {
  let voteChain: VoteChain;
  let owner: SignerWithAddress;
  let relayer: SignerWithAddress;
  let voter: SignerWithAddress; // Represents a voter, though votes are cast by relayer
  let nonRelayer: SignerWithAddress;

  const ELECTION_TITLE = "General Election 2026";
  const ELECTION_DESCRIPTION = "Vote for your preferred candidates in the general election.";
  const CANDIDATE_NAMES = ["Alice", "Bob", "Charlie"];
  const CANDIDATE_PARTIES = ["Party A", "Party B", "Party C"];
  let startTime: number;
  let endTime: number;

  beforeEach(async function () {
    [owner, relayer, voter, nonRelayer] = await ethers.getSigners();

    const VoteChainFactory = await ethers.getContractFactory("VoteChain");
    voteChain = await VoteChainFactory.deploy(relayer.address);
    await voteChain.waitForDeployment();

    // Set start and end times for elections
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    startTime = block!.timestamp + 100; // Starts in 100 seconds
    endTime = startTime + 3600; // Ends 1 hour after start
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await voteChain.owner()).to.equal(owner.address);
    });

    it("Should set the right relayer", async function () {
      expect(await voteChain.relayer()).to.equal(relayer.address);
    });

    it("Should have electionCount as 0 initially", async function () {
      expect(await voteChain.electionCount()).to.equal(0);
    });
  });

  describe("Election Creation", function () {
    it("Should allow owner to create an election", async function () {
      await expect(voteChain.connect(owner).createElection(
        ELECTION_TITLE,
        ELECTION_DESCRIPTION,
        CANDIDATE_NAMES,
        CANDIDATE_PARTIES,
        startTime,
        endTime
      )).to.emit(voteChain, "ElectionCreated").withArgs(1, ELECTION_TITLE, owner.address);

      expect(await voteChain.electionCount()).to.equal(1);
      const election = await voteChain.elections(1);
      expect(election.title).to.equal(ELECTION_TITLE);
      expect(election.creator).to.equal(owner.address);
      expect(election.isActive).to.be.true;
      expect(election.candidateCount).to.equal(CANDIDATE_NAMES.length);
    });

    it("Should not allow non-owner to create an election", async function () {
      await expect(voteChain.connect(nonRelayer).createElection(
        ELECTION_TITLE,
        ELECTION_DESCRIPTION,
        CANDIDATE_NAMES,
        CANDIDATE_PARTIES,
        startTime,
        endTime
      )).to.be.revertedWith("Only owner can call this function");
    });

    it("Should not allow creating election with invalid times", async function () {
      const pastStartTime = startTime - 200; // In the past
      const invalidEndTime = startTime - 10; // Before start time

      await expect(voteChain.connect(owner).createElection(
        ELECTION_TITLE, ELECTION_DESCRIPTION, CANDIDATE_NAMES, CANDIDATE_PARTIES, pastStartTime, endTime
      )).to.be.revertedWith("Start time cannot be in the past");

      await expect(voteChain.connect(owner).createElection(
        ELECTION_TITLE, ELECTION_DESCRIPTION, CANDIDATE_NAMES, CANDIDATE_PARTIES, startTime, invalidEndTime
      )).to.be.revertedWith("End time must be after start time");
    });
  });

  describe("Voting", function () {
    const electionId = 1;
    const candidateId = 1;
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("voterId1" + electionId + "secret"));

    beforeEach(async function () {
      await voteChain.connect(owner).createElection(
        ELECTION_TITLE,
        ELECTION_DESCRIPTION,
        CANDIDATE_NAMES,
        CANDIDATE_PARTIES,
        startTime,
        endTime
      );
      // Fast forward time to make election active
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);
    });

    it("Should allow relayer to cast a vote", async function () {
      await expect(voteChain.connect(relayer).castVote(electionId, candidateId, nullifier))
        .to.emit(voteChain, "VoteCast")
        .withArgs(electionId, candidateId, nullifier);

      const election = await voteChain.elections(electionId);
      const candidate = await election.candidates(candidateId);
      expect(candidate.voteCount).to.equal(1);
      expect(election.nullifiers[nullifier]).to.be.true;
    });

    it("Should reject duplicate nullifier (double vote attempt)", async function () {
      await voteChain.connect(relayer).castVote(electionId, candidateId, nullifier);

      await expect(voteChain.connect(relayer).castVote(electionId, candidateId, nullifier))
        .to.be.revertedWith("Already voted");
    });

    it("Should reject vote from non-relayer wallet", async function () {
      await expect(voteChain.connect(nonRelayer).castVote(electionId, candidateId, nullifier))
        .to.be.revertedWith("Only relayer can call this function");
    });

    it("Should reject vote for invalid candidate ID", async function () {
      const invalidCandidateId = CANDIDATE_NAMES.length + 1;
      await expect(voteChain.connect(relayer).castVote(electionId, invalidCandidateId, nullifier))
        .to.be.revertedWith("Invalid candidate ID");
    });

    it("Should reject vote if election has not started", async function () {
      // Create a new election that hasn't started yet
      const futureStartTime = endTime + 100;
      const futureEndTime = futureStartTime + 3600;
      await voteChain.connect(owner).createElection(
        "Future Election", "Desc", ["X"], ["Y"], futureStartTime, futureEndTime
      );
      const futureElectionId = await voteChain.electionCount();

      await expect(voteChain.connect(relayer).castVote(futureElectionId, 1, nullifier))
        .to.be.revertedWith("Election has not started yet");
    });

    it("Should reject vote if election has ended", async function () {
      // Fast forward time past the election end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(voteChain.connect(relayer).castVote(electionId, candidateId, nullifier))
        .to.be.revertedWith("Election has ended");
    });
  });

  describe("Election Closing", function () {
    const electionId = 1;

    beforeEach(async function () {
      await voteChain.connect(owner).createElection(
        ELECTION_TITLE,
        ELECTION_DESCRIPTION,
        CANDIDATE_NAMES,
        CANDIDATE_PARTIES,
        startTime,
        endTime
      );
      // Fast forward time to make election active
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);
    });

    it("Should allow owner to close an active election", async function () {
      await expect(voteChain.connect(owner).closeElection(electionId))
        .to.emit(voteChain, "ElectionClosed")
        .withArgs(electionId);

      const election = await voteChain.elections(electionId);
      expect(election.isActive).to.be.false;
    });

    it("Should not allow non-owner to close an election", async function () {
      await expect(voteChain.connect(nonRelayer).closeElection(electionId))
        .to.be.revertedWith("Only owner can call this function");
    });

    it("Should not allow closing an already closed election", async function () {
      await voteChain.connect(owner).closeElection(electionId);

      await expect(voteChain.connect(owner).closeElection(electionId))
        .to.be.revertedWith("Election is already closed");
    });

    it("Should reject votes after an election is closed", async function () {
      await voteChain.connect(owner).closeElection(electionId);
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("voterId2" + electionId + "secret"));

      await expect(voteChain.connect(relayer).castVote(electionId, 1, nullifier))
        .to.be.revertedWith("Election is not active");
    });
  });

  describe("Results and Election Details", function () {
    const electionId = 1;
    const candidate1Id = 1;
    const candidate2Id = 2;
    const nullifier1 = ethers.keccak256(ethers.toUtf8Bytes("voter1" + electionId + "secret"));
    const nullifier2 = ethers.keccak256(ethers.toUtf8Bytes("voter2" + electionId + "secret"));
    const nullifier3 = ethers.keccak256(ethers.toUtf8Bytes("voter3" + electionId + "secret"));

    beforeEach(async function () {
      await voteChain.connect(owner).createElection(
        ELECTION_TITLE,
        ELECTION_DESCRIPTION,
        CANDIDATE_NAMES,
        CANDIDATE_PARTIES,
        startTime,
        endTime
      );
      // Fast forward time to make election active
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Cast some votes
      await voteChain.connect(relayer).castVote(electionId, candidate1Id, nullifier1);
      await voteChain.connect(relayer).castVote(electionId, candidate2Id, nullifier2);
      await voteChain.connect(relayer).castVote(electionId, candidate1Id, nullifier3);
    });

    it("Should return correct election details", async function () {
      const [title, description, sTime, eTime, isActive, candidateCount] = await voteChain.getElection(electionId);
      expect(title).to.equal(ELECTION_TITLE);
      expect(description).to.equal(ELECTION_DESCRIPTION);
      expect(sTime).to.equal(startTime);
      expect(eTime).to.equal(endTime);
      expect(isActive).to.be.true;
      expect(candidateCount).to.equal(CANDIDATE_NAMES.length);
    });

    it("Should return correct results", async function () {
      const [names, parties, voteCounts] = await voteChain.getResults(electionId);

      expect(names).to.deep.equal(CANDIDATE_NAMES);
      expect(parties).to.deep.equal(CANDIDATE_PARTIES);
      expect(voteCounts[0]).to.equal(2); // Alice got 2 votes
      expect(voteCounts[1]).to.equal(1); // Bob got 1 vote
      expect(voteCounts[2]).to.equal(0); // Charlie got 0 votes
    });

    it("Should update relayer address", async function () {
      const newRelayerAddress = nonRelayer.address;
      await expect(voteChain.connect(owner).updateRelayer(newRelayerAddress))
        .to.not.be.reverted;
      expect(await voteChain.relayer()).to.equal(newRelayerAddress);
    });

    it("Should not allow non-owner to update relayer address", async function () {
      const newRelayerAddress = nonRelayer.address;
      await expect(voteChain.connect(relayer).updateRelayer(newRelayerAddress))
        .to.be.revertedWith("Only owner can call this function");
    });
  });
});
