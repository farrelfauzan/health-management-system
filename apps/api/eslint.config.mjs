import config from '@hms/config/eslint/base.mjs';

export default [
  ...config,
  {
    // SJ-14 acceptance criterion 2, as a rule rather than a review habit.
    //
    // A chat tool is safe because it calls a domain service passing the asking
    // user, which is what makes it inherit that service's row scoping. One
    // hand-built Prisma query inside `tools/` would bypass every scope check
    // in the module while still looking like a tool, and the offering rules
    // above it would go on reporting that the caller was allowed — the
    // permission they were checked for and the rows they got back would
    // simply stop being the same thing.
    //
    // It is left as a lint error rather than a test because the mistake is
    // made while writing a new tool, and this is the only check that fires
    // then rather than after.
    files: ['src/modules/ai-chatbot/tools/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/prisma/prisma.service', '**/generated/prisma', '**/generated/prisma/**'],
              message:
                'Chat tools must reach data through a domain service passing the asking user (SJ-14). A query built here inherits no row scoping.',
            },
            {
              group: ['**/repository/*.repository', '**/*.repository'],
              message:
                'Chat tools must call a domain service, never a repository — cross-module access goes through services, and the scope filter lives above the repository.',
            },
          ],
        },
      ],
    },
  },
];
