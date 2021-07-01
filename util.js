const abiDecoder = require('abi-decoder');
const ethers = require("ethers");
const TX_ABI = require('./json/transactionABI.json');
const ERC_20_ABI = require('./erc20ABI.json');

abiDecoder.addABI(TX_ABI);

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

const loadNetworkConfig = (config, networkConfig) => {
  const routerName = config.routerName;
  const conf = networkConfig[routerName];
  if (conf) {
    return conf;
  }
  throw new Error(`Unable to load network config with router name ${routerName} !`);
};

const getSwapInformationByTxHash = async (provider, account, receipt) => {
  const decodedLogs = abiDecoder.decodeLogs(receipt.logs);

  const transferEvents = decodedLogs.filter(log => log.name === 'Transfer');

  let result = undefined;

  if (transferEvents.length > 0) {

    const firstTransfer = transferEvents[0];
    const lastTransfer = transferEvents[transferEvents.length - 1];

    const firstTransferContract = new ethers.Contract(firstTransfer.address, ERC_20_ABI, account);
    const firstTransferTokenSymbol = await firstTransferContract.symbol();
    const firstTransferTokenName = await firstTransferContract.name();

    const lastTransferContract = new ethers.Contract(lastTransfer.address, ERC_20_ABI, account);
    const lastTransferTokenSymbol = await lastTransferContract.methods.symbol().call();
    const lastTransferTokenName = await lastTransferContract.methods.name().call();

    const amountInGwei = firstTransfer.events.filter(ev => ev.name === 'value').map(ev => ev.value)[0];

    const amountOutGwei = lastTransfer.events.filter(ev => ev.name === 'value').map(ev => ev.value)[0]

    const amountIn = ethers.utils.formatEther(amountInGwei);
    const amountOut = ethers.utils.formatEther(amountOutGwei);

    result = {
      in : {
        symbol: firstTransferTokenSymbol,
        name: firstTransferTokenName,
        address: firstTransfer.address,
        amount: parseFloat(amountIn)
      },
      out : {
        symbol: lastTransferTokenSymbol,
        name: lastTransferTokenName,
        address: lastTransfer.address,
        amount: parseFloat(amountOut)
      }
    };
  }
  return result;
};

exports.approveContract = approveContract;
exports.getTokenInformation = getTokenInformation;
exports.displayTokenInformation = displayTokenInformation;
exports.loadNetworkConfig = loadNetworkConfig;
exports.getSwapInformationByTxHash = getSwapInformationByTxHash;
