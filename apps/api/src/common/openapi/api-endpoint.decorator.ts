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
  readonly isPublic?: boolean;
  readonly unauthorizedDescription?: string;
  readonly notFoundDescription?: string;
};

type OpenApiSchema = {
  readonly type?: 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string';
  readonly items?: OpenApiSchema;
  readonly nullable?: boolean;
  readonly properties?: Record<string, OpenApiSchema>;
  readonly required?: string[];
};

const DEFAULT_SUCCESS_STATUS = 200;

const OPTIONAL_EXAMPLE_MARKER = Symbol('optionalExampleValue');

type OptionalExample = { readonly [OPTIONAL_EXAMPLE_MARKER]: true; readonly value: unknown };

/**
 * Marks an example field as **present in this example but absent from some
 * real responses**, so the generated schema documents it as optional.
 *
 * Every response schema in this file is inferred from a canonical example, and
 * inference has no way to see a field that a *different* response would omit —
 * so without this, every documented field is `required`, and a genuinely
 * optional one becomes a lie the frontend's generated types then enforce. The
 * case that forced it is `PCS-T07`'s chat-created patient draft, which has no
 * date of birth and no address because §5.3 forbids asking for them over an
 * unauthenticated channel.
 *
 * The example payload still renders the value: what changes is only whether
 * the key appears in `required`. A reader of the docs should see a realistic
 * patient, not a hole.
 */
export function optionalExample<TValue>(value: TValue): TValue {
  return { [OPTIONAL_EXAMPLE_MARKER]: true, value } as unknown as TValue;
}

function isOptionalExample(value: unknown): value is OptionalExample {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[OPTIONAL_EXAMPLE_MARKER] === true
  );
}

/** Strips the optional markers so the rendered example is ordinary JSON. */
function unwrapExample(value: unknown): unknown {
  if (isOptionalExample(value)) {
    return unwrapExample(value.value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => unwrapExample(item));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, propertyValue]) => [
        key,
        unwrapExample(propertyValue),
      ]),
    );
  }
  return value;
}

function inferSchema(value: unknown): OpenApiSchema {
  if (isOptionalExample(value)) {
    return inferSchema(value.value);
  }
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
      required: entries
        .filter(([, propertyValue]) => !isOptionalExample(propertyValue))
        .map(([key]) => key),
    };
  }
  if (typeof value === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number' };
  }
  return { type: typeof value as 'boolean' | 'string' };
}

/**
 * Documents an API operation with canonical HMS examples. Authenticated by
 * default; pass isPublic for routes outside the bearer guard. Documents 400
 * automatically whenever a request body is declared, 401/403 for
 * authenticated routes, and 404 when notFoundDescription is provided.
 */
export function ApiEndpoint(options: ApiEndpointOptions): MethodDecorator {
  const decorators: MethodDecorator[] = [
    ApiOperation({ summary: options.summary }),
    ApiResponse({
      status: options.successStatus ?? DEFAULT_SUCCESS_STATUS,
      description: options.responseDescription,
      schema: {
        ...inferSchema(options.responseExample),
        example: unwrapExample(options.responseExample),
      },
    }),
  ];
  if (!options.isPublic) {
    decorators.unshift(ApiBearerAuth());
    decorators.push(
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
    );
  }
  if (!options.isPublic || options.unauthorizedDescription) {
    decorators.push(
      ApiResponse({
        status: 401,
        description: options.unauthorizedDescription ?? 'Authentication is required.',
        schema: {
          example: {
            error: {
              code: 'UNAUTHORIZED',
              message: options.unauthorizedDescription ?? 'Authentication is required',
            },
          },
        },
      }),
    );
  }
  if (options.notFoundDescription) {
    decorators.push(
      ApiResponse({
        status: 404,
        description: options.notFoundDescription,
        schema: {
          example: {
            error: {
              code: 'NOT_FOUND',
              message: options.notFoundDescription,
            },
          },
        },
      }),
    );
  }
  if (options.requestType && options.requestExample) {
    decorators.push(
      ApiResponse({
        status: 400,
        description: 'Request validation failed.',
        schema: {
          example: {
            error: {
              code: 'BAD_REQUEST',
              message: 'Request validation failed',
            },
          },
        },
      }),
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
