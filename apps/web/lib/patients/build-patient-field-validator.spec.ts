import { createPatientSchema } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildPatientFieldValidator } from './build-patient-field-validator';

describe('buildPatientFieldValidator', () => {
  describe('editing an incomplete record (allowBlank)', () => {
    it('lets a blank through, so an unfilled field does not block the save', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.address,
        allowBlank: true,
      });

      expect(validate({ value: '' })).toBeUndefined();
    });

    it('treats whitespace as blank for the same reason', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.address,
        allowBlank: true,
      });

      expect(validate({ value: '   ' })).toBeUndefined();
    });

    it('still rejects a value the user typed but got wrong', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.address,
        allowBlank: true,
      });

      expect(validate({ value: 'ab' })).toBe('String must contain at least 3 character(s)');
    });

    it('still rejects a malformed date rather than passing it to the API', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.dateOfBirth,
        allowBlank: true,
      });

      expect(validate({ value: '12-03-1985' })).toBeDefined();
    });

    it('accepts a well-formed value', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.dateOfBirth,
        allowBlank: true,
      });

      expect(validate({ value: '1985-03-12' })).toBeUndefined();
    });
  });

  describe('creating a record (allowBlank off)', () => {
    it('rejects a blank, because a create must be complete', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.address,
        allowBlank: false,
      });

      expect(validate({ value: '' })).toBe('String must contain at least 3 character(s)');
    });

    it('rejects a missing birth date', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.dateOfBirth,
        allowBlank: false,
      });

      expect(validate({ value: '' })).toBeDefined();
    });

    it('accepts a complete value', () => {
      const validate = buildPatientFieldValidator({
        schema: createPatientSchema.shape.address,
        allowBlank: false,
      });

      expect(validate({ value: 'Jl. Merdeka No. 12' })).toBeUndefined();
    });
  });
});
