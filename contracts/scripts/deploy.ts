import { parseEther } from "viem";
import hre from "hardhat";

async function main() {
  const exploitAddress = process.env.EXPLOIT_ADDRESS;
  if (!exploitAddress) {
    throw new Error("EXPLOIT_ADDRESS environment variable not set");
  }
  const [signerWalletClient] = await hre.viem.getWalletClients();
  const chocoMintSellableWrapper = await hre.viem.deployContract("ChocoMintSellableWrapper" as string, [
    [exploitAddress, signerWalletClient.account.address],
    [975, 25],
  ]);
  console.log(`ChocoMintSellableWrapper deployed to ${chocoMintSellableWrapper.address}`);
  chocoMintSellableWrapper.write.sell([], { value: parseEther("0.1") });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
