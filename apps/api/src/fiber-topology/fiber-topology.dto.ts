import { IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const FIBER_ASSET_TYPES = ['OLT','ONU','CABINET','SPLITTER','FIBER_ROUTE','DROP_CABLE','POLE','PATCH_PANEL'] as const;
export const FIBER_ASSET_STATUSES = ['PLANNED','ACTIVE','DEGRADED','FAULTY','RETIRED'] as const;

export class CreateFiberAssetDto {
  @IsIn(FIBER_ASSET_TYPES) assetType!: typeof FIBER_ASSET_TYPES[number];
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MinLength(2) @MaxLength(80) assetCode!: string;
  @IsOptional() @IsIn(FIBER_ASSET_STATUSES) status?: typeof FIBER_ASSET_STATUSES[number];
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsUUID() parentAssetId?: string;
  @IsOptional() @IsUUID() routerId?: string;
  @IsOptional() @IsString() @MaxLength(120) vendor?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(160) serialNumber?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateFiberAssetDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsIn(FIBER_ASSET_STATUSES) status?: typeof FIBER_ASSET_STATUSES[number];
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsUUID() parentAssetId?: string | null;
  @IsOptional() @IsUUID() routerId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) vendor?: string | null;
  @IsOptional() @IsString() @MaxLength(120) model?: string | null;
  @IsOptional() @IsString() @MaxLength(160) serialNumber?: string | null;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
