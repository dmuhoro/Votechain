import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const voteChainAddress = process.env.CONTRACT_ADDRESS;

  if (!voteChainAddress) {
    throw new Error("CONTRACT_ADDRESS not set in environment");
  }

  const voteChain = await ethers.getContractAt("VoteChain", voteChainAddress);

  console.log("Seeding an election...");

  const title = "General Election 2027 - Presidential";
  const description = "The 2027 Kenyan General Election for the office of the President.";
  const candidateNames = ["Candidate A", "Candidate B", "Candidate C"];
  const candidateParties = ["Party Alpha", "Party Beta", "Party Gamma"];

  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  if (!block) {
    throw new Error("Could not read current block");
  }

  const startTime = block.timestamp + 60;
  const endTime = startTime + 60 * 60 * 24 * 7; // 1 week

  const tx = await voteChain.createElection(
    title,
    description,
    candidateNames,
    candidateParties,
    startTime,
    endTime
  );

  await tx.wait();
  console.log("Election created successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
