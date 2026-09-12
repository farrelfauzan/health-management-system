import {
  NotionBugBoardFieldProblem,
  NotionBugBoardFieldRequirement,
} from '@hms/shared-types';

import { NotionDataSource, NotionDataSourceProperty } from '../../../common/notion/notion.types';

type CheckBugBoardFieldsInput = {
  readonly dataSource: NotionDataSource;
  readonly requirements: readonly NotionBugBoardFieldRequirement[];
};

function readSelectOptionNames(property: NotionDataSourceProperty): string[] {
  return (property.select?.options ?? [])
    .map((option) => option.name)
    .filter((name): name is string => typeof name === 'string');
}

function checkOneField(
  dataSource: NotionDataSource,
  requirement: NotionBugBoardFieldRequirement,
): NotionBugBoardFieldProblem[] {
  const property = dataSource.properties?.[requirement.field];
  if (property === undefined) {
    return [{ field: requirement.field, expected: requirement.type, actual: 'missing' }];
  }
  if (property.type !== requirement.type) {
    return [
      {
        field: requirement.field,
        expected: requirement.type,
        actual: property.type ?? 'unknown',
      },
    ];
  }
  const presentOptions = readSelectOptionNames(property);
  return (requirement.options ?? [])
    .filter((option) => !presentOptions.includes(option))
    .map((option) => ({
      field: `${requirement.field} › ${option}`,
      expected: 'select option',
      actual: 'missing',
    }));
}

/**
 * Compares the Bug Board's live schema against what the publisher writes, and
 * returns one problem per thing that would reject a page (P23-T04).
 *
 * Every requirement is checked even after the first failure: an operator who
 * renamed three columns should fix three columns, not discover them one failed
 * test at a time. A wrong type short-circuits that field's option check —
 * a `Severity` that is no longer a select has no options to be missing, and
 * reporting four missing options on top of the type would bury the real cause.
 */
export function checkBugBoardFields({
  dataSource,
  requirements,
}: CheckBugBoardFieldsInput): NotionBugBoardFieldProblem[] {
  return requirements.flatMap((requirement) => checkOneField(dataSource, requirement));
}
