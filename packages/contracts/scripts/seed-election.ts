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
  const candidates = [
    { name: "Candidate A", party: "Party Alpha" },
    { name: "Candidate B", party: "Party Beta" },
    { name: "Candidate C", party: "Party Gamma" },
  ];
  const duration = 60 * 60 * 24 * 7; // 1 week

  const tx = await voteChain.createElection(
    title,
    description,
    candidates,
    duration
  );

  await tx.wait();
  console.log("Election created successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
