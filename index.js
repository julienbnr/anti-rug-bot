const env = require("./env.json");
const config = require("./tradeConfig.json");
const networkConfig = require("./networkConfig.json");
const ethers = require("ethers");
const retry = require("async-retry");
Object.assign(process.env, env);

const pcsAbi = new ethers.utils.Interface(require("./routerABI.json"));
const ROUTER_ABI = new ethers.utils.Interface(require("./routerABI.json"));
const ERC20_ABI = new ethers.utils.Interface(require("./erc20ABI.json"));
const EXPECTED_PONG_BACK = 30000;
const KEEP_ALIVE_CHECK_INTERVAL = 15000;
const provider = new ethers.providers.WebSocketProvider(
    process.env.BSC_NODE_WSS
);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);
const listenedContract = new ethers.Contract(config.sniffedContractAddress, ERC20_ABI, account);

// Todo we've to find other method ids
const re1 = new RegExp("^0x2195995c"); // removeLiquidityWithPermit method id
const re2 = new RegExp("^0x02751cec"); // removeLiquidityETH
const re3 = new RegExp("^0xded9382a"); // removeLiquidityETHWithPermit

// Mint function
const mintFunctionRgx = new RegExp("^0x4e6ec247");

const displayRemoveLiquidityInfoFromTx = (txResponse) => {
  const now = new Date();
  console.log(`#######################################################`);
  console.log(`A new RemoveLiquidity transaction was found at ${now}`);
  console.log(`Transaction hash is ${txResponse.hash}`);
  console.log(`Transaction Gas limit : ${txResponse.gasLimit}`);
  console.log(`Transaction Gas price : ${txResponse.gasPrice}`);
  console.log(`#######################################################`);
  console.log('\n');
};

const displayMintFunctionInfoFromTx = (txResponse, mintAmount) => {
  const now = new Date();
  console.log(`#######################################################`);
  console.log(`A new mint transaction was found at ${now}`);
  console.log(`Total amount minted is ${mintAmount}`);
  console.log(`Transaction hash is ${txResponse.hash}`);
  console.log(`Transaction Gas limit : ${txResponse.gasLimit}`);
  console.log(`Transaction Gas price : ${txResponse.gasPrice}`);
  console.log(`#######################################################`);
  console.log('\n');
};

const loadNetworkConfig = () => {
  const routerName = config.routerName;
  const conf = networkConfig[routerName];
  if (conf) {
    return conf;
  }
  throw new Error(`Unable to load network config with router name ${routerName} !`);
}

const startConnection = () => {
  let pingTimeout = null;
  let keepAliveInterval = null;

  const router = new ethers.Contract(network.routerAddress, ROUTER_ABI, account);

  // Open WS
  provider._websocket.on("open", () => {
    console.log("Anti rug bot has begun...\n");
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

            const isRemoveLiqFromTokens = re1.test(tx.data);
            const isRemoveLiqFromETH = re2.test(tx.data) || re3.test(tx.data);

            // if transaction is a specified remove liquidity tx
            if (isRemoveLiqFromTokens || isRemoveLiqFromETH) {

              const decodedInput = pcsAbi.parseTransaction({
                data: tx.data,
                value: tx.value
              });

              let emergencySellContract;

              if (isRemoveLiqFromTokens) {
                emergencySellContract = decodedInput.args[1]; // should be stable coin address
              } else {
                emergencySellContract = network.principalTokenAddress;
              }
              // token address is at index 0 in tx args
              const outTokenSwap = decodedInput.args[0];

              // is rm liquidity tx is about sniffed contract token address
              if (outTokenSwap.toLowerCase() === config.sniffedContractAddress) {
                displayRemoveLiquidityInfoFromTx(tx);
                sellTokens(tx, router, emergencySellContract);
              }
            }
          }

          if (tx.to.toLowerCase() === config.sniffedContractAddress.toLowerCase()) {

            // If mint() function is invoked
            if (mintFunctionRgx) {

              const decodedInput = pcsAbi.parseTransaction({
                data: tx.data,
                value: tx.value
              });

              const amountMinted = parseInt(
                  ethers.utils.formatEther(decodedInput.args[1])
              );

              // if the dev minted more than 50% of the circulating supply
              const mintSellTriggerAmount = config.initialSupplyInEther * 0.5;
              if (amountMinted > mintSellTriggerAmount) {
                displayMintFunctionInfoFromTx(tx, mintSellTriggerAmount);
                sellTokens(tx, router, network.stableCoinAddress);
              }
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
    console.log("Error. Attemptiing to Reconnect...");
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
  const receipt = sellTx.wait();
  console.log('Sell complete !');
  console.log("Your txHash: " + receipt.transactionHash);
};

// Network config loaded
const network = loadNetworkConfig();
startConnection();
