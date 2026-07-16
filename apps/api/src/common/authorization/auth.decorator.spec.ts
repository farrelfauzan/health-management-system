import 'reflect-metadata';

import { PERMISSION_CHECKER_KEY } from './check-permissions.decorator';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';
import { Auth } from './auth.decorator';

describe('Auth decorator', () => {
  class TestController {
    @Auth([{ action: 'read', subject: 'Role' }])
    protectedRoute() {}

    @Auth([], { public: true })
    publicRoute() {}
  }

  it('sets permission metadata for protected route', () => {
    const metadata = Reflect.getMetadata(PERMISSION_CHECKER_KEY, TestController.prototype.protectedRoute);

    expect(metadata).toEqual([{ action: 'read', subject: 'Role' }]);
  });

  it('marks route as non-public by default', () => {
    const metadata = Reflect.getMetadata(PUBLIC_ROUTE_KEY, TestController.prototype.protectedRoute);

    expect(metadata).toBe(false);
  });

  it('marks route as public when option is enabled', () => {
    const metadata = Reflect.getMetadata(PUBLIC_ROUTE_KEY, TestController.prototype.publicRoute);

    expect(metadata).toBe(true);
  });
});
