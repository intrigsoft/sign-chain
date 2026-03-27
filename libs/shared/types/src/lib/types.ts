export interface AnchorEntry {
  txHash: string;
  compositeHash: string;
  signer: string;
  timestamp: number;
  previousTxHash: string;
}

export interface VerifyApiResult extends AnchorEntry {
  chain: AnchorEntry[];
  encryptedPayload?: string;
}

export interface SignerPayload {
  d: string; // doc hash
  s: {
    t: string; // signer type
    n: string; // name
    e: string; // email
    c?: string; // company
    p?: string; // position
    tr?: string; // trust anchor
    v?: boolean; // verified
  };
  ts: number; // unix timestamp
  g?: { la: number; ln: number }; // geo
  salt: string;
}
