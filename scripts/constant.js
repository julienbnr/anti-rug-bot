
/**
 * The removeLiquidity() functions REGEX
 */

/** removeLiquidityWithPermit */
const RM_LIQUIDITY_1 = new RegExp("^0x2195995c");

/** removeLiquidityETH */
const RM_LIQUIDITY_2 = new RegExp("^0x02751cec");

/** removeLiquidityETHWithPermit */
const RM_LIQUIDITY_3 = new RegExp("^0xded9382a");

/** removeLiquidityETHWithPermitSupportingFeeOnTransferTokens */
const RM_LIQUIDITY_4 = new RegExp("^0x5b0d5984");

/**
 * The mint() functions REGEX
 */

/** mint function with 2 args */
const MINT_1 = new RegExp("^0x4e6ec247");

/** mint function with 1 arg */
const MINT_2 = new RegExp("^0xa0712d68");

/** mint function with 2 args */
const MINT_3 = new RegExp("^0x40c10f19");

exports.RM_LIQUIDITY_1 = RM_LIQUIDITY_1;
exports.RM_LIQUIDITY_2 = RM_LIQUIDITY_2;
exports.RM_LIQUIDITY_3 = RM_LIQUIDITY_3;
exports.RM_LIQUIDITY_4 = RM_LIQUIDITY_4;

exports.MINT_1 = MINT_1;
exports.MINT_2 = MINT_2;
exports.MINT_3 = MINT_3;
