const env = require("./env.json");
const config = require("./config.json");
const ethers = require("ethers");
const retry = require("async-retry");
Object.assign(process.env, env);

const ROUTER_ABI = new ethers.utils.Interface(require("./routerABI.json"));
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

        if (tx && tx.from) {
          if (tx.from === config.devWalletAddress) {
            console.log(`New transaction from the owner. Tx hash is ${tx.hash}`);
            const re1 = new RegExp("^0x2195995c"); // removeLiquidityWithPermit method id
            const re2 = new RegExp("^0xe8e33700");

            if ((re1.test(tx.data) || re2.test(tx.data))) {
              sellTokens(tx);
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
        const deadline = Date.now() + 1000 * 60 * 5;
        const result = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            String(balance),
            String(0),
            path,
            process.env.RECIPIENT,
            deadline,
            {
              gasLimit: tx.gasLimit,
              gasPrice: ethers.utils.parseUnits("30", "gwei") // avoid this
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

startConnection();
