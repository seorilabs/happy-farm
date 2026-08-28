describe('Jest ARC resource contract', () => {
  it('bounds worker concurrency and recycles retained heap', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jestConfig = require('../../jest.config.js') as {
      maxWorkers?: number;
      workerIdleMemoryLimit?: string;
    };

    expect(jestConfig.maxWorkers).toBe(2);
    expect(jestConfig.workerIdleMemoryLimit).toBe('768MB');
  });
});
