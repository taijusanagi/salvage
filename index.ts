// https://github.com/flashbots/searcher-sponsored-tx/tree/main

import "dotenv/config";

import { ethers } from "ethers";
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from "@flashbots/ethers-provider-bundle";
import { v4 as uuidv4 } from "uuid";

import { abi } from "./abi";

const GWEI = ethers.BigNumber.from(10).pow(9);
const PRIORITY_FEE = GWEI.mul(100);
const BLOCKS_IN_THE_FUTURE = 10;

const main = async () => {
  const chainId = Number(process.env.CHAIN_ID);
  const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL || "";
  const bundleRelayUrl = process.env.BUNDLE_RELAY_URL || "";
  const contractAddress = process.env.CONTRACT_ADDRESS || "";
  const authSignerPrivateKey = process.env.AUTH_SIGNER_PRIVATE_KEY || "";
  const fundingSignerPrivateKey = process.env.FUNDING_SIGNER_PRIVATE_KEY || "";
  const exploitSignerPrivateKey = process.env.EXPLOIT_SIGNER_PRIVATE_KEY || "";
  const recipientAddress = process.env.RECIPIENT_ADDRESS || "";

  if (
    !chainId ||
    !ethereumRpcUrl ||
    !bundleRelayUrl ||
    !contractAddress ||
    !authSignerPrivateKey ||
    !fundingSignerPrivateKey ||
    !exploitSignerPrivateKey ||
    !recipientAddress
  ) {
    throw new Error("Missing required environment variables");
  }

  const provider = new ethers.providers.JsonRpcProvider(ethereumRpcUrl);
  const authSigner = new ethers.Wallet(authSignerPrivateKey);
  const fundingSigner = new ethers.Wallet(fundingSignerPrivateKey);
  const exploitSigner = new ethers.Wallet(exploitSignerPrivateKey);

  console.log("chainId", chainId);
  console.log("ethereumRpcUrl", ethereumRpcUrl);
  console.log("bundleRelayUrl", bundleRelayUrl);
  console.log("contractAddress", contractAddress);
  console.log("authSigner.address", authSigner.address);
  console.log("fundingSigner.address", fundingSigner.address);
  console.log("exploitSigner.address", exploitSigner.address);
  console.log("recipientAddress", recipientAddress);

  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, bundleRelayUrl);
  const userStats = flashbotsProvider.getUserStatsV2();

  const contract = new ethers.Contract(contractAddress, abi, provider);
  const balance = await provider.getBalance(contract.address);
  const totalReleased = await contract.totalReleased();
  const totalReceived = balance.add(totalReleased);
  const totalShares = await contract.totalShares();
  const exploitSignerShare = await contract.shares(exploitSigner.address);
  const exploitSignerReleased = await contract.released(exploitSigner.address);
  const paymentToExploitSigner = totalReceived.mul(exploitSignerShare).div(totalShares).sub(exploitSignerReleased);
  console.log("balance", balance.toString());
  console.log("totalReleased", totalReleased.toString());
  console.log("totalReceived", totalReceived.toString());
  console.log("totalShares", totalShares.toString());
  console.log("exploitSignerShare", exploitSignerShare.toString());
  console.log("exploitSignerReleased", exploitSignerReleased.toString());
  console.log("payment", paymentToExploitSigner.toString());

  const releaseTxdata = contract.interface.encodeFunctionData("release", [exploitSigner.address]);
  const gasLimit = await provider.estimateGas({ to: contract.address, data: releaseTxdata });
  console.log("gasLimit", gasLimit.toString());
  // return;
  // provider.on("block", async (blockNumber) => {

  // return;

  const run = async () => {
    console.log("run");
    const block = await provider.getBlock("latest");
    console.log("block.number", block.number);

    const replacementUuid = uuidv4();
    console.log("replacementUuid", replacementUuid);

    if (!block.baseFeePerGas) {
      throw new Error("Failed to get block base fee per gas");
    }
    console.log("block.baseFeePerGas", block.baseFeePerGas.toString());
    const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(
      block.baseFeePerGas,
      BLOCKS_IN_THE_FUTURE
    );
    console.log("maxBaseFeeInFutureBlock", maxBaseFeeInFutureBlock.toString());

    const maxFeePerGas = PRIORITY_FEE.add(maxBaseFeeInFutureBlock);
    console.log("maxFeePerGas", maxFeePerGas.toString());

    const releaseTransaction = {
      to: contract.address,
      type: 2,
      maxPriorityFeePerGas: PRIORITY_FEE,
      maxFeePerGas,
      gasLimit: gasLimit,
      data: releaseTxdata,
      chainId: chainId,
    };
    const fundingGasTransaction = {
      to: exploitSigner.address,
      type: 2,
      maxPriorityFeePerGas: PRIORITY_FEE,
      maxFeePerGas,
      gasLimit: 21000,
      data: "0x",
      value: maxFeePerGas.mul(21000),
      chainId: chainId,
    };
    const rescueTransaction = {
      to: recipientAddress,
      type: 2,
      maxPriorityFeePerGas: PRIORITY_FEE,
      maxFeePerGas,
      gasLimit: 21000,
      data: "0x",
      value: paymentToExploitSigner,
      chainId: chainId,
    };
    const transactions = [
      {
        signer: fundingSigner,
        transaction: releaseTransaction,
      },
      {
        signer: fundingSigner,
        transaction: fundingGasTransaction,
      },
      {
        transaction: rescueTransaction,
        signer: exploitSigner,
      },
    ];

    const signedTransactions = await flashbotsProvider.signBundle(transactions);
    const targetBlock = block.number + BLOCKS_IN_THE_FUTURE;
    const simulation = await flashbotsProvider.simulate(signedTransactions, targetBlock);
    if ("error" in simulation) {
      console.warn(`Simulation Error: ${simulation.error.message}`);
      process.exit(1);
    } else {
      console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`);
    }

    // return;

    const bundleSubmission = await flashbotsProvider.sendRawBundle(signedTransactions, targetBlock, {
      replacementUuid,
    });
    if ("error" in bundleSubmission) {
      throw new Error(bundleSubmission.error.message);
    }
    console.log("bundle submitted, waiting");
    const waitResponse = await bundleSubmission.wait();
    console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`);
    if (
      waitResponse === FlashbotsBundleResolution.BundleIncluded ||
      waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh
    ) {
      process.exit(0);
    } else {
    }
    console.log({
      bundleStatsV2: await flashbotsProvider.getBundleStatsV2(simulation.bundleHash, targetBlock),
      userStats: await userStats,
    });
    console.log("start over");
    run();
  };
  run();
  // });
};
main();
