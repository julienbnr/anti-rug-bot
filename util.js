const ethers = require("ethers");

const getTokenInformation = async (contract) => {
  const token = {};
  token.name = await contract.name();
  token.symbol = await contract.symbol();
  token.totalSupply = parseInt(ethers.utils.formatEther(await contract.totalSupply()));
  return token;
};

const displayTokenInformation = async (token) => {
  console.log(`Token Name is  : ${token.name}`);
  console.log(`Token Symbol is : ${token.symbol}`);
  console.log(`Total Supply is : ${token.totalSupply}`);
};

const approveContract = async (contract, address) => {
  const tx = await contract.approve(
      address,
      ethers.utils.parseUnits('1000000000000000000000000000', 18),
      {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("5", "gwei")
      }
  );

  const result = await tx.wait();
  console.log(`Contract is now approved ! Your Tx Hash ${result.transactionHash}`);
};

exports.approveContract = approveContract;
exports.getTokenInformation = getTokenInformation;
exports.displayTokenInformation = displayTokenInformation;
