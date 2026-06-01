import { ethers } from "ethers";
import { SEPOLIA_RPC_URL, RELAYER_PRIVATE_KEY, CONTRACT_ADDRESS } from "../config";
import VoteChainArtifact from "../../contracts/artifacts/contracts/VoteChain.sol/VoteChain.json";
import pino from "pino";

const logger = pino();

interface SubmitVoteResult {
  txHash: string;
  blockNumber: number;
}

class RelayerService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private nonce: number | undefined;

  constructor() {
    if (!SEPOLIA_RPC_URL || !RELAYER_PRIVATE_KEY || !CONTRACT_ADDRESS) {
      logger.error("Missing environment variables for RelayerService");
      throw new Error("Relayer service environment variables not set.");
    }
    this.provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    this.wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, VoteChainArtifact.abi, this.wallet);
    logger.info(`Relayer initialized with address: ${this.wallet.address}`);
    logger.info(`Interacting with contract at: ${CONTRACT_ADDRESS}`);
  }

  private async getNonce(forceRefresh: boolean = false): Promise<number> {
    if (this.nonce === undefined || forceRefresh) {
      this.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
      logger.debug(`Fetched new nonce: ${this.nonce}`);
    } else {
      this.nonce++;
      logger.debug(`Incremented nonce to: ${this.nonce}`);
    }
    return this.nonce;
  }

  public async submitVote(
    electionId: number,
    candidateId: number,
    nullifier: string
  ): Promise<SubmitVoteResult> {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
      try {
        const currentNonce = await this.getNonce(attempts === 0); // Force refresh on first attempt

        // Estimate gas with a buffer
        const gasLimit = await this.contract.castVote.estimateGas(
          electionId,
          candidateId,
          nullifier,
          { from: this.wallet.address }
        );
        const bufferedGasLimit = gasLimit * BigInt(120) / BigInt(100); // 20% buffer

        const tx = await this.contract.castVote(
          electionId,
          candidateId,
          nullifier,
          {
            nonce: currentNonce,
            gasLimit: bufferedGasLimit,
          }
        );

        logger.info(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait(1); // Wait for 1 block confirmation

        if (!receipt) {
          throw new Error("Transaction receipt not received.");
        }

        logger.info(`Transaction confirmed in block: ${receipt.blockNumber}`);
        return {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        };
      } catch (error: any) {
        attempts++;
        logger.error(`Attempt ${attempts} failed to submit vote: ${error.message}`);

        if (error.code === ethers.EthersError.UNPREDICTABLE_GAS_LIMIT || error.code === ethers.EthersError.REPLACEMENT_UNDERPRICED) {
          // If gas limit is unpredictable or transaction is underpriced, force refresh nonce
          this.nonce = undefined;
        }

        if (attempts >= MAX_ATTEMPTS) {
          logger.error("Max attempts reached for submitting vote.");
          throw error; // Re-throw the last error
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
      }
    }
    throw new Error("Failed to submit vote after multiple attempts.");
  }
}

export const relayerService = new RelayerService();
