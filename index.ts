// https://github.com/flashbots/searcher-sponsored-tx/tree/main

import "dotenv/config";

import { ethers } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";

import { checkSimulation, gasPriceToGwei, printTransactions } from "./utils";

const BLOCKS_IN_FUTURE = 2;
const GWEI = ethers.BigNumber.from(10).pow(9);
const PRIORITY_GAS_PRICE = GWEI.mul(31);

const main = async () => {
  const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL || "";
  const bundleRelayUrl = process.env.BUNDLE_RELAY_URL || "";
  const authSignerPrivateKey = process.env.AUTH_SIGNER_PRIVATE_KEY || "";
  const fundingSignerPrivateKey = process.env.FUNDING_SIGNER_PRIVATE_KEY || "";
  const exploitSignerPrivateKey = process.env.EXPLOIT_SIGNER_PRIVATE_KEY || "";
  const recipientAddress = process.env.RECIPIENT_ADDRESS || "";

  if (
    !ethereumRpcUrl ||
    !bundleRelayUrl ||
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

  console.log("ethereumRpcUrl", ethereumRpcUrl);
  console.log("bundleRelayUrl", bundleRelayUrl);
  console.log("authSigner.address", authSigner.address);
  console.log("fundingSigner.address", fundingSigner.address);
  console.log("exploitSigner.address", exploitSigner.address);
  console.log("recipientAddress", recipientAddress);

  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, bundleRelayUrl);
  const block = await provider.getBlock("latest");
  console.log("block.number", block.number);
  const gasPrice = PRIORITY_GAS_PRICE.add(block.baseFeePerGas || 0);
  console.log("gasPrice", gasPrice.toString());
  const bundleTransactions = [
    {
      transaction: {
        to: exploitSigner.address,
        gasPrice: gasPrice,
        // value: ethers.BigNumber.from(21000).mul(gasPrice).add(ethers.utils.parseEther("0.01")),
        value: 0,
        gasLimit: 21000,
      },
      signer: fundingSigner,
    },
    // {
    //   transaction: {
    //     to: recipientAddress,
    //     value: ethers.utils.parseEther("0.01"),
    //     gasPrice: gasPrice,
    //     gasLimit: 21000,
    //   },
    //   signer: exploitSigner,
    // },
  ];

  const signedBundle = await flashbotsProvider.signBundle(bundleTransactions);
  await printTransactions(bundleTransactions, signedBundle);
  const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);
  console.log(`Simulated Gas Price: ${gasPriceToGwei(simulatedGasPrice)} gwei`);
};
main();
