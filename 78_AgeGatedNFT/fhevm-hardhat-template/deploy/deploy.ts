import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const result = await deploy("AgeGatedNFT", {
    from: deployer,
    args: [
      "Age Gated NFT",
      "AGENFТ",
      18,
      deployer
    ],
    log: true
  });

  log("AGE GATED NFT DEPLOYED AT:", result.address);
};

export default func;
func.tags = ["AgeGatedNFT"];