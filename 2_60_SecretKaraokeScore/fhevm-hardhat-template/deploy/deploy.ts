
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const result = await deploy("SecretKaraokeScore", {
    from: deployer,
    args: [],
    log: true
  });

  log("SecretKaraokeScore DEPLOYED AT:", result.address);
};

export default func;
func.tags = ["SecretKaraokeScore"];
