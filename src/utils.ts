//@ts-ignore
import { syncSha256Validation } from "sha256-validator-pack";
import {
	createBurnCheckedInstruction,
	createCloseAccountInstruction,
	harvestWithheldTokensToMint,
	getAssociatedTokenAddressSync,
	NATIVE_MINT,
	TOKEN_PROGRAM_ID,
	TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { connection } from "../config";
import {
	Connection,
	PublicKey,
	Keypair,
	TransactionInstruction,
	clusterApiUrl,
  AccountMeta
} from "@solana/web3.js";
import BN from "bn.js";
import { 
	Raydium,
	TxVersion,
	getPdaLaunchpadPoolId,
	Curve,
	PlatformConfig,
	LAUNCHPAD_PROGRAM,
  CpmmRpcData,
  CREATE_CPMM_POOL_AUTH,
  CpmmKeys,
 } from "@raydium-io/raydium-sdk-v2";
import { parseGlobalConfigAccount, parsePoolStateAccount, parsePlatformConfigAccount } from "./clients/encrypt";
import { cluster, SELL_EXACT_IN_DISCRIMINATOR, BUY_EXACT_IN_DISCRIMINATOR, RaydiumLaunchPadAccountKeys, FEE_RATE_DENOMINATOR_VALUE, RAYDIUM_LAUNCHLAB_MAINNET_ADDR, LAUNCHPAD_AUTH_SEED, LAUNCHPAD_POOL_EVENT_AUTH_SEED } from "./clients/constants";
import { BigNumber } from "bignumber.js";
// import { struct } from "./clients/instruction";
// import { u64 } from "./clients/marshmallow";
import { Signer } from "@solana/web3.js";
import { struct } from "./clients/instruction";
import { u64 } from "./clients/marshmallow";

let raydium: Raydium | undefined;

const anchorDataBuf = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  swapBaseInput: [143, 190, 90, 218, 196, 30, 51, 222],
  swapBaseOutput: [55, 217, 98, 86, 163, 74, 180, 173],
  lockCpLiquidity: [216, 157, 29, 78, 38, 51, 31, 26],
  collectCpFee: [8, 30, 51, 199, 209, 184, 247, 133],
};

// async function  getCpmmPoolKeys(poolId: string): Promise<CpmmKeys> {
//   return ((await fetchPoolKeysById({ idList: [poolId] })) as CpmmKeys[])[0];
// }

export const burnAccount = async (wallet: Keypair, keypair: Keypair, connection: Connection, ata: PublicKey, tokenprogram: PublicKey) => {
	const instructions: Array<TransactionInstruction> = [];

	const ataInfo = // @ts-ignore
		(await connection.getParsedAccountInfo(ata)).value?.data.parsed.info;
	console.log("ata info", ataInfo);

	if (tokenprogram === TOKEN_2022_PROGRAM_ID) {
		const sig = await harvestWithheldTokensToMint(connection, keypair, new PublicKey(ataInfo.mint), [ata], undefined, tokenprogram);
	}
	// const solanaBalance = await connection.getBalance(keypair.publicKey);
	// console.log("token amount---------", ataInfo.tokenAmount.uiAmount);
	// console.log("sol balance---------", solanaBalance);

	if (ataInfo.tokenAmount.uiAmount != 0) {
	  const mint = ataInfo.mint;
	  const burnInx = createBurnCheckedInstruction(
	    ata,
	    new PublicKey(mint),
	    keypair.publicKey,
	    ataInfo.tokenAmount.amount,
	    ataInfo.tokenAmount.decimals,
	    [],
	    tokenprogram
	  );
	  instructions.push(burnInx);
	}

	const closeAtaInx = createCloseAccountInstruction(
		ata, // token account which you want to close
		wallet.publicKey, // destination
		keypair.publicKey, // owner of token account
		[],
		tokenprogram
	);
	instructions.push(closeAtaInx);
	return instructions;
	// for (let i = 0; i < instructions.length; i += 20) {
	//   const instructionsList = instructions.slice(
	//     i,
	//     Math.min(i + 20, instructions.length)
	//   );
	//   if (instructionsList.length == 0) break;
	//   const blockhash = await connection
	//     .getLatestBlockhash()
	//     .then((res) => res.blockhash);
	//   const messageV0 = new TransactionMessage({
	//     payerKey: keypair.publicKey,
	//     recentBlockhash: blockhash,
	//     instructions: [
	//       // ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
	//       ...instructionsList,
	//     ],
	//   }).compileToV0Message();

	//   const vtx = new VersionedTransaction(messageV0);
	//   vtx.sign([wallet, keypair]);

	//   const sim = await connection.simulateTransaction(vtx, {
	//     sigVerify: true,
	//   });
	//   console.log(sim);
	//   try {
	//     if (!sim.value.err) {
	//       const sig = await connection.sendTransaction(vtx);
	//       const closeConfirm = await connection.confirmTransaction(sig);
	//       console.log("sig", sig);
	//     } else console.error("simulation error");
	//   } catch (e) {
	//     console.error(e);
	//   }
	// }
};

/**
 * Retrieves the balance of an SPL token associated with a given token account.
 * @param {Connection} connection - The connection object for interacting with the Solana network.
 * @param {PublicKey} tokenAccount - The public key of the token account.
 * @param {PublicKey} payerPubKey - The public key of the payer account.
 * @returns {Promise<number>} The balance of the SPL token.
 * @throws {Error} If no balance is found.
 */
export async function getSPLTokenBalance(connection:Connection, tokenAccount:PublicKey, payerPubKey:PublicKey): Promise<number> {
  const address = getAssociatedTokenAddressSync(tokenAccount, payerPubKey);
  const info = await connection.getTokenAccountBalance(address);
  if (info.value.uiAmount == null) throw new Error("No balance found");
  return info.value.uiAmount;
}

export const initSdk = async (params?: { loadToken?: boolean, keypair: Keypair }) => {
  if (raydium) return raydium
  if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta'))
  console.warn('using free rpc node might cause unexpected error, strongly suggest uses paid rpc node')

  console.log(`connect to rpc ${connection.rpcEndpoint} in ${cluster}`)
  raydium = await Raydium.load({
    owner: params?.keypair,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: 'finalized',
  })
  return raydium
}

export async function getPoolInfo(mint: string) {
  
  const mintA = new PublicKey(mint)
  const mintB = NATIVE_MINT

  const programId = LAUNCHPAD_PROGRAM // devnet: DEV_LAUNCHPAD_PROGRAM

  const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey;
    const poolRawData = await connection.getAccountInfo(poolId);
  if (!poolRawData) {
    return null
  }
  const poolData = parsePoolStateAccount(poolRawData.data);

  return {poolData, poolId}
}

export async function getSwapQuote(baseAmountIn: number, inputMint: string, tokenMint: string, slippage: number = 0): Promise<number> {
    const poolInfo = await getPoolInfo(tokenMint);
    if (!poolInfo?.poolData) {
      throw new Error("Invalid pool!")
    }
    const { virtualBase, virtualQuote, realBase, realQuote, baseDecimals, quoteDecimals, platformConfig, globalConfig } = poolInfo?.poolData;
    const [globalConfigData, platformConfigData] = await connection.getMultipleAccountsInfo([platformConfig, globalConfig])
    if (!globalConfigData || !platformConfigData) throw new Error("Error in getting config info")
      
    const parsedGlobal = parseGlobalConfigAccount(globalConfigData.data)
    const platformConfigParsed = parsePlatformConfigAccount(platformConfigData.data)
    const feeRate = parsedGlobal.tradeFeeRate.plus(platformConfigParsed.feeRate)

    const fee = calculateFee({ amount: BigNumber(baseAmountIn), feeRate });

    let amountOut: number;
    if (inputMint == NATIVE_MINT.toBase58()) {
        amountOut = getAmountOut({
            amountIn: BigNumber(baseAmountIn).minus(fee),
            inputReserve: virtualQuote.plus(realQuote),
            outputReserve: virtualBase.minus(realBase),
        }).toNumber();
        console.log("native out:", amountOut);
        
    } else {
        amountOut = getAmountOut({
            amountIn: BigNumber(baseAmountIn).minus(fee),
            inputReserve: virtualBase.minus(realBase),
            outputReserve: virtualQuote.plus(realQuote),
        }).toNumber()
        console.log("token out:", amountOut);

    }

    return Math.floor(amountOut * (1 - slippage / 100))
}

export async function getSwapInstruction(
  amount: number,
	poolId: PublicKey,
	poolInfo: CpmmRpcData,
	token0: PublicKey,
	token0ATA: PublicKey,
	token1: PublicKey,
	token1ATA: PublicKey,
	buyer: Signer,
	direction: "buy" | "sell"
): Promise<TransactionInstruction | null> {
// ){
  // const amount = await getSwapQuote(amountIn, swapAccountkey.inputMint.toBase58(), mint.toBase58());
	const rayprogram_id = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
  // const poolKeys = await getCpmmPoolKeys(poolId.toBase58());
	const authority = CREATE_CPMM_POOL_AUTH;

	// Based on direction, pick input vs output
	const inputTokenAccount = direction === "buy" ? token0ATA : token1ATA;
	const outputTokenAccount = direction === "sell" ? token0ATA : token1ATA;
	const inputTokenMint = direction === "buy" ? token0 : token1;
	const outputTokenMint = direction === "sell" ? token0 : token1;

	// Identify the correct vaults and mint programs
	const inputVault = poolInfo.mintA.equals(inputTokenMint) ? poolInfo.vaultA : poolInfo.vaultB;
	const outputVault = poolInfo.mintA.equals(outputTokenMint) ? poolInfo.vaultA : poolInfo.vaultB;

	const inputTokenProgram = poolInfo.mintA.equals(inputTokenMint) ? poolInfo.mintProgramA : poolInfo.mintProgramB;
	const outputTokenProgram = poolInfo.mintA.equals(outputTokenMint) ? poolInfo.mintProgramA : poolInfo.mintProgramB;
	const observationState = poolInfo.observationId;
  
  let txInstruction
   = buyExactInIx(
    rayprogram_id,
    buyer.publicKey,
    authority, // new PublicKey(poolKeys.authority),
    poolInfo.configId, // new PublicKey(poolKeys.config.id),
    poolId,
    inputTokenAccount,
    outputTokenAccount,
    inputVault,
    outputVault,
    inputTokenProgram,
    outputTokenProgram,
    inputTokenMint,
    outputTokenMint,
    observationState,
    new BN(amount),
    new BN(0)
  );

  return txInstruction
}

export function buyExactInIx(
  programId: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  configId: PublicKey,
  poolId: PublicKey,
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  observationId: PublicKey,

  amountIn: BN,
  amounOutMin: BN,
): TransactionInstruction {

  const dataLayout = struct([u64("amountIn"), u64("amounOutMin")]);

  const keys: Array<AccountMeta> = [
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userInputAccount, isSigner: false, isWritable: true },
    { pubkey: userOutputAccount, isSigner: false, isWritable: true },
    { pubkey: inputVault, isSigner: false, isWritable: true },
    { pubkey: outputVault, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountIn,
      amounOutMin,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.swapBaseInput, ...data]),
  });
}

export function sellExactInIx(
  programId: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  configId: PublicKey,
  poolId: PublicKey,
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  observationId: PublicKey,

  amountInMax: BN,
  amountOut: BN,
): TransactionInstruction {
  const dataLayout = struct([u64("amountInMax"), u64("amountOut")]);

  const keys: Array<AccountMeta> = [
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userInputAccount, isSigner: false, isWritable: true },
    { pubkey: userOutputAccount, isSigner: false, isWritable: true },
    { pubkey: inputVault, isSigner: false, isWritable: true },
    { pubkey: outputVault, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountInMax,
      amountOut,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.swapBaseOutput, ...data]),
  });
}

export function calculateFee({ amount, feeRate }: { amount: BigNumber; feeRate: BigNumber }): BigNumber {
    return ceilDiv(amount, feeRate, FEE_RATE_DENOMINATOR_VALUE);
}

export function ceilDiv(
    tokenAmount: BigNumber,
    feeNumerator: BigNumber,
    feeDenominator: BigNumber
): BigNumber {
    return tokenAmount
        .multipliedBy(feeNumerator)
        .plus(feeDenominator)
        .minus(1)
        .dividedToIntegerBy(feeDenominator);
}

export function getAmountOut({
    amountIn,
    inputReserve,
    outputReserve,
}: {
    amountIn: BigNumber;
    inputReserve: BigNumber;
    outputReserve: BigNumber;
}): BigNumber {
    const numerator = amountIn.times(outputReserve);
    const denominator = inputReserve.plus(amountIn);
    const amountOut = numerator.div(denominator);
    return amountOut;
}

export function isValidTwoNumberInput(input: string): [number, number] | null {
  const regex = /^\d*\.?\d+\s\d*\.?\d+$/;
  if (!regex.test(input)) return null;

  const [firstStr, secondStr] = input.trim().split(" ");
  const first = Number(firstStr);
  const second = Number(secondStr);

  if (first > 0 && second > 0) {
    return [first, second];
  }

  return null;
}

export function isPositiveInteger(input: string): boolean {
  const num = Number(input);

  // Check if it's a number, an integer, and greater than 0
  return Number.isInteger(num) && num > 0;
}

export async function checkMintKey(input: string) {
  try {
    const isValid = syncSha256Validation({ address: input, onCurve: true });
    
    const pubkey = new PublicKey(input);
    return PublicKey.isOnCurve(pubkey.toBytes()) && isValid;
  } catch {
    return false;
  }
}