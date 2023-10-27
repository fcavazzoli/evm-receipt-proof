export interface Root {
    tx: Tx
    block: Block
    receipts: Receipts[]
}

export interface Tx {
    _type: string
    accessList: any[]
    blockNumber: number
    blockHash: string
    chainId: string
    data: string
    from: string
    gasLimit: string
    gasPrice: string
    hash: string
    maxFeePerGas: string
    maxPriorityFeePerGas: string
    nonce: number
    signature: Signature
    to: string
    type: number
    value: string
}
  
export interface Signature {
    _type: string
    networkV: any
    r: string
    s: string
    v: number
}

export interface Root {
    block: Block
}
  
export interface Block {
    _type: string
    baseFeePerGas: string
    difficulty: string
    extraData: string
    gasLimit: string
    gasUsed: string
    hash: string
    miner: string
    nonce: string
    number: number
    parentHash: string
    receiptsRoot: string
    timestamp: number
    transactions: string[]
}

export interface Receipts {
    blockHash: string
    blockNumber: string
    contractAddress: any
    cumulativeGasUsed: string
    effectiveGasPrice: string
    from: string
    gasUsed: string
    logs: any[]
    logsBloom: string
    status: string
    to: string
    transactionHash: string
    transactionIndex: string
    type: string
}
  
export interface Log {
    _type: string
    address: string
    blockHash: string
    blockNumber: number
    data: string
    index: number
    topics: string[]
    transactionHash: string
    transactionIndex: number
}