/**
 * Inverse concentration factor Q/C for the Soil Screening Guidance volatilization factor, transcribed
 * from Table 3 of epa1996ssg (Part 2, page 27: "Q/C Values by Source Area, City, and Climatic Zone"),
 * in the published unit g/(m^2 s) per kg/m^3. Columns are the square source areas of 0.5, 1, 2, 5, 10
 * and 30 acres. The default for generic screening levels is Los Angeles, 0.5 acre (68.81), stated in the
 * text beside the table. Appendix D of the same document prints 68.82 and 78.06 for the 0.5 acre
 * Los Angeles and Salt Lake City rows from an earlier run; the document says the Table 3 values differ
 * from Appendix D by rounding, and Table 3 is used here.
 */

export const SSG_Q_OVER_C_AREAS_ACRES = [0.5, 1, 2, 5, 10, 30] as const;

export interface SsgQOverCRow {
  city: string;
  /** Climatic zone, roman numeral as printed. */
  zone: string;
  /** g/(m^2 s) per kg/m^3 for each of SSG_Q_OVER_C_AREAS_ACRES. */
  values: readonly number[];
}

export const SSG_Q_OVER_C_TABLE_3: readonly SsgQOverCRow[] = [
  { city: 'Seattle', zone: 'I', values: [82.72, 72.62, 64.38, 55.66, 50.09, 42.86] },
  { city: 'Salem', zone: 'I', values: [73.44, 64.42, 57.09, 49.33, 44.37, 37.94] },
  { city: 'Fresno', zone: 'II', values: [62.0, 54.37, 48.16, 41.57, 37.36, 31.9] },
  { city: 'Los Angeles', zone: 'II', values: [68.81, 60.24, 53.3, 45.93, 41.24, 35.15] },
  { city: 'San Francisco', zone: 'II', values: [89.51, 78.51, 69.55, 60.03, 53.95, 46.03] },
  { city: 'Las Vegas', zone: 'III', values: [95.55, 83.87, 74.38, 64.32, 57.9, 49.56] },
  { city: 'Phoenix', zone: 'III', values: [64.04, 56.07, 49.59, 42.72, 38.35, 32.68] },
  { city: 'Albuquerque', zone: 'III', values: [84.18, 73.82, 65.4, 56.47, 50.77, 43.37] },
  { city: 'Boise', zone: 'IV', values: [69.41, 60.88, 53.94, 46.57, 41.87, 35.75] },
  { city: 'Winnemucca', zone: 'IV', values: [69.23, 60.67, 53.72, 46.35, 41.65, 35.55] },
  { city: 'Salt Lake City', zone: 'IV', values: [78.09, 68.47, 60.66, 52.37, 47.08, 40.2] },
  { city: 'Casper', zone: 'IV', values: [100.13, 87.87, 77.91, 67.34, 60.59, 51.8] },
  { city: 'Denver', zone: 'IV', values: [75.59, 66.27, 58.68, 50.64, 45.52, 38.87] },
  { city: 'Bismark', zone: 'V', values: [83.39, 73.07, 64.71, 55.82, 50.16, 42.79] },
  { city: 'Minneapolis', zone: 'V', values: [90.8, 79.68, 70.64, 61.03, 54.9, 46.92] },
  { city: 'Lincoln', zone: 'V', values: [81.64, 71.47, 63.22, 54.47, 48.89, 41.65] },
  { city: 'Little Rock', zone: 'VI', values: [73.63, 64.51, 57.1, 49.23, 44.19, 37.64] },
  { city: 'Houston', zone: 'VI', values: [79.25, 69.47, 61.53, 53.11, 47.74, 40.76] },
  { city: 'Atlanta', zone: 'VI', values: [77.08, 67.56, 59.83, 51.62, 46.37, 39.54] },
  { city: 'Charleston', zone: 'VI', values: [74.89, 65.65, 58.13, 50.17, 45.08, 38.48] },
  { city: 'Raleigh-Durham', zone: 'VI', values: [77.26, 67.75, 60.01, 51.78, 46.51, 39.64] },
  { city: 'Chicago', zone: 'VII', values: [97.78, 85.81, 76.08, 65.75, 59.16, 50.6] },
  { city: 'Cleveland', zone: 'VII', values: [83.22, 73.06, 64.78, 55.99, 50.38, 43.08] },
  { city: 'Huntington', zone: 'VII', values: [53.89, 47.24, 41.83, 36.1, 32.43, 27.67] },
  { city: 'Harrisburg', zone: 'VII', values: [81.9, 71.87, 63.72, 55.07, 49.56, 42.4] },
  { city: 'Portland', zone: 'VIII', values: [74.23, 65.01, 57.52, 49.57, 44.49, 37.88] },
  { city: 'Hartford', zone: 'VIII', values: [71.35, 62.55, 55.4, 47.83, 43.0, 36.73] },
  { city: 'Philadelphia', zone: 'VIII', values: [90.24, 79.14, 70.14, 60.59, 54.5, 46.59] },
  { city: 'Miami', zone: 'IX', values: [85.61, 74.97, 66.33, 57.17, 51.33, 43.74] },
];

/** Default Q/C of the Soil Screening Guidance (Los Angeles, 0.5 acre), g/(m^2 s) per kg/m^3. */
export const SSG_DEFAULT_Q_OVER_C = 68.81;

/** Tabulated Q/C in the published unit for a city and one of the tabulated areas. */
export function ssgQOverC(city: string, acres: (typeof SSG_Q_OVER_C_AREAS_ACRES)[number]): number {
  const row = SSG_Q_OVER_C_TABLE_3.find((r) => r.city.toLowerCase() === city.toLowerCase());
  if (!row) throw new RangeError(`no Q/C row for city "${city}"`);
  const i = SSG_Q_OVER_C_AREAS_ACRES.indexOf(acres);
  if (i < 0) throw new RangeError(`no Q/C column for ${acres} acres`);
  return row.values[i] as number;
}

/** g/(m^2 s) per kg/m^3 (published) to SI, kg/(m^2 s) per kg/m^3 = m/s. */
export function qOverCToSi(qc: number): number {
  return qc * 1e-3;
}
