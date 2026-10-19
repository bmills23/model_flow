import { describe, expect, it } from 'vitest';
import { csvHeader, defuseFormula, exportCsv, formatCsvNumber } from './csv';

describe('formatCsvNumber', () => {
  it('round-trips full double precision', () => {
    for (const n of [0.1 + 0.2, 1 / 3, 1e-300, 6.02214076e23, -0.000123, 0, 123456789.12345679]) {
      expect(Number(formatCsvNumber(n))).toBe(n);
    }
  });
  it('writes non-finite numbers as empty', () => {
    expect(formatCsvNumber(NaN)).toBe('');
    expect(formatCsvNumber(Infinity)).toBe('');
  });
});

describe('defuseFormula', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('prefixes %j', (s) => {
    expect(defuseFormula(s)).toBe(`'${s}`);
  });
  it('leaves ordinary text alone', () => {
    expect(defuseFormula('benzene')).toBe('benzene');
    expect(defuseFormula('a=b')).toBe('a=b');
    expect(defuseFormula('')).toBe('');
  });
});

describe('csvHeader', () => {
  it('puts the unit in the column name', () => {
    expect(csvHeader({ key: 'c', header: 'concentration', unit: 'mg/L' })).toBe(
      'concentration (mg/L)',
    );
    expect(csvHeader({ key: 'm', header: 'method' })).toBe('method');
  });
});

describe('exportCsv', () => {
  const cols = [
    { key: 'name', header: 'chemical' },
    { key: 'c', header: 'concentration', unit: 'mg/L' },
  ];
  it('writes a header and CRLF separated rows with a trailing CRLF', () => {
    const out = exportCsv([{ name: 'benzene', c: 0.5 }], cols);
    expect(out).toBe('chemical,concentration (mg/L)\r\nbenzene,0.5\r\n');
  });
  it('has no BOM', () => {
    expect(exportCsv([], cols).charCodeAt(0)).not.toBe(0xfeff);
    expect(exportCsv([], cols)).toBe('chemical,concentration (mg/L)\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    const out = exportCsv(
      [
        { name: 'a,b', c: 1 },
        { name: 'say "hi"', c: 2 },
        { name: 'l1\nl2', c: 3 },
      ],
      cols,
    );
    expect(out).toBe(
      'chemical,concentration (mg/L)\r\n"a,b",1\r\n"say ""hi""",2\r\n"l1\nl2",3\r\n',
    );
  });
  it('quotes header text that needs it', () => {
    expect(exportCsv([], [{ key: 'x', header: 'a,b', unit: 'm' }])).toBe('"a,b (m)"\r\n');
  });
  it('defuses formula text but keeps negative numbers numeric', () => {
    const out = exportCsv(
      [
        { name: '=cmd()', c: -2.5 },
        { name: '+x', c: 1 },
        { name: '@y', c: 1 },
        { name: '-z', c: 1 },
        { name: '\tt', c: 1 },
      ],
      cols,
    );
    const lines = out.split('\r\n');
    expect(lines[1]).toBe("'=cmd(),-2.5");
    expect(lines[2]).toBe("'+x,1");
    expect(lines[3]).toBe("'@y,1");
    expect(lines[4]).toBe("'-z,1");
    expect(lines[5]).toBe("'\tt,1");
  });
  it('quotes a defused cell that also has a carriage return', () => {
    const out = exportCsv([{ name: '\rr', c: 1 }], cols);
    expect(out).toContain('"\'\rr",1');
  });
  it('defuses the header text too', () => {
    expect(exportCsv([], [{ key: 'x', header: '=bad' }])).toBe("'=bad\r\n");
  });
  it('writes null, undefined and booleans sensibly', () => {
    const out = exportCsv(
      [{ name: null, c: undefined, f: true }],
      [...cols, { key: 'f', header: 'flag' }],
    );
    expect(out).toBe('chemical,concentration (mg/L),flag\r\n,,true\r\n');
  });
  it('carries a method column as plain text', () => {
    const out = exportCsv(
      [{ name: 'x', c: 2, method: 'm1' }],
      [...cols, { key: 'method', header: 'method' }],
    );
    expect(out).toBe('chemical,concentration (mg/L),method\r\nx,2,m1\r\n');
  });
});
