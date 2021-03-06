const env = require("./json/env.json");
const config = require("./json/tradeConfig.json");
const networkConfig = require("./json/networkConfig.json");
const util = require('./scripts/util');
const constant = require('./scripts/constant');

// Network config loaded
const network = util.loadNetworkConfig(config, networkConfig);

const ethers = require("ethers");
const notification = require("./scripts/notification");
const retry = require("async-retry");
Object.assign(process.env, env);

const ROUTER_ABI = new ethers.utils.Interface(require("./json/routerABI.json"));
const ERC20_ABI = new ethers.utils.Interface(require("./json/erc20ABI.json"));
const EXPECTED_PONG_BACK = 30000;
const KEEP_ALIVE_CHECK_INTERVAL = 15000;
const provider = new ethers.providers.WebSocketProvider(network.webSocketNode);

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);
const listenedContract = new ethers.Contract(config.sniffedContractAddress, ERC20_ABI, account);

let tokenInformation = undefined;

const startConnection = () => {
  let pingTimeout = null;
  let keepAliveInterval = null;

  const router = new ethers.Contract(network.routerAddress, ROUTER_ABI, account);

  // Open WS
  provider._websocket.on("open", () => {
    console.log(`${config.owner} load the anti rug bot !`);
    keepAliveInterval = setInterval(() => {
      provider._websocket.ping();
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate();
      }, EXPECTED_PONG_BACK);
    }, KEEP_ALIVE_CHECK_INTERVAL);

    provider.on("pending", async (txHash) => {
      provider.getTransaction(txHash).then(async (tx) => {

        if (tx && tx.to) {

          // if transaction is for the router
          if (tx.to.toLowerCase() === network.routerAddress.toLowerCase()) {

            const isRemoveLiqFromTokens = constant.RM_LIQUIDITY_1.test(tx.data);
            const isRemoveLiqFromETH = constant.RM_LIQUIDITY_2.test(tx.data)
                || constant.RM_LIQUIDITY_3.test(tx.data)
                || constant.RM_LIQUIDITY_4.test(tx.data);

            // if transaction is a specified remove liquidity tx
            if (isRemoveLiqFromTokens || isRemoveLiqFromETH) {

              const decodedInput = ROUTER_ABI.parseTransaction({
                data: tx.data,
                value: tx.value
              });

              let emergencySellContract;
              let outTokenSwap; // token address is at index 0 in tx args

              // We check outTokenSwap at index 0 & 1 because the dev often make mistake by using remove liq function
              // he was wrong about arguments so, there is often a tx failed

              if (isRemoveLiqFromTokens) {
                if (network.principalTokenAddress === decodedInput.args[0] || network.stableCoinAddress === decodedInput.args[0]) {
                  outTokenSwap = decodedInput.args[1];
                  emergencySellContract = decodedInput.args[0];
                } else {
                  outTokenSwap = decodedInput.args[0];
                  emergencySellContract = decodedInput.args[1];
                }
              } else {
                emergencySellContract = network.principalTokenAddress;
                outTokenSwap = decodedInput.args[0];
              }

              // is rm liquidity tx is about sniffed contract token address
              if (config.sniffedContractAddress === outTokenSwap.toLowerCase()) {
                notification.sendWebhook(
                    `${config.owner} : ${tokenInformation ? tokenInformation.name : config.sniffedContractAddress} : Remove Liquidity Tx is detected. Run emergency withdraw ! RemoveLiquidity Tx Hash is ${txHash}`
                );
                util.displayRemoveLiquidityInfoFromTx(tx);
                sellTokens(tx, router, emergencySellContract);
              }
            }
          }

          if (tx.to.toLowerCase() === config.sniffedContractAddress.toLowerCase()) {
            const invokedMintFunctionWithTwoArgs = constant.MINT_1.test(tx.data) || constant.MINT_3.test(tx.data);
            const invokedMintFunctionWithOneArg = constant.MINT_2.test(tx.data);

            if (invokedMintFunctionWithOneArg || invokedMintFunctionWithTwoArgs) {

              const decodedInput = ERC20_ABI.parseTransaction({
                data: tx.data,
                value: tx.value
              });

              const indexAmountArg = invokedMintFunctionWithOneArg ? 0 : 1;
              const amountMinted = parseInt(
                  ethers.utils.formatEther(
                      ethers.utils.parseUnits(
                          String(
                              decodedInput.args[indexAmountArg]
                          )
                      )
                  )
              );

              notification.sendWebhook(
                  `${config.owner} : ${tokenInformation ? tokenInformation.name : config.sniffedContractAddress} : Mint Tx is detected. Run emergency withdraw ! Mint Tx Hash is ${txHash}`
              );

              util.displayMintFunctionInfoFromTx(tx, tokenInformation, amountMinted);
              sellTokens(tx, router, network.stableCoinAddress);
            }
          }
        }
      });
    })
  });

  // Close WS
  provider._websocket.on("close", () => {
    console.log("WebSocket Closed...Reconnecting...");
    clearInterval(keepAliveInterval);
    clearTimeout(pingTimeout);
    startConnection();
  });

  // Error WS
  provider._websocket.on("error", () => {
    console.log("Error. Attempting to Reconnect...");
    clearInterval(keepAliveInterval);
    clearTimeout(pingTimeout);
    startConnection();
  });

  // Ping WS
  provider._websocket.on("pong", () => {
    clearInterval(pingTimeout);
  });
};

const sellTokens = async (tx, router, emergencySellContractAddress) => {
  const sellTx = await retry(
      async () => {
        const balance = await listenedContract.balanceOf(wallet.address);
        const path = [
          config.sniffedContractAddress,
          emergencySellContractAddress
        ];

        return await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            String(balance),
            String(0),
            path,
            process.env.RECIPIENT,
            Math.floor(Date.now() / 1000) + config.txSecondsDelay,
            {
              gasLimit: tx.gasLimit,
              gasPrice: tx.gasPrice * 2
            }
        );
      },

      {
        retries: 5,
        minTimeout: 10000,
        maxTimeout: 15000,
        onRetry: (err, number) => {
          console.log("Emergency sell Failed - Retrying", number);
          console.log("Error", err);
          if (number === 3) {
            console.log("3 tentatives failed... Close !");
            process.exit();
          }
        },
      }
  );

  console.log('Waiting for tx receipt...');
  const receipt = await sellTx.wait();
  const txHash = receipt.transactionHash;
  console.log('Sell complete !');
  console.log(`Your Tx hash : ${txHash}`);

  await notification.sendWebhook(
      `${config.owner} : ${tokenInformation ? tokenInformation.name : config.sniffedContractAddress} : Emergency withdraw complete ! Your Tx hash ${txHash}`
  );

  const swapDetails = await util.getSwapInformationByTxHash(provider, account, receipt);

  const swapMessage = `Congragulations ! You swap ${swapDetails.in.amount} ${swapDetails.in.symbol} for ${swapDetails.out.amount} ${swapDetails.out.symbol} !`;
  console.log(swapMessage);

  await notification.sendWebhook(swapMessage);

  process.exit();
};

// Load token information
util.getTokenInformation(listenedContract)
.then(info => {
  tokenInformation = info;
  util.displayTokenInformation(info);
  console.log(`Listen ${tokenInformation.symbol} transactions on router ${network.routerLabel}`);
  console.log(`Listen blockchain transactions with WSS node : ${network.webSocketNode}`);
});

if (config.approveContract) {
  console.log(`Approving the contract ${config.sniffedContractAddress} to trade on ${network.routerLabel}`);
  util.approveContract(listenedContract, network.routerAddress);
}

// Start the anti rug bot
startConnection();
