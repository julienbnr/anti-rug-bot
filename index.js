const env = require("./env.json");
const config = require("./config.json");
const ethers = require("ethers");
const retry = require("async-retry");
Object.assign(process.env, env);

const pcsAbi = new ethers.utils.Interface(require("./routerABI.json"));
const ERC20_ABI = new ethers.utils.Interface(require("./erc20ABI.json"));
const EXPECTED_PONG_BACK = 30000;
const KEEP_ALIVE_CHECK_INTERVAL = 15000;
const provider = new ethers.providers.WebSocketProvider(
    process.env.BSC_NODE_WSS
);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);
const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, account);
const listenedContract = new ethers.Contract(config.sniffedContractAddress, ERC20_ABI, account);

// Todo we've to find other method ids
const re1 = new RegExp("^0x2195995c"); // removeLiquidityWithPermit method id
const re2 = new RegExp("^0x02751cec"); // removeLiquidityETH
const re3 = new RegExp("^0xded9382a"); // removeLiquidityETHWithPermit

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

const startConnection = () => {
  let pingTimeout = null;
  let keepAliveInterval = null;

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

          if (tx.to.toLowerCase() === config.routerAddress.toLowerCase()) {

            const isRemoveLiqFromTokens = re1.test(tx.data);
            const isRemoveLiqFromETH = re2.test(tx.data) || re3.test(tx.data);

            if (isRemoveLiqFromTokens || isRemoveLiqFromETH) {
              displayRemoveLiquidityInfoFromTx(tx);

              const decodedInput = pcsAbi.parseTransaction({
                data: tx.data,
                value: tx.value
              });

              // token address must be at index 1 or 0 in tx args (depends of rm liq from eth or tokens)
              const outTokenSwap = decodedInput.args[isRemoveLiqFromTokens ? 1 : 0];
              if (outTokenSwap.toLowerCase() === config.sniffedContractAddress) {
                sellTokens(tx);
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

const sellTokens = async (tx) => {
  const sellTx = await retry(
      async () => {
        const balance = await listenedContract.balanceOf(wallet.address);
        const path = [
          config.sniffedContractAddress,
          config.emergencyOutputAddress
        ];

        const result = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            String(balance),
            String(0),
            path,
            process.env.RECIPIENT,
            Math.floor(Date.now() / 1000) + config.txSecondsDelay,
            {
              gasLimit: tx.gasLimit,
              gasPrice: tx.gasPrice * 1.2
            }
        );
        console.log(result);
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

startConnection();
