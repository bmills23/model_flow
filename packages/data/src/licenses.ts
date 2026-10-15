export interface PnpmLicensePackage {
  name: string;
  versions: string[];
  license: string;
  author?: string;
  homepage?: string;
  description?: string;
  paths?: string[];
}

/** Shape of `pnpm licenses list --json`: licence name to packages. */
export type PnpmLicenseReport = Record<string, PnpmLicensePackage[]>;

export function renderThirdPartyLicenses({
  report,
  generatedOn,
}: {
  report: PnpmLicenseReport;
  generatedOn: string;
}): string {
  const out: string[] = ['# Third-party licences', ''];
  out.push(
    `Generated ${generatedOn} from \`pnpm licenses list --json --prod -r\`. Do not edit by hand.`,
    '',
  );
  out.push(
    'This document lists the software this project depends on at runtime, grouped by licence. For the scientific methods and data sources, see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).',
    '',
  );
  for (const license of Object.keys(report).sort()) {
    const pkgs = [...(report[license] ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    out.push(`## ${license}`, '');
    for (const pkg of pkgs) {
      const parts = [`${pkg.name} ${[...pkg.versions].sort().join(', ')}`];
      if (pkg.author) parts.push(pkg.author);
      if (pkg.homepage) parts.push(`<${pkg.homepage}>`);
      out.push(`- ${parts.join(', ')}`);
    }
    out.push('');
  }
  return out.join('\n');
}
