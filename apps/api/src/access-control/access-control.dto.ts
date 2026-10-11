import { IsBoolean } from 'class-validator';
export class SetPermissionOverrideDto { @IsBoolean() allowed!: boolean; }
