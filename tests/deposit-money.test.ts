import { validateDepositCommand, processDepositCommand, foldMoneyDepositedEvents } from '../src/features/deposit-money';
import { DepositMoneyCommand, MoneyDepositedEvent } from '../src/features/deposit-money';

describe('Deposit Money Core Functions', () => {
  describe('validateDepositCommand', () => {
    it('should return null for valid deposit command', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = validateDepositCommand(command);
      
      expect(result).toBeNull();
    });

    it('should return error for zero amount', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 0,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = validateDepositCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Deposit amount must be positive'
      });
    });

    it('should return error for negative amount', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: -50,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = validateDepositCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Deposit amount must be positive'
      });
    });

    it('should return error for amount below minimum', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 0.005,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = validateDepositCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Minimum deposit amount is 0.01'
      });
    });

    it('should return error for amount above maximum', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 2000000,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = validateDepositCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Maximum deposit amount is 1000000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'JPY',
        depositId: 'deposit-1'
      };

      const result = validateDepositCommand(command);
      
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('processDepositCommand', () => {
    it('should create event for valid deposit', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = processDepositCommand(command, []);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountId).toBe('test-account');
        expect(result.event.amount).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.depositId).toBe('deposit-1');
        expect(result.event.type).toBe('MoneyDeposited');
        expect(result.event.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should return error for duplicate deposit ID', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: 100,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = processDepositCommand(command, ['deposit-1']);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DuplicateDeposit');
        expect(result.error.message).toBe('Deposit ID already exists');
      }
    });

    it('should return error for invalid amount', () => {
      const command: DepositMoneyCommand = {
        accountId: 'test-account',
        amount: -50,
        currency: 'USD',
        depositId: 'deposit-1'
      };

      const result = processDepositCommand(command, []);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidAmount');
      }
    });
  });

  describe('foldMoneyDepositedEvents', () => {
    it('should return null for empty events array', () => {
      const result = foldMoneyDepositedEvents([]);
      
      expect(result).toBeNull();
    });

    it('should calculate balance for single deposit', () => {
      const events: MoneyDepositedEvent[] = [
        {
          type: 'MoneyDeposited',
          accountId: 'test-account',
          amount: 100,
          currency: 'USD',
          depositId: 'deposit-1',
          timestamp: new Date()
        }
      ];

      const result = foldMoneyDepositedEvents(events);
      
      expect(result).toEqual({
        accountId: 'test-account',
        balance: 100,
        currency: 'USD'
      });
    });

    it('should calculate balance for multiple deposits', () => {
      const events: MoneyDepositedEvent[] = [
        {
          type: 'MoneyDeposited',
          accountId: 'test-account',
          amount: 100,
          currency: 'USD',
          depositId: 'deposit-1',
          timestamp: new Date()
        },
        {
          type: 'MoneyDeposited',
          accountId: 'test-account',
          amount: 50,
          currency: 'USD',
          depositId: 'deposit-2',
          timestamp: new Date()
        },
        {
          type: 'MoneyDeposited',
          accountId: 'test-account',
          amount: 25,
          currency: 'USD',
          depositId: 'deposit-3',
          timestamp: new Date()
        }
      ];

      const result = foldMoneyDepositedEvents(events);
      
      expect(result).toEqual({
        accountId: 'test-account',
        balance: 175,
        currency: 'USD'
      });
    });
  });
});