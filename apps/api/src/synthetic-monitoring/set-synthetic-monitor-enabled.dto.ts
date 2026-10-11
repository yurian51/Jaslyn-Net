import { IsBoolean } from 'class-validator';
export class SetSyntheticMonitorEnabledDto { @IsBoolean() enabled!: boolean; }
