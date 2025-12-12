
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const result = await deploy("HiddenGradeRelease", {
    from: deployer,
    args: [],
    log: true
  });

  log("HIDDEN GRADE RELEASE DEPLOYED AT:", result.address);
};

export default func;
func.tags = ["HiddenGradeRelease"];
