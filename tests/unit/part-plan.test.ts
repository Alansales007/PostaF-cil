import { describe, expect, it } from 'vitest';
import { computePartPlan, getPartRange, DEFAULT_PART_SIZE_BYTES } from '@/lib/upload/part-plan';

describe('lib/upload/part-plan', () => {
  it('usa o tamanho padrão de parte para arquivos pequenos/médios', () => {
    const plan = computePartPlan(50 * 1024 * 1024); // 50MB
    expect(plan.partSize).toBe(DEFAULT_PART_SIZE_BYTES);
    expect(plan.totalParts).toBe(Math.ceil((50 * 1024 * 1024) / DEFAULT_PART_SIZE_BYTES));
  });

  it('aumenta o tamanho da parte para não estourar o limite de partes do S3', () => {
    const hugeFile = 200 * 1024 * 1024 * 1024; // 200GB hipotético
    const plan = computePartPlan(hugeFile);
    expect(plan.totalParts).toBeLessThanOrEqual(9500);
  });

  it('cobre o arquivo inteiro sem lacunas nem sobreposição entre partes', () => {
    const filesize = 20 * 1024 * 1024 + 137; // não múltiplo exato do partSize
    const plan = computePartPlan(filesize);

    let covered = 0;
    for (let i = 1; i <= plan.totalParts; i++) {
      const { start, end } = getPartRange(i, plan, filesize);
      expect(start).toBe(covered);
      covered = end;
    }
    expect(covered).toBe(filesize);
  });

  it('rejeita tamanho de arquivo inválido', () => {
    expect(() => computePartPlan(0)).toThrow();
    expect(() => computePartPlan(-1)).toThrow();
  });
});
