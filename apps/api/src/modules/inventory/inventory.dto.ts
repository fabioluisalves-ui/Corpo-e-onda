import { IsInt, IsOptional, IsPositive, IsString, MinLength, IsIn, IsBoolean } from 'class-validator';

export class ProductionEntryDto {
  @IsString() @MinLength(1)
  barcodeOrSku!: string;

  @IsInt() @IsPositive()
  quantity!: number;

  @IsOptional() @IsString()
  reason?: string;

  @IsOptional() @IsInt() @IsPositive()
  labelsToPrint?: number;
}

export class ManualSaleDto {
  @IsString() @MinLength(1)
  barcodeOrSku!: string;

  @IsInt() @IsPositive()
  quantity!: number;

  @IsOptional() @IsString()
  reason?: string;
}

export class AdjustmentDto {
  @IsString() @MinLength(1)
  barcodeOrSku!: string;

  @IsInt() @IsPositive()
  quantity!: number;

  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @IsString() @MinLength(3)
  reason!: string;

  @IsOptional() @IsBoolean()
  allowNegative?: boolean;
}

export class AssembleKitDto {
  @IsString() @MinLength(1)
  kitBarcodeOrSku!: string;

  @IsInt() @IsPositive()
  quantity!: number;
}
