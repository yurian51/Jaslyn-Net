import { stripOuterTransactionWrapper } from './migration-sql';

describe('stripOuterTransactionWrapper', () => {
  it('removes optional outer BEGIN and COMMIT statements', () => {
    expect(stripOuterTransactionWrapper('BEGIN;\nCREATE TABLE sample(id int);\nCOMMIT;'))
      .toBe('\nCREATE TABLE sample(id int);\n');
  });

  it('preserves SQL without an outer transaction wrapper', () => {
    const sql = 'CREATE TABLE sample(id int);\n';
    expect(stripOuterTransactionWrapper(sql)).toBe(sql);
  });

  it('does not remove a PL/pgSQL block BEGIN inside a migration', () => {
    const sql = 'DO $$\nBEGIN\n  PERFORM 1;\nEND $$;\n';
    expect(stripOuterTransactionWrapper(sql)).toBe(sql);
  });
});
