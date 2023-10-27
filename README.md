# EVM Receipt Proof generator

To run it: 
```bash
npm run start
```

### Notes 
There are two ways to parse the receipt:
1. Using the `receiptfromRpc` function
2. Using the `getReceiptBytes` function

One of them should be called in `buildTree` to get the value that is going to be stored in the tree.