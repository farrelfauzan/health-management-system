import { isIpAllowed } from './is-ip-allowed';
import { parseIpAllowlistEntry } from '../../../common/bpjs-antrean/parse-ip-allowlist';

function buildAllowlist(entries: string[]) {
  return entries.map((entry) => {
    const parsed = parseIpAllowlistEntry(entry);
    if (parsed === null) {
      throw new Error(`test fixture is not a valid allowlist entry: ${entry}`);
    }
    return parsed;
  });
}

/**
 * The allowlist is the outermost gate on a public write surface, so these
 * cases are written as security properties rather than as parser coverage.
 * The first one is the one that matters most.
 */
describe('isIpAllowed', () => {
  it('denies everything when no range is configured', () => {
    // The whole "dark by default" property rests on this line. An empty
    // allowlist means BPJS has not told the clinic where it calls from yet
    // (spike question Q6), which can only be read as "nobody", never "anyone".
    expect(isIpAllowed('203.0.113.7', [])).toBe(false);
    expect(isIpAllowed('127.0.0.1', [])).toBe(false);
  });

  it('matches a bare address exactly', () => {
    const inputAllowlist = buildAllowlist(['203.0.113.7']);

    expect(isIpAllowed('203.0.113.7', inputAllowlist)).toBe(true);
    expect(isIpAllowed('203.0.113.8', inputAllowlist)).toBe(false);
  });

  it('matches inside a CIDR range and rejects just outside it', () => {
    const inputAllowlist = buildAllowlist(['203.0.113.0/24']);

    expect(isIpAllowed('203.0.113.0', inputAllowlist)).toBe(true);
    expect(isIpAllowed('203.0.113.255', inputAllowlist)).toBe(true);
    expect(isIpAllowed('203.0.114.0', inputAllowlist)).toBe(false);
    expect(isIpAllowed('203.0.112.255', inputAllowlist)).toBe(false);
  });

  it('honours a prefix that does not fall on a byte boundary', () => {
    const inputAllowlist = buildAllowlist(['10.1.0.0/20']);

    expect(isIpAllowed('10.1.15.255', inputAllowlist)).toBe(true);
    expect(isIpAllowed('10.1.16.0', inputAllowlist)).toBe(false);
  });

  it('folds an IPv4-mapped IPv6 source onto its IPv4 range', () => {
    // Node reports a dual-stack listener's IPv4 clients in this form. Without
    // the fold, an operator who allowlists their IPv4 ranges would silently
    // allow nobody — an outage that looks like a BPJS problem.
    const inputAllowlist = buildAllowlist(['203.0.113.0/24']);

    expect(isIpAllowed('::ffff:203.0.113.7', inputAllowlist)).toBe(true);
  });

  it('never matches across address families', () => {
    const inputIpv4Allowlist = buildAllowlist(['0.0.0.0/0']);
    const inputIpv6Allowlist = buildAllowlist(['::/0']);

    expect(isIpAllowed('2001:db8::1', inputIpv4Allowlist)).toBe(false);
    expect(isIpAllowed('203.0.113.7', inputIpv6Allowlist)).toBe(false);
  });

  it('matches IPv6 ranges', () => {
    const inputAllowlist = buildAllowlist(['2001:db8::/32']);

    expect(isIpAllowed('2001:db8:1234::9', inputAllowlist)).toBe(true);
    expect(isIpAllowed('2001:db9::1', inputAllowlist)).toBe(false);
  });

  it('denies an unparseable source address', () => {
    const inputAllowlist = buildAllowlist(['0.0.0.0/0']);

    expect(isIpAllowed('not-an-address', inputAllowlist)).toBe(false);
    expect(isIpAllowed('', inputAllowlist)).toBe(false);
  });
});

describe('parseIpAllowlistEntry', () => {
  it('rejects entries that are not addresses or ranges', () => {
    // The config turns a null here into a startup failure. An allowlist that
    // quietly drops what it could not parse is one the operator no longer
    // knows the contents of.
    expect(parseIpAllowlistEntry('203.0.113.0/33')).toBeNull();
    expect(parseIpAllowlistEntry('203.0.113.999')).toBeNull();
    expect(parseIpAllowlistEntry('hostname.example.com')).toBeNull();
  });

  it('treats a bare address as a full-width prefix', () => {
    expect(parseIpAllowlistEntry('203.0.113.7')?.prefixLength).toBe(32);
    expect(parseIpAllowlistEntry('2001:db8::1')?.prefixLength).toBe(128);
  });
});
