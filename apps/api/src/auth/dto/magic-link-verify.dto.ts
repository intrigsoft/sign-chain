import { IsString, Length } from 'class-validator';

export class MagicLinkVerifyDto {
  @IsString()
  @Length(6, 6)
  code: string;
}
