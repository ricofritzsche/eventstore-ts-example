import { validateTransferCommand, processTransferCommand } from '../src/features/transfer-money/core';
import { TransferMoneyCommand } from '../src/features/transfer-money/types';

describe('Transfer Money Core Functions', () => {
  describe('validateTransferCommand', () => {
    it('should return null for valid transfer command', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toBeNull();
    });

    it('should return error for same account transfer', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-1',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toEqual({
        type: 'SameAccount',
        message: 'Cannot transfer to the same account'
      });
    });

    it('should return error for zero amount', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 0,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Transfer amount must be positive'
      });
    });

    it('should return error for negative amount', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: -50,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Transfer amount must be positive'
      });
    });

    it('should return error for amount below minimum', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 0.005,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Minimum transfer amount is 0.01'
      });
    });

    it('should return error for amount above maximum', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 60000,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Maximum transfer amount is 50000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 100,
        currency: 'JPY',
        transferId: 'transfer-1'
      };

      const result = validateTransferCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('processTransferCommand', () => {
    it('should create event for valid transfer with sufficient balance', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = processTransferCommand(command, 500, []);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.fromAccountId).toBe('account-1');
        expect(result.event.toAccountId).toBe('account-2');
        expect(result.event.amount).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.transferId).toBe('transfer-1');
        expect(result.event.type).toBe('MoneyTransferred');
        expect(result.event.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should return error for insufficient funds', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = processTransferCommand(command, 50, []);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InsufficientFunds');
        expect(result.error.message).toBe('Insufficient funds for transfer');
      }
    });

    it('should return error for duplicate transfer ID', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = processTransferCommand(command, 500, ['transfer-1']);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DuplicateTransfer');
        expect(result.error.message).toBe('Transfer ID already exists');
      }
    });

    it('should return error for same account validation', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-1',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = processTransferCommand(command, 500, []);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('SameAccount');
      }
    });

    it('should allow transfer of exact balance', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: 100,
        currency: 'USD',
        transferId: 'transfer-1'
      };

      const result = processTransferCommand(command, 100, []);
      
      expect(result.success).toBe(true);
    });
  });
});