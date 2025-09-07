import { Source } from "./sources";
import { Type } from "./types";

export interface Response {
  description: string;
  type: Type;
  source: Source;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  nativeTransfers: [
    {
      fromUserAccount: string;
      toUserAccount: string;
      amount: number;
    }
  ];
  tokenTransfers: [
    {
      fromUserAccount: string;
      toUserAccount: string;
      fromTokenAccount: string;
      toTokenAccount: string;
      tokenAmount: number;
      mint: string;
    }
  ];
  accountData: [
    {
      account: string;
      nativeBalanceChange: number;
      tokenBalanceChanges: [
        {
          userAccount: string;
          tokenAccount: string;
          mint: string;
          rawTokenAmount: {
            tokenAmount: string;
            decimals: number;
          };
        }
      ];
    }
  ];
  transactionError: {
    error: string;
  };
  instructions: [
    {
      accounts: string[];
      data: string;
      programId: string;
      innerInstructions: [
        {
          accounts: string[];
          data: string;
          programId: string;
        }
      ];
    }
  ];
  events: {
    nft: {
      description: string;
      type: Type;
      source: Source;
      amount: number;
      fee: number;
      feePayer: string;
      signature: string;
      slot: number;
      timestamp: number;
      saleType: string;
      buyer: string;
      seller: string;
      staker: string;
      nfts: [
        {
          mint: string;
          tokenStandard: string;
        }
      ];
    };
    swap: {
      nativeInput: {
        account: string;
        amount: string;
      };
      nativeOutput: {
        account: string;
        amount: string;
      };
      tokenInputs: [
        {
          userAccount: string;
          tokenAccount: string;
          mint: string;
          rawTokenAmount: {
            tokenAmount: string;
            decimals: number;
          };
        }
      ];
      tokenOutputs: [
        {
          userAccount: string;
          tokenAccount: string;
          mint: string;
          rawTokenAmount: {
            tokenAmount: string;
            decimals: number;
          };
        }
      ];
      tokenFees: [
        {
          userAccount: string;
          tokenAccount: string;
          mint: string;
          rawTokenAmount: {
            tokenAmount: string;
            decimals: number;
          };
        }
      ];
      nativeFees: [
        {
          account: string;
          amount: string;
        }
      ];
      innerSwaps: [
        {
          tokenInputs: [
            {
              fromUserAccount: string;
              toUserAccount: string;
              fromTokenAccount: string;
              toTokenAccount: string;
              tokenAmount: number;
              mint: string;
            }
          ];
          tokenOutputs: [
            {
              fromUserAccount: string;
              toUserAccount: string;
              fromTokenAccount: string;
              toTokenAccount: string;
              tokenAmount: number;
              mint: string;
            }
          ];
          tokenFees: [
            {
              fromUserAccount: string;
              toUserAccount: string;
              fromTokenAccount: string;
              toTokenAccount: string;
              tokenAmount: number;
              mint: string;
            }
          ];
          nativeFees: [
            {
              fromUserAccount: string;
              toUserAccount: string;
              amount: number;
            }
          ];
          programInfo: {
            source: Source;
            account: string;
            programName: string;
            instructionName: string;
          };
        }
      ];
    };
    compressed: {
      type: Type;
      treeId: string;
      assetId: string;
      leafIndex: number;
      instructionIndex: number;
      innerInstructionIndex: number;
      newLeafOwner: string;
      oldLeafOwner: string;
    };
    distributeCompressionRewards: {
      amount: number;
    };
    setAuthority: {
      account: string;
      from: string;
      to: string;
      instructionIndex: number;
      innerInstructionIndex: number;
    };
  };
}
