import { IsString } from 'class-validator';

export class RelayRequestDto {
  @IsString()
  compositeHash: string;

  @IsString()
  previousTxHash: string;

  @IsString()
  encryptedPayload: string;
}

export class RelayResponseDto {
  txHash: string;
  blockNumber: number;
}
