import {
  IsString,
  IsNumber,
  IsArray,
  IsDateString,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SyncSignatureDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsString()
  base64Png: string;

  @IsDateString()
  updatedAt: string;
}

export class SyncTextSnippetDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsString()
  text: string;

  @IsNumber()
  fontSize: number;

  @IsDateString()
  updatedAt: string;
}

export class SyncLibraryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSignatureDto)
  @IsOptional()
  signatures: SyncSignatureDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncTextSnippetDto)
  @IsOptional()
  textSnippets: SyncTextSnippetDto[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  deletedSignatureIds: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  deletedSnippetIds: string[] = [];
}
