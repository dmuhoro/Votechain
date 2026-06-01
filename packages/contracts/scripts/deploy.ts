import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const relayerAddress = process.env.RELAYER_ADDRESS || deployer.address; // Use deployer as relayer if not specified
  console.log("Using relayer address:", relayerAddress);

  const VoteChain = await ethers.getContractFactory("VoteChain");
  const voteChain = await VoteChain.deploy(relayerAddress);

  await voteChain.waitForDeployment();

  const contractAddress = await voteChain.getAddress();
  console.log("VoteChain deployed to:", contractAddress);

  // Save deployment artifacts
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const network = ethers.network.name;
  const deploymentPath = path.join(deploymentsDir, `${network}.json`);

  const deploymentInfo = {
    contractAddress: contractAddress,
    deployer: deployer.address,
    relayer: relayerAddress,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);

  // Optionally verify on Etherscan
  if (process.env.ETHERSCAN_API_KEY && network !== "hardhat" && network !== "localhost") {
    console.log("Verifying contract on Etherscan...");
    try {
      await voteChain.deploymentTransaction()?.wait(5); // Wait for 5 blocks to ensure propagation
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [relayerAddress],
      });
      console.log("Contract verified successfully!");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
