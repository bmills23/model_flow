/** Exhibit D-2 constants of epa2002ssg (printed page D-6): Q/C = A exp[(ln A_s - B)^2 / C], A_s in acres, Q/C in g/(m^2 s) per kg/m^3. */
export interface QOverC2002Station {
  zone: number;
  station: string;
  a: number;
  b: number;
  c: number;
}
export const QOVERC_2002_STATIONS: readonly QOverC2002Station[] = [
  { zone: 1, station: 'Salem, OR', a: 12.3783, b: 18.9683, c: 218.2086 },
  { zone: 1, station: 'Seattle, WA', a: 14.2253, b: 18.8366, c: 218.1845 },
  { zone: 2, station: 'Fresno, CA', a: 10.2152, b: 19.2654, c: 220.0604 },
  { zone: 2, station: 'Los Angeles, CA', a: 11.911, b: 18.4385, c: 209.7845 },
  { zone: 2, station: 'San Francisco, CA', a: 13.8139, b: 20.1624, c: 234.2869 },
  { zone: 3, station: 'Albuquerque, NM', a: 14.9421, b: 17.9869, c: 205.1782 },
  { zone: 3, station: 'Las Vegas, NV', a: 13.3093, b: 19.8387, c: 230.1652 },
  { zone: 3, station: 'Phoenix, AZ', a: 10.2871, b: 18.7124, c: 212.2704 },
  { zone: 4, station: 'Boise, ID', a: 11.3161, b: 19.6437, c: 224.8172 },
  { zone: 4, station: 'Casper, WY', a: 7.1414, b: 31.1794, c: 382.6078 },
  { zone: 4, station: 'Denver, CO', a: 11.3612, b: 19.3324, c: 221.2167 },
  { zone: 4, station: 'Salt Lake City, UT', a: 13.2559, b: 19.2978, c: 221.3379 },
  { zone: 4, station: 'Winnemucca, NV', a: 12.8784, b: 17.9804, c: 204.1028 },
  { zone: 5, station: 'Bismarck, ND', a: 15.0235, b: 18.2526, c: 207.3387 },
  { zone: 5, station: 'Lincoln, NE', a: 14.1901, b: 18.5634, c: 210.5281 },
  { zone: 5, station: 'Minneapolis, MN', a: 16.2302, b: 18.7762, c: 216.108 },
  { zone: 6, station: 'Atlanta, GA', a: 14.8349, b: 17.9259, c: 204.1516 },
  { zone: 6, station: 'Charleston, SC', a: 13.7674, b: 18.0441, c: 204.8689 },
  { zone: 6, station: 'Houston, TX', a: 13.6482, b: 18.1754, c: 206.7273 },
  { zone: 6, station: 'Little Rock, AR', a: 12.4964, b: 18.4476, c: 210.2128 },
  { zone: 6, station: 'Raleigh, NC', a: 12.3675, b: 18.6337, c: 212.7284 },
  { zone: 7, station: 'Chicago, IL', a: 16.8653, b: 18.7848, c: 215.0624 },
  { zone: 7, station: 'Cleveland, OH', a: 12.8612, b: 20.5164, c: 237.2798 },
  { zone: 7, station: 'Harrisburg, PA', a: 15.5169, b: 18.4248, c: 211.7679 },
  { zone: 7, station: 'Huntington, WV', a: 9.9253, b: 18.6636, c: 211.8862 },
  { zone: 8, station: 'Hartford, CT', a: 12.5907, b: 18.8368, c: 215.4377 },
  { zone: 8, station: 'Philadelphia, PA', a: 14.0111, b: 19.6154, c: 225.3397 },
  { zone: 8, station: 'Portland, ME', a: 10.466, b: 20.9077, c: 238.0318 },
  { zone: 9, station: 'Miami, FL', a: 12.196, b: 19.0645, c: 215.3923 },
];

/** Q/C, g/(m^2 s) per kg/m^3, for a station and source area in acres (valid 0.5 to 500). */
export function qOverC2002(station: string, areaAcres: number): number {
  const s = QOVERC_2002_STATIONS.find((x) => x.station === station);
  if (!s) throw new RangeError(`unknown Exhibit D-2 station "${station}"`);
  if (!Number.isFinite(areaAcres) || areaAcres < 0.5 || areaAcres > 500) {
    throw new RangeError(`source area must be within 0.5 to 500 acres, got ${areaAcres}`);
  }
  return s.a * Math.exp((Math.log(areaAcres) - s.b) ** 2 / s.c);
}
