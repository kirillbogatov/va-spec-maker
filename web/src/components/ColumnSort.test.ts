import { expect, it } from 'vitest';
import { sortByColumn } from './ColumnSort';

it('сортирует значения по возрастанию и убыванию без изменения исходного порядка данных', () => {
  const rows = [{ name: 'INT_10', active: false }, { name: 'INT_2', active: true }, { name: 'INT_1', active: true }];
  const value = (row: typeof rows[number], key: string) => key === 'active' ? row.active : row.name;
  expect(sortByColumn(rows, { key: 'name', direction: 'ascending' }, value).map((r) => r.name)).toEqual(['INT_1', 'INT_2', 'INT_10']);
  expect(sortByColumn(rows, { key: 'name', direction: 'descending' }, value).map((r) => r.name)).toEqual(['INT_10', 'INT_2', 'INT_1']);
  expect(sortByColumn(rows, { key: 'active', direction: 'ascending' }, value).map((r) => r.name)).toEqual(['INT_10', 'INT_2', 'INT_1']);
  expect(rows.map((r) => r.name)).toEqual(['INT_10', 'INT_2', 'INT_1']);
  expect(sortByColumn(rows, null, value)).toBe(rows);
});
