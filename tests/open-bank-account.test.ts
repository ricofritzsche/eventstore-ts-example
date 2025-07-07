import { validateOpenAccountCommand, processOpenAccountCommand } from '../src/features/open-bank-account/core';
import { OpenBankAccountCommand } from '../src/features/open-bank-account/types';

describe('Open Bank Account Core Functions', () => {
  describe('validateOpenAccountCommand', () => {
    it('should return null for valid command with all fields', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: 100,
        currency: 'USD'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toBeNull();
    });

    it('should return null for valid command with no initial deposit', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'savings',
        currency: 'EUR'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toBeNull();
    });

    it('should return error for empty customer name', () => {
      const command: OpenBankAccountCommand = {
        customerName: '',
        accountType: 'checking',
        currency: 'USD'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCustomerName',
        message: 'Customer name is required'
      });
    });

    it('should return error for customer name with only whitespace', () => {
      const command: OpenBankAccountCommand = {
        customerName: '   ',
        accountType: 'checking',
        currency: 'USD'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCustomerName',
        message: 'Customer name is required'
      });
    });

    it('should return error for customer name too short', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'A',
        accountType: 'checking',
        currency: 'USD'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCustomerName',
        message: 'Customer name must be at least 2 characters'
      });
    });

    it('should return error for negative initial deposit', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: -10,
        currency: 'USD'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidInitialDeposit',
        message: 'Initial deposit cannot be negative'
      });
    });

    it('should return error for initial deposit exceeding maximum', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: 2000000,
        currency: 'USD'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidInitialDeposit',
        message: 'Initial deposit cannot exceed 1000000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        currency: 'JPY'
      };

      const result = validateOpenAccountCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });

    it('should accept all supported currencies', () => {
      const currencies = ['USD', 'EUR', 'GBP'];
      
      currencies.forEach(currency => {
        const command: OpenBankAccountCommand = {
          customerName: 'John Doe',
          accountType: 'checking',
          currency
        };

        const result = validateOpenAccountCommand(command);
        expect(result).toBeNull();
      });
    });
  });

  describe('processOpenAccountCommand', () => {
    it('should create event for valid command with initial deposit', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: 100,
        currency: 'USD'
      };
      const accountId = 'test-account-id';

      const result = processOpenAccountCommand(command, accountId);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountId).toBe(accountId);
        expect(result.event.customerName).toBe('John Doe');
        expect(result.event.accountType).toBe('checking');
        expect(result.event.initialDeposit).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.type).toBe('BankAccountOpened');
        expect(result.event.openedAt).toBeInstanceOf(Date);
      }
    });

    it('should create event with default 0 deposit when not provided', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'Jane Smith',
        accountType: 'savings',
        currency: 'EUR'
      };
      const accountId = 'test-account-id-2';

      const result = processOpenAccountCommand(command, accountId);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.initialDeposit).toBe(0);
        expect(result.event.customerName).toBe('Jane Smith');
        expect(result.event.accountType).toBe('savings');
        expect(result.event.currency).toBe('EUR');
      }
    });

    it('should trim customer name whitespace', () => {
      const command: OpenBankAccountCommand = {
        customerName: '  John Doe  ',
        accountType: 'checking',
        currency: 'USD'
      };
      const accountId = 'test-account-id-3';

      const result = processOpenAccountCommand(command, accountId);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.customerName).toBe('John Doe');
      }
    });

    it('should return error for invalid command', () => {
      const command: OpenBankAccountCommand = {
        customerName: '',
        accountType: 'checking',
        currency: 'USD'
      };
      const accountId = 'test-account-id-4';

      const result = processOpenAccountCommand(command, accountId);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidCustomerName');
      }
    });
  });
});