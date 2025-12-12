import type { Static, TSchema } from "@sinclair/typebox";

export type Infer<T extends TSchema> = Static<T>;

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface SchemaConfig {
  body?: TSchema;
  query?: TSchema;
  params?: TSchema;
  response?: TSchema;
}
