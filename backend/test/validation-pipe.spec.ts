import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { createBaseValidationPipe } from '../src/common/base-validation.pipe';

class QuantityInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

describe('base validation pipe', () => {
  const pipe = createBaseValidationPipe();
  const metadata = { type: 'body' as const, metatype: QuantityInput, data: undefined };

  it('transforms valid DTO values and rejects unknown fields', async () => {
    const result = await pipe.transform({ quantity: '2' }, metadata);
    expect(result).toBeInstanceOf(QuantityInput);
    expect(result.quantity).toBe(2);
    await expect(pipe.transform({ quantity: '2', internal: 'unexpected' }, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid values rather than passing them through', async () => {
    await expect(pipe.transform({ quantity: 'not-an-integer' }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ quantity: 0 }, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });
});
