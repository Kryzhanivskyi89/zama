
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const result = await deploy("SecretWeightGuess", {
    from: deployer,
    args: [],
    log: true
  });

  log("SECRET WEIGHT GUESS DEPLOYED AT:", result.address);
};

export default func;
func.tags = ["SecretWeightGuess"];
