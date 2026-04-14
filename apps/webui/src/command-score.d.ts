declare module "command-score" {
  /**
   * Fuzzy score of `query` against `string`. Returns a number in [0, 1].
   * 0 = no match. Exact prefix matches score near 1.
   * Same scorer used internally by cmdk.
   */
  const commandScore: (string: string, query: string) => number;
  export default commandScore;
}
