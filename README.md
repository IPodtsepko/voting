# Simple voting contract

## Description

This contract allows users to vote for proposals, using token balances. Users own an ERC20 token (VotingToken, VTK), representing "voting power". Proposals are simply the keccak256 hashes and can be "accepted", "rejected" or "discarded" (if time-to-life of proposal is expired). Votes can be "for" or "against" the proposal. Proposal becomes "accepted" or "rejected" completed if more then 50% of votes for the same decision ("for" or "against") is gathered.

## Running tests

First, you need to install some node modules:
```
$ npm install
```

Secondly, run the tests with the following command:
```
$ npm test

> voting@1.0.0 test
> hardhat test

Compiled 7 Solidity files successfully


  VotingToken contract
    Deployment
      ✔ Should set the right owner (1095ms)
      ✔ Should assign the total supply of tokens to the owner
      ✔ Shoud have valid totalSupply
    Transactions
      ✔ Should transfer tokens between accounts (154ms)
      ✔ Should create active proposal and emit 'ProposalCreated' even (58ms)
      ✔ Must be discarded over time (79ms)
      ✔ Up to three proposals must be created (152ms)
      ✔ The creation of proposals should be reverted in case of duplication or if the queue is full (1275ms)
      ✔ Should react to votes and transfers (135ms)
      ✔ The oldest discarded proposal should be ousted (188ms)


  10 passing (3s)
```
