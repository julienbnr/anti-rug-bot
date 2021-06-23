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

exports.getTokenInformation = getTokenInformation;
exports.displayTokenInformation = displayTokenInformation;
