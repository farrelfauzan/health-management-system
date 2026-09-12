import { NotionBugBoardFieldRequirement } from '@hms/shared-types';

import { NotionDataSource } from '../../../common/notion/notion.types';
import { BUG_BOARD_REQUIRED_FIELDS } from './bug-board-required-fields';
import { checkBugBoardFields } from './check-bug-board-fields';

function buildSelectProperty(optionNames: readonly string[]) {
  return { type: 'select', select: { options: optionNames.map((name) => ({ name })) } };
}

/** A board that satisfies every requirement, built from the requirements themselves. */
function buildHealthyDataSource(): NotionDataSource {
  return {
    id: 'data-source-1',
    properties: Object.fromEntries(
      BUG_BOARD_REQUIRED_FIELDS.map((requirement) => [
        requirement.field,
        requirement.type === 'select'
          ? buildSelectProperty(requirement.options ?? [])
          : { type: requirement.type },
      ]),
    ),
  };
}

describe('checkBugBoardFields', () => {
  it('reports nothing for a board that matches every requirement', () => {
    const actualProblems = checkBugBoardFields({
      dataSource: buildHealthyDataSource(),
      requirements: BUG_BOARD_REQUIRED_FIELDS,
    });
    expect(actualProblems).toEqual([]);
  });

  it('names a renamed field as missing', () => {
    const inputDataSource = buildHealthyDataSource();
    delete (inputDataSource.properties as Record<string, unknown>).Severity;
    const actualProblems = checkBugBoardFields({
      dataSource: inputDataSource,
      requirements: BUG_BOARD_REQUIRED_FIELDS,
    });
    expect(actualProblems).toEqual([{ field: 'Severity', expected: 'select', actual: 'missing' }]);
  });

  it('names a retyped field with the type it actually has', () => {
    const inputDataSource = buildHealthyDataSource();
    (inputDataSource.properties as Record<string, unknown>)['Report ID'] = { type: 'number' };
    const actualProblems = checkBugBoardFields({
      dataSource: inputDataSource,
      requirements: BUG_BOARD_REQUIRED_FIELDS,
    });
    expect(actualProblems).toEqual([
      { field: 'Report ID', expected: 'rich_text', actual: 'number' },
    ]);
  });

  it('names a missing select option', () => {
    const inputDataSource = buildHealthyDataSource();
    (inputDataSource.properties as Record<string, unknown>)['Triaged By'] =
      buildSelectProperty(['AI']);
    const actualProblems = checkBugBoardFields({
      dataSource: inputDataSource,
      requirements: BUG_BOARD_REQUIRED_FIELDS,
    });
    expect(actualProblems).toEqual([
      { field: 'Triaged By › Fallback', expected: 'select option', actual: 'missing' },
    ]);
  });

  it('reports every problem at once, not just the first', () => {
    const inputDataSource = buildHealthyDataSource();
    delete (inputDataSource.properties as Record<string, unknown>).Clinic;
    delete (inputDataSource.properties as Record<string, unknown>).Page;
    const actualProblems = checkBugBoardFields({
      dataSource: inputDataSource,
      requirements: BUG_BOARD_REQUIRED_FIELDS,
    });
    expect(actualProblems.map((problem) => problem.field)).toEqual(['Clinic', 'Page']);
  });

  it('does not pile option problems on top of a wrong type', () => {
    const inputRequirements: NotionBugBoardFieldRequirement[] = [
      { field: 'Severity', type: 'select', options: ['P0 - Critical', 'P1 - High'] },
    ];
    const actualProblems = checkBugBoardFields({
      dataSource: { id: 'data-source-1', properties: { Severity: { type: 'rich_text' } } },
      requirements: inputRequirements,
    });
    expect(actualProblems).toEqual([
      { field: 'Severity', expected: 'select', actual: 'rich_text' },
    ]);
  });

  it('treats a board with no properties at all as every field missing', () => {
    const actualProblems = checkBugBoardFields({
      dataSource: { id: 'data-source-1' },
      requirements: BUG_BOARD_REQUIRED_FIELDS,
    });
    expect(actualProblems).toHaveLength(BUG_BOARD_REQUIRED_FIELDS.length);
  });
});
