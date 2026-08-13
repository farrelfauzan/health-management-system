import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { AuditedRouteOptions } from './audit.types';
import { NoStoreInterceptor } from './no-store.interceptor';

describe('NoStoreInterceptor (SJ-9)', () => {
  const setHeaderMock = jest.fn();

  function buildContext(contextType: 'http' | 'ws' = 'http'): ExecutionContext {
    return {
      getType: () => contextType,
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getResponse: () => ({ setHeader: setHeaderMock }) }),
    } as unknown as ExecutionContext;
  }

  function buildInterceptor(options: AuditedRouteOptions | undefined): NoStoreInterceptor {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options);
    return new NoStoreInterceptor(reflector);
  }

  const nextHandler: CallHandler = { handle: () => of({ data: 'ok' }) };

  beforeEach(() => {
    setHeaderMock.mockClear();
  });

  it('marks an audited patient-data response uncacheable', async () => {
    const interceptor = buildInterceptor({ resource: 'patient', action: 'READ' });

    await new Promise((resolve) =>
      interceptor.intercept(buildContext(), nextHandler).subscribe(resolve),
    );

    expect(setHeaderMock).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private',
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(setHeaderMock).toHaveBeenCalledWith('Expires', '0');
  });

  /**
   * Everything else stays cacheable. Blanket `no-store` across the API would
   * cost the clinic every conditional request it currently gets for free —
   * reference data, the ICD-10 catalogue — for no privacy gain.
   */
  it('leaves an unaudited route alone', async () => {
    const interceptor = buildInterceptor(undefined);

    await new Promise((resolve) =>
      interceptor.intercept(buildContext(), nextHandler).subscribe(resolve),
    );

    expect(setHeaderMock).not.toHaveBeenCalled();
  });

  it('ignores non-http contexts', async () => {
    const interceptor = buildInterceptor({ resource: 'patient', action: 'READ' });

    await new Promise((resolve) =>
      interceptor.intercept(buildContext('ws'), nextHandler).subscribe(resolve),
    );

    expect(setHeaderMock).not.toHaveBeenCalled();
  });
});
