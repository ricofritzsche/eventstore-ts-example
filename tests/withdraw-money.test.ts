import { validateWithdrawCommand, processWithdrawCommand } from '../src/features/withdraw-money/core';
import { WithdrawMoneyCommand } from '../src/features/withdraw-money/types';

describe('Withdraw Money Core Functions', () => {
  describe('validateWithdrawCommand', () => {
    it('should return null for valid withdrawal command', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = validateWithdrawCommand(command);
      
      expect(result).toBeNull();
    });

    it('should return error for zero amount', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 0,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = validateWithdrawCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Withdrawal amount must be positive'
      });
    });

    it('should return error for negative amount', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: -50,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = validateWithdrawCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Withdrawal amount must be positive'
      });
    });

    it('should return error for amount below minimum', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 0.005,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = validateWithdrawCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Minimum withdrawal amount is 0.01'
      });
    });

    it('should return error for amount above maximum', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 15000,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = validateWithdrawCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Maximum withdrawal amount is 10000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'JPY',
        withdrawalId: 'withdrawal-1'
      };

      const result = validateWithdrawCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('processWithdrawCommand', () => {
    it('should create event for valid withdrawal with sufficient balance', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = processWithdrawCommand(command, 500, []);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountId).toBe('test-account');
        expect(result.event.amount).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.withdrawalId).toBe('withdrawal-1');
        expect(result.event.type).toBe('MoneyWithdrawn');
        expect(result.event.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should return error for insufficient funds', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = processWithdrawCommand(command, 50, []);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InsufficientFunds');
        expect(result.error.message).toBe('Insufficient funds for withdrawal');
      }
    });

    it('should return error for duplicate withdrawal ID', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = processWithdrawCommand(command, 500, ['withdrawal-1']);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DuplicateWithdrawal');
        expect(result.error.message).toBe('Withdrawal ID already exists');
      }
    });

    it('should return error for invalid amount', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: -50,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = processWithdrawCommand(command, 500, []);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidAmount');
      }
    });

    it('should allow withdrawal of exact balance', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'withdrawal-1'
      };

      const result = processWithdrawCommand(command, 100, []);
      
      expect(result.success).toBe(true);
    });
  });
});