import { formatBytes } from '@app/utils/format';

describe('formatBytes', () => {
  it('should format zero bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes()).toBe('0 Bytes');
  });

  it('should format bytes', () => {
    expect(formatBytes(1)).toBe('1 Bytes');
    expect(formatBytes(512)).toBe('512 Bytes');
    expect(formatBytes(1023)).toBe('1023 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(5242880)).toBe('5 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(5368709120)).toBe('5 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB');
    expect(formatBytes(7696581394432)).toBe('7 TB');
  });

  it('should format large values (PB, EB, etc.)', () => {
    expect(formatBytes(1125899906842624)).toBe('1 PB');
    expect(formatBytes(1152921504606846976)).toBe('1 EB');
  });

  it('should round to 2 decimal places', () => {
    expect(formatBytes(1555)).toBe('1.52 KB');
    expect(formatBytes(1587456)).toBe('1.51 MB');
  });
});
