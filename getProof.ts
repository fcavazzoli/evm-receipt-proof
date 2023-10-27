import * as ethers from "ethers"
import { tx, block, receipts } from './tx.json'
import { Trie } from "@ethereumjs/trie"
import { BN, keccak256, toBuffer } from "ethereumjs-util"
import { Tx, Block, Receipts } from "./types"
import { arrayify } from "ethers/lib/utils"
import { Receipt } from "eth-object"


const jsonProvider = new ethers.providers.JsonRpcProvider('https://goerli.infura.io/v3/7615206e95e64f89a13572005701baeb')

const getTransactionReceiptType = (txReceipt) => {
  switch (txReceipt._type) {
    case 'TransactionReceipt':
      return '2';
    default:
      throw new Error('Unknown transaction receipt type');
  }
}

const encodeKey = (index: string) => {
  let indexWithout0x = index.slice(2);
  if (indexWithout0x.length % 2 != 0) indexWithout0x = "0" + indexWithout0x;
  const indexWith0x = "0x" + indexWithout0x;
  return ethers.utils.RLP.encode(indexWith0x);
}

const getHex = (value: string) => {
  let valueWithout0x = value.slice(2);

  return new BN(valueWithout0x, 'hex')
}

const getStatus = (value: string) => {
  let valueWithout0x = value.slice(2);
  if (valueWithout0x.length % 2 != 0) valueWithout0x = "0" + valueWithout0x;
  valueWithout0x = "0x" + valueWithout0x;
  return valueWithout0x;
  
}

const  receiptfromRpc = (rpcResult: Receipts) => {
  let logsData:any[] = rpcResult.logs.map((log) => {
    const logEncoded:any[] = [];
    logEncoded.push(Buffer.from(log.address, 'hex'));
    logEncoded.push(Buffer.from(log.topics, 'hex'));
    logEncoded.push(Buffer.from(log.data, 'hex'));
    return logEncoded;
  });
  if(logsData.length == 0){
    logsData = [[]]
  }

  const logsEncoded = Buffer.from(ethers.utils.RLP.encode(logsData), 'hex')

  return ethers.utils.RLP.encode(new Receipt([
    Buffer.from(getStatus(rpcResult.status), 'hex'),
    getHex(rpcResult.cumulativeGasUsed).toArrayLike(Buffer, 'be'),
    Buffer.from(rpcResult.logsBloom, 'hex'),
    logsEncoded
  ]))
}


export function getReceiptBytes(txReceipt: Receipts) {
  // const txReceipt = await provider.getTransactionReceipt(txData.hash);
  // console.log(txReceipt);

  const txReceiptData: any[] = [];

  const status = getStatus(txReceipt.status);
  txReceiptData.push(status);

  const cumulativeGasUsed = getHex(txReceipt.cumulativeGasUsed).toArrayLike(Buffer, 'be');
  txReceiptData.push(cumulativeGasUsed);

  txReceiptData.push(txReceipt.logsBloom);

  let logsData = txReceipt.logs.map((log) => {
    const logEncoded: any[] = [];
    logEncoded.push(log.address);
    logEncoded.push(log.topics);
    logEncoded.push(log.data);
    return logEncoded;
  });
  if (logsData.length == 0){
    logsData = []
  } else{
    txReceiptData.push(logsData);
  }

  const my_array = [status, cumulativeGasUsed, txReceipt.logsBloom, logsData]

  let encodedTxReceipt = ethers.utils.RLP.encode(my_array);

  let type = ''
  if(txReceipt.type !== '0x0') {
    type = getHex(txReceipt.type).toArrayLike(Buffer, 'be').toString('hex');
  }
  encodedTxReceipt = encodedTxReceipt.slice(2);
  encodedTxReceipt = type + encodedTxReceipt;

  return encodedTxReceipt;
}

const getTx = async (txHash: string) => {
    const tx = await jsonProvider.getTransaction(txHash)
    return tx
}

const getBlock = async (blockNumber: number) => {
    const block = await jsonProvider.getBlock(blockNumber)
    return block
}

const getReceipt = async (txHash: string) => {
    const receipt = await jsonProvider.getTransactionReceipt(txHash)
    return receipt
}

// const fetchTrieData = async (txHash: string) => {
//     const tx = await getTx(txHash)
//     if(!tx) throw new Error('Transaction not found')
//     const blockNumber = tx.blockNumber
//     if(blockNumber === null) throw new Error('Block number is null')
//     const block = await getBlock(blockNumber)
//     if(!block) throw new Error('Block not found')
//     const receipts = await Promise.all(block.transactions.map(async (txHash) => {
//         const receipt = await getReceipt(txHash)
//         return receipt
//     }))
//     fs.writeFileSync('./tx.json', JSON.stringify({ tx, block, receipts}))
//     return { tx, block, receipts }
// }

const buildReceiptValue = (receipt: Receipts) => {
    return getReceiptBytes(receipt)
}

const buildTrie = async (tx: Tx, block: Block, receipts: Receipts[]): Promise<Trie> => {
    const trie = new Trie()
    await Promise.all(receipts.map(async (receipt, index) => {
        const encodedKey = encodeKey(receipt.transactionIndex)
        const key = Buffer.from(encodedKey.slice(2), 'hex')
        const value = Buffer.from(receiptfromRpc(receipt))
        // const value = Buffer.from(buildReceiptValue(receipt), 'hex')
        // if(index===6) console.log('key: ', key, 'value: ', value)
        return await trie.put(key, value)
    }))
    return trie
};

const treeFromProof = async ( proof: string[] ) => {
    const trie = new Trie()
    const parsedProof = proof.map((p) => {
      return new Uint8Array(arrayify(p))
    })
    await trie.fromProof(parsedProof)

    const myProof = await trie.findPath(new BN(6).toArrayLike(Buffer, 'be'))
    console.log('myProof: ', keccak256(Buffer.from(myProof.stack.map((p) => {
      return p.serialize()
    })[0])).toString('hex'))

    const leaf = await trie.findPath(new BN(6).toArrayLike(Buffer, 'be'))
    if (leaf.node !== null) {
      const decodedLeaf = ethers.utils.RLP.decode(leaf.node.serialize())[1]
      // console.log('decodedLeaf: ', decodedLeaf)
      console.log('original leaf hash: ', keccak256(Buffer.from(decodedLeaf, 'hex')).toString('hex'));
    }
    return
}

async function receiptProof(txHash: string) {
  const trie = await buildTrie(tx, block, receipts)

  const txIndex = receipts.find(receipt => receipt.transactionHash === txHash)?.transactionIndex

  if(!txIndex) throw new Error('Transaction not found')
  const encodedKey = encodeKey(txIndex)
  const key = Buffer.from(encodedKey.slice(2), 'hex')
  
  const proof = await trie.createProof(key)
  const path = await trie.findPath(key)

  if(path.node === null) throw new Error('Node not found')
  // console.log('Path: ', ethers.utils.RLP.decode(path.node.serialize())[1])
  console.log('my leaf hash: ', keccak256(Buffer.from(ethers.utils.RLP.decode(path.node.serialize())[1], 'hex')).toString('hex'))
  console.log('receiptRootHash: ', keccak256(Buffer.from(path.stack[0].serialize())).toString('hex'))

  // console.log('Path: ',path.stack.map((p)=> { return ethers.utils.RLP.decode(p.serialize()) }))

  return { trie , proof }
}

// const root = "0xf891a0c49e2e938ada575717a69f3ebf02bc00eae6a5a81aca0cf972ca8c4ed7a6c725a0df3cfdfe029fe3cfc55d15ae5d68f25dfe4e0533dd3a1f02683aabb0c135fad7a01b427218ef9b1a3972bebcff5aa19a69d6dd796bcce3b06e83a01715a652c7758080808080a0d72a93d293faf9c0c15390f7cde808adb44e618ca9cbd45cdeec53bc39a06eaf8080808080808080"

console.log('ReceiptRoot in the block: ', '0xab15fb10d50ad9c09d14bee8452f38addf0d993bda8825e14f34203eca444e7c')

const txHash = '0x01de701cb703ac362532fa4507df8f83a8463e4d528dc871e77038f7c0d39693'
const txProof = "0xf891a0c49e2e938ada575717a69f3ebf02bc00eae6a5a81aca0cf972ca8c4ed7a6c725a0df3cfdfe029fe3cfc55d15ae5d68f25dfe4e0533dd3a1f02683aabb0c135fad7a01b427218ef9b1a3972bebcff5aa19a69d6dd796bcce3b06e83a01715a652c7758080808080a0d72a93d293faf9c0c15390f7cde808adb44e618ca9cbd45cdeec53bc39a06eaf8080808080808080,0xf901f180a0daf5b84c6a7a62a8e84225ba8442bc2909d49757f29070e0f95cd2510b67d4f4a0ebf0ef0168560dcdf1609c01a925b3ec33671aafe4b937ca3206d03fbe18bdd7a019151f7e81b8e5943c49d331b31e4e944ecdab54024438d7a0c716200f7520d3a02025c31db234389dcb0750293a7b10ed33565c15e2c6c5e98d2cede9b584acf8a0c631f896f93ded0b220ee7c0d9cd9f3d9c39749d81a8a4b0c5db4bdf6ff18c80a051be24e670eab726561743f1c15debd2a71725559b75a6de0add6fd50f8e0806a04f89ddbd9d7c946993b04174ad4cca3c4ef323f36917186992ba6bd3cb171fd9a0298df0a40be33ec59543bbd6fd87308375362476502a69b06956c0efb42c884ca0ce12c0bdd2f219caf6ab8f4ad2dbd0b02198a8ed73ef1f0cf2ee09ac6f50c258a06ff9320faef70c77c101de246c5857f9ea5eeb90268923bdf5643dc155b0e2a7a01f66afe30f9db268c8cbf6ef3abccabf1c26dbb6edfba79e8a062a47cd454017a0fa12850f42519a47b6b047db6e1ab3f10a90ba789e7e09a0cd32bdf1227063e0a0df5d2ea2adb9eeadf65a6224878664e9db843122b7eafc0a0483d9062848a7cda0ce05d4dac0703f9c08b82cae4a854e01ec8b58e415c9f908b4be1544073db315a06119a0e3001c6d9b3ecaf2f4bd41b156ba723b02b5056b8de1ae42c6ff27fdf480,0xf904bb20b904b702f904b301831b8060b9010000000000000000000000000000000000000040000000000200000000000000100020000002000000000000000000000000000000000000400000000008000000004000000000000008000008000800000000000000000000000000000000000000040000020000800000000000000800000000000000000000000014000000000000000400000000000000000000000000000000280000000000000000000040000000004008020000000000000000000000000000000000000000000000000000001002000008000000000000000000000000000000000000000000000020011000000000000000000000080000000000000000000000000040000000000000f903a8f89b945d1477ea68bd8f52851597493e78b1df0972a525f863a0ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3efa00000000000000000000000000f577ef15a10d0321208deb49354acbbbe67d276a00000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000008ac7230489e80000f85894c9b7edc65488bdbb428526b03935090aef40ff03e1a0df21c415b78ed2552cc9971249e32a053abce6087a0ae0fbf3f78db5174a3493a00000000000000000000000000000000000000000000000000000d9c974568219f8d9946f3a314c1279148e53f51af154817c3ef2c827b1e1a0b0c632f55f1e1b3b2c3d82f41ee4716bb4c00f0f5d84cdafc141581bb8757a4fb8a000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002200010000000000000000000000000000000000000000000000000000000000030d40000000000000000000000000000000000000000000000000000000000000f8d99436ebea3941907c438ca8ca2b1065deef21ccdaede1a04e41ee13e03cd5e0446487b524fdc48af6acf26c074dacdbdfb6b574b42c8146b8a00000000000000000000000000000000000000000000000000000000000002776000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000005d1477ea68bd8f52851597493e78b1df0972a52500000000000000000000000000000000000000000000000000001df845f7a380f8f9946f3a314c1279148e53f51af154817c3ef2c827b1e1a0e9bded5f24a4168e4f3bf44e00298c993b22376aad8c58c7dda9718a54cbea82b8c000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000074000000000000013827895d1477ea68bd8f52851597493e78b1df0972a52527767b71a2ea00ea3c84d0889e98b73839ddeeed4cbd0000000000000000000000000f577ef15a10d0321208deb49354acbbbe67d2760000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000"
const leaf = "0xf904bb20b904b702f904b301831b8060b9010000000000000000000000000000000000000040000000000200000000000000100020000002000000000000000000000000000000000000400000000008000000004000000000000008000008000800000000000000000000000000000000000000040000020000800000000000000800000000000000000000000014000000000000000400000000000000000000000000000000280000000000000000000040000000004008020000000000000000000000000000000000000000000000000000001002000008000000000000000000000000000000000000000000000020011000000000000000000000080000000000000000000000000040000000000000f903a8f89b945d1477ea68bd8f52851597493e78b1df0972a525f863a0ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3efa00000000000000000000000000f577ef15a10d0321208deb49354acbbbe67d276a00000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000008ac7230489e80000f85894c9b7edc65488bdbb428526b03935090aef40ff03e1a0df21c415b78ed2552cc9971249e32a053abce6087a0ae0fbf3f78db5174a3493a00000000000000000000000000000000000000000000000000000d9c974568219f8d9946f3a314c1279148e53f51af154817c3ef2c827b1e1a0b0c632f55f1e1b3b2c3d82f41ee4716bb4c00f0f5d84cdafc141581bb8757a4fb8a000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002200010000000000000000000000000000000000000000000000000000000000030d40000000000000000000000000000000000000000000000000000000000000f8d99436ebea3941907c438ca8ca2b1065deef21ccdaede1a04e41ee13e03cd5e0446487b524fdc48af6acf26c074dacdbdfb6b574b42c8146b8a00000000000000000000000000000000000000000000000000000000000002776000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000005d1477ea68bd8f52851597493e78b1df0972a52500000000000000000000000000000000000000000000000000001df845f7a380f8f9946f3a314c1279148e53f51af154817c3ef2c827b1e1a0e9bded5f24a4168e4f3bf44e00298c993b22376aad8c58c7dda9718a54cbea82b8c000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000074000000000000013827895d1477ea68bd8f52851597493e78b1df0972a52527767b71a2ea00ea3c84d0889e98b73839ddeeed4cbd0000000000000000000000000f577ef15a10d0321208deb49354acbbbe67d2760000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000"
const txProofArray = txProof.split(',')
const trie = treeFromProof(txProofArray)
const firstProof = txProofArray[0]
receiptProof(txHash)
