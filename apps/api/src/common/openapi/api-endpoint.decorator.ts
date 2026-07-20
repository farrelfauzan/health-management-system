import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

type ApiEndpointOptions = {
  readonly summary: string;
  readonly responseDescription: string;
  readonly responseExample: Record<string, unknown>;
  readonly requestType?: Type<unknown>;
  readonly requestExample?: Record<string, unknown>;
  readonly successStatus?: number;
};

type OpenApiSchema = {
  readonly type?: 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string';
  readonly items?: OpenApiSchema;
  readonly nullable?: boolean;
  readonly properties?: Record<string, OpenApiSchema>;
  readonly required?: string[];
};

const DEFAULT_SUCCESS_STATUS = 200;

function inferSchema(value: unknown): OpenApiSchema {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length > 0 ? inferSchema(value[0]) : {},
    };
  }
  if (value === null) {
    return { nullable: true };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: 'object',
      properties: Object.fromEntries(
        entries.map(([key, propertyValue]) => [key, inferSchema(propertyValue)]),
      ),
      required: entries.map(([key]) => key),
    };
  }
  if (typeof value === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number' };
  }
  return { type: typeof value as 'boolean' | 'string' };
}

/**
 * Documents an authenticated API operation with canonical HMS examples.
 */
export function ApiEndpoint(options: ApiEndpointOptions): MethodDecorator {
  const decorators: MethodDecorator[] = [
    ApiBearerAuth(),
    ApiOperation({ summary: options.summary }),
    ApiResponse({
      status: options.successStatus ?? DEFAULT_SUCCESS_STATUS,
      description: options.responseDescription,
      schema: {
        ...inferSchema(options.responseExample),
        example: options.responseExample,
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Authentication is required.',
      schema: {
        example: {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          },
        },
      },
    }),
    ApiResponse({
      status: 403,
      description: 'The authenticated user does not have the required permission.',
      schema: {
        example: {
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permission',
          },
        },
      },
    }),
  ];
  if (options.requestType && options.requestExample) {
    decorators.push(
      ApiBody({
        type: options.requestType,
        examples: {
          default: {
            summary: 'Valid request',
            value: options.requestExample,
          },
        },
      }),
    );
  }
  return applyDecorators(...decorators);
}
